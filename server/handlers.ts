import { randomUUID } from "node:crypto"
import type { Server, Socket } from "socket.io"
import type {
  ClientToServer,
  ServerToClient,
  ErrorCode,
} from "../shared/protocol.ts"
import { LIMITS } from "../shared/protocol.ts"
import { sanitizeName } from "./names.ts"
import {
  type Room,
  getRoom,
  isFull,
  createStrangerRoom,
  createPublicRoom,
  createPrivateRoom,
  findPrivateRoom,
  publicDirectory,
  addMember,
  removeMember,
} from "./rooms.ts"

type IO = Server<ClientToServer, ServerToClient>
type Sock = Socket<ClientToServer, ServerToClient>

/** per-socket ephemeral session — dies with the connection */
interface Session {
  name: string
  roomId: string | null
  /** token bucket for rate limiting */
  tokens: number
  lastRefill: number
}

const sessions = new Map<string, Session>()
/** waiting queue for stranger matching (socket ids, FIFO) */
const queue: string[] = []

/**
 * Socket.IO room used purely as a broadcast channel for directory watchers.
 * It is NOT a chat room and never appears in any registry.
 */
const DIRECTORY_CHANNEL = "watch:directory"

function fail(socket: Sock, code: ErrorCode, message: string): void {
  socket.emit("app:error", { code, message })
}

function takeToken(s: Session): boolean {
  const now = Date.now()
  s.tokens = Math.min(
    LIMITS.RATE_BURST,
    s.tokens + ((now - s.lastRefill) / 1000) * LIMITS.RATE_REFILL_PER_SEC
  )
  s.lastRefill = now
  if (s.tokens < 1) return false
  s.tokens -= 1
  return true
}

function dropFromQueue(socketId: string): void {
  const i = queue.indexOf(socketId)
  if (i !== -1) queue.splice(i, 1)
}

/** push the fresh public directory to everyone watching the gate */
function broadcastDirectory(io: IO): void {
  io.to(DIRECTORY_CHANNEL).emit("directory:update", {
    rooms: publicDirectory(),
  })
}

/** put a socket into a room and notify everyone involved */
function enterRoom(io: IO, socket: Sock, s: Session, room: Room): void {
  const peers = [...room.members.values()]
  addMember(room, socket.id, s.name)
  s.roomId = room.id
  socket.join(room.id)
  socket.emit("room:joined", {
    roomId: room.id,
    kind: room.kind,
    capacity: room.capacity,
    key: room.key,
    title: room.title,
    peers,
    name: s.name,
  })
  socket.to(room.id).emit("room:peer_joined", { name: s.name })
  if (room.kind === "public") broadcastDirectory(io)
}

/** pull a socket out of its room; vaporize the room if it empties */
function exitRoom(io: IO, socket: Sock, s: Session): void {
  if (!s.roomId) return
  const room = getRoom(s.roomId)
  s.roomId = null
  if (!room) return
  removeMember(room, socket.id)
  socket.leave(room.id)
  socket.to(room.id).emit("room:peer_left", { name: s.name })
  // a stranger pairing can't be rejoined — close it for whoever remains
  if (room.kind === "stranger" && room.members.size > 0) {
    io.to(room.id).emit("room:closed", { reason: "They left. It's gone." })
    for (const memberId of room.members.keys()) {
      const peer = io.sockets.sockets.get(memberId)
      const peerSession = sessions.get(memberId)
      if (peerSession) peerSession.roomId = null
      peer?.leave(room.id)
      removeMember(room, memberId)
    }
  }
  if (room.kind === "public") broadcastDirectory(io)
}

