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
  ensureLobby,
  createStrangerRoom,
  createPrivateRoom,
  findPrivateRoom,
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

/** put a socket into a room and notify everyone involved */
function enterRoom(io: IO, socket: Sock, s: Session, room: Room): void {
  const peers = [...room.members.values()]
  addMember(room, socket.id, s.name)
  s.roomId = room.id
  socket.join(room.id)
  socket.emit("room:joined", {
    roomId: room.id,
    kind: room.kind,
    key: room.key,
    peers,
    name: s.name,
  })
  socket.to(room.id).emit("room:peer_joined", { name: s.name })
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
  // a stranger room can't be rejoined — close it for whoever remains
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

    socket.on("lobby:join", () => {
      const s = sessions.get(socket.id)
      if (!s) return fail(socket, "NO_SESSION", "Say hello first.")
      exitRoom(io, socket, s)
      dropFromQueue(socket.id)
      enterRoom(io, socket, s, ensureLobby())
    })

    socket.on("room:create", () => {
      const s = sessions.get(socket.id)
      if (!s) return fail(socket, "NO_SESSION", "Say hello first.")
      exitRoom(io, socket, s)
      dropFromQueue(socket.id)
      enterRoom(io, socket, s, createPrivateRoom())
    })

    socket.on("room:join", ({ key }) => {
      const s = sessions.get(socket.id)
      if (!s) return fail(socket, "NO_SESSION", "Say hello first.")
      const room = findPrivateRoom(String(key ?? ""))
      if (!room) {
        return fail(socket, "BAD_KEY", "No room answers to that key.")
      }
      exitRoom(io, socket, s)
      dropFromQueue(socket.id)
      enterRoom(io, socket, s, room)
    })

    socket.on("room:message", ({ text }) => {
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
      const msg = {
        id: randomUUID(),
        from: s.name,
        text: body,
        ts: Date.now(),
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