export function registerHandlers(io: IO): void {
  io.on("connection", (socket) => {
    socket.on("session:hello", ({ name }) => {
      const clean = sanitizeName(String(name ?? ""), LIMITS.NAME_MAX)
      sessions.set(socket.id, {
        name: clean,
        roomId: null,
        tokens: LIMITS.RATE_BURST,
        lastRefill: Date.now(),
      })
      socket.emit("session:ready", { name: clean })
    })

    // ---- directory (gate room browser) ----

    socket.on("directory:subscribe", () => {
      socket.join(DIRECTORY_CHANNEL)
      socket.emit("directory:update", { rooms: publicDirectory() })
    })

    socket.on("directory:unsubscribe", () => {
      socket.leave(DIRECTORY_CHANNEL)
    })

    // ---- stranger matching ----

    socket.on("queue:join", () => {
      const s = sessions.get(socket.id)
      if (!s) return fail(socket, "NO_SESSION", "Say hello first.")
      exitRoom(io, socket, s)
      dropFromQueue(socket.id) // no double-queueing

      // find a waiting partner that is still connected
      let partnerId: string | undefined
      while (queue.length > 0) {
        const candidate = queue.shift()!
        if (io.sockets.sockets.has(candidate) && candidate !== socket.id) {
          partnerId = candidate
          break
        }
      }

      if (!partnerId) {
        queue.push(socket.id)
        socket.emit("queue:waiting")
        return
      }

      const partnerSocket = io.sockets.sockets.get(partnerId)!
      const partnerSession = sessions.get(partnerId)!
      const room = createStrangerRoom()
      enterRoom(io, partnerSocket, partnerSession, room)
      enterRoom(io, socket, s, room)
    })

    socket.on("queue:leave", () => {
      dropFromQueue(socket.id)
    })

    // ---- public rooms ----

    socket.on("public:create", () => {
      const s = sessions.get(socket.id)
      if (!s) return fail(socket, "NO_SESSION", "Say hello first.")
      exitRoom(io, socket, s)
      dropFromQueue(socket.id)
      enterRoom(io, socket, s, createPublicRoom())
    })

    socket.on("public:join", ({ roomId }) => {
      const s = sessions.get(socket.id)
      if (!s) return fail(socket, "NO_SESSION", "Say hello first.")
      const room = getRoom(String(roomId ?? ""))
      if (!room || room.kind !== "public") {
        return fail(socket, "ROOM_GONE", "That room already vaporized.")
      }
      if (isFull(room)) {
        return fail(socket, "ROOM_FULL", "That room is at ten voices.")
      }
      exitRoom(io, socket, s)
      dropFromQueue(socket.id)
      enterRoom(io, socket, s, room)
    })

    // ---- private rooms ----

    socket.on("private:create", () => {
      const s = sessions.get(socket.id)
      if (!s) return fail(socket, "NO_SESSION", "Say hello first.")
      exitRoom(io, socket, s)
      dropFromQueue(socket.id)
      enterRoom(io, socket, s, createPrivateRoom())
    })

    socket.on("private:join", ({ key }) => {
      const s = sessions.get(socket.id)
      if (!s) return fail(socket, "NO_SESSION", "Say hello first.")
      const room = findPrivateRoom(String(key ?? ""))
      if (!room) {
        return fail(socket, "BAD_KEY", "No room answers to that key.")
      }
      if (isFull(room)) {
        return fail(socket, "ROOM_FULL", "That room is already a conversation.")
      }
      exitRoom(io, socket, s)
      dropFromQueue(socket.id)
      enterRoom(io, socket, s, room)
    })

    // ---- messaging ----

    socket.on("room:message", ({ text, replyTo }) => {
      const s = sessions.get(socket.id)
      if (!s) return fail(socket, "NO_SESSION", "Say hello first.")
      if (!s.roomId || !getRoom(s.roomId)) {
        return fail(socket, "NOT_IN_ROOM", "You're not in a room.")
      }
      const body = String(text ?? "").trim()
      if (!body) return
      if (body.length > LIMITS.MESSAGE_MAX) {
        return fail(
          socket,
          "MSG_TOO_LONG",
          `Keep it under ${LIMITS.MESSAGE_MAX} characters.`
        )
      }
      if (!takeToken(s)) {
        return fail(socket, "RATE_LIMITED", "Slow down. Let it breathe.")
      }
      // sanitize the quoted reply — clamp every field, never trust the client
      let quote: { id: string; from: string; excerpt: string } | undefined
      if (replyTo && typeof replyTo === "object") {
        quote = {
          id: String(replyTo.id ?? "").slice(0, 64),
          from: String(replyTo.from ?? "").slice(0, LIMITS.NAME_MAX),
          excerpt: String(replyTo.excerpt ?? "").slice(0, LIMITS.EXCERPT_MAX),
        }
        if (!quote.id || !quote.excerpt) quote = undefined
      }
      const msg = {
        id: randomUUID(),
        from: s.name,
        text: body,
        ts: Date.now(),
        replyTo: quote,
      }
      // echo to author with self=true; broadcast to the rest with self=false
      socket.emit("room:message", { ...msg, self: true })
      socket.to(s.roomId).emit("room:message", { ...msg, self: false })
    })

    socket.on("room:leave", () => {
      const s = sessions.get(socket.id)
      if (!s) return
      exitRoom(io, socket, s)
    })

    socket.on("disconnect", () => {
      const s = sessions.get(socket.id)
      dropFromQueue(socket.id)
      if (s) exitRoom(io, socket, s)
      sessions.delete(socket.id)
    })
  })
}
