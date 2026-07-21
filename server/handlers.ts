import { randomUUID } from "node:crypto"
import type { Server, Socket } from "socket.io"
import type {
  ClientToServer,
  ServerToClient,
  ErrorCode,
} from "../shared/protocol.ts"
import { LIMITS } from "../shared/protocol.ts"
import { sanitizeName, sanitizeRoomName } from "./names.ts"
import {
  type Room,
  type Member,
  getRoom,
  isFull,
  createStrangerRoom,
  createPublicRoom,
  createPrivateRoom,
  findPrivateRoom,
  findResumable,
  publicDirectory,
  presenceSnapshot,
  addMember,
  removeMember,
  deleteRoom,
} from "./rooms.ts"

type IO = Server<ClientToServer, ServerToClient>
type Sock = Socket<ClientToServer, ServerToClient>

/** per-socket ephemeral session — dies with the connection */
interface Session {
  name: string
  roomId: string | null
  /** which seat this socket occupies in its room */
  memberId: string | null
  /** token bucket for rate limiting */
  tokens: number
  lastRefill: number
}

const sessions = new Map<string, Session>()
/** waiting queue for stranger matching (socket ids, FIFO) */
const queue: string[] = []

/**
 * Grace timers per seat. A disconnect starts two clocks: a short one before
 * anyone is told the member is away (absorbs blips), and a long one before
 * the seat is truly abandoned (absorbs refreshes).
 */
interface GraceTimers {
  away?: ReturnType<typeof setTimeout>
  expire?: ReturnType<typeof setTimeout>
}
const graceTimers = new Map<string, GraceTimers>()

/**
 * Socket.IO room used purely as a broadcast channel for directory watchers.
 * It is NOT a chat room and never appears in any registry.
 */
const DIRECTORY_CHANNEL = "watch:directory"

/** 1-to-1 kinds: leaving one of these ends it for both */
function isOneToOne(room: Room): boolean {
  return room.kind === "stranger" || room.kind === "private"
}

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

function clearGrace(memberId: string): void {
  const t = graceTimers.get(memberId)
  if (t) {
    clearTimeout(t.away)
    clearTimeout(t.expire)
    graceTimers.delete(memberId)
  }
}

/** push the fresh public directory to everyone watching the gate */
function broadcastDirectory(io: IO): void {
  io.to(DIRECTORY_CHANNEL).emit("directory:update", {
    rooms: publicDirectory(),
  })
}

function broadcastPresence(io: IO, room: Room): void {
  io.to(room.id).emit("room:presence", { peers: presenceSnapshot(room) })
}

/** put a socket into a room and notify everyone involved */
function enterRoom(io: IO, socket: Sock, s: Session, room: Room): void {
  const peers = presenceSnapshot(room)
  const member = addMember(room, socket.id, s.name)
  s.roomId = room.id
  s.memberId = member.id
  socket.join(room.id)
  socket.emit("room:joined", {
    roomId: room.id,
    kind: room.kind,
    capacity: room.capacity,
    key: room.key,
    title: room.title,
    peers,
    name: s.name,
    selfId: member.id,
    resumeToken: member.resumeToken,
  })
  socket.to(room.id).emit("room:peer_joined", { name: s.name })
  broadcastPresence(io, room)
  if (room.kind === "public") broadcastDirectory(io)
}

/**
 * The authoritative end: everyone is told, every socket is pulled out,
 * every timer dies, and the room ceases to exist anywhere.
 */
function endRoom(io: IO, room: Room, reason: string, by?: string): void {
  io.to(room.id).emit("room:ended", { reason, by })
  for (const member of room.members.values()) {
    clearGrace(member.id)
    if (member.socketId) {
      const peerSocket = io.sockets.sockets.get(member.socketId)
      const peerSession = sessions.get(member.socketId)
      if (peerSession) {
        peerSession.roomId = null
        peerSession.memberId = null
      }
      peerSocket?.leave(room.id)
    }
  }
  deleteRoom(room)
  if (room.kind === "public") broadcastDirectory(io)
}

/**
 * A seat is finally vacated — by explicit leave or expired grace.
 * In 1-to-1 rooms that ends the conversation for whoever remains.
 */
function finalizeLeave(io: IO, room: Room, member: Member): void {
  clearGrace(member.id)
  removeMember(room, member.id)
  if (room.members.size > 0) {
    if (isOneToOne(room)) {
      endRoom(io, room, `${member.name} left. It's gone.`)
      return
    }
    io.to(room.id).emit("room:peer_left", { name: member.name })
    io.to(room.id).emit("room:peer_typing", { name: member.name, active: false })
    broadcastPresence(io, room)
  }
  if (room.kind === "public") broadcastDirectory(io)
}

/** explicit leave by a connected socket — no grace, the seat is gone now */
function exitRoom(io: IO, socket: Sock, s: Session): void {
  if (!s.roomId || !s.memberId) return
  const room = getRoom(s.roomId)
  const memberId = s.memberId
  s.roomId = null
  s.memberId = null
  if (!room) return
  const member = room.members.get(memberId)
  socket.leave(room.id)
  if (member) finalizeLeave(io, room, member)
}

/**
 * A socket vanished while seated. Hold the seat: after a short beat the
 * others see "away"; after the resume window the seat is truly abandoned.
 */
function beginGrace(io: IO, room: Room, member: Member): void {
  member.socketId = null
  clearGrace(member.id)
  graceTimers.set(member.id, {
    away: setTimeout(() => {
      // still gone after the blip window — now it's worth mentioning
      if (member.status === "active") {
        member.status = "away"
        io.to(room.id).emit("room:peer_typing", {
          name: member.name,
          active: false,
        })
        broadcastPresence(io, room)
      }
    }, LIMITS.PRESENCE_GRACE_MS),
    expire: setTimeout(() => {
      finalizeLeave(io, room, member)
    }, LIMITS.RESUME_GRACE_MS),
  })
}

export function registerHandlers(io: IO): void {
  io.on("connection", (socket) => {
    socket.on("session:hello", ({ name }) => {
      const clean = sanitizeName(String(name ?? ""), LIMITS.NAME_MAX)
      if (!clean) {
        return fail(socket, "NAME_REQUIRED", "A name first. Any name.")
      }
      // a re-hello must never orphan a seat this socket already holds
      const prior = sessions.get(socket.id)
      sessions.set(socket.id, {
        name: prior?.roomId ? prior.name : clean,
        roomId: prior?.roomId ?? null,
        memberId: prior?.memberId ?? null,
        tokens: LIMITS.RATE_BURST,
        lastRefill: Date.now(),
      })
      socket.emit("session:ready", {
        name: prior?.roomId ? prior.name : clean,
      })
    })

    // ---- resume: a refreshed or blipped client reclaims its seat ----

    socket.on("session:resume", ({ token }) => {
      const found = findResumable(String(token ?? ""))
      if (!found) {
        return fail(socket, "ROOM_GONE", "That conversation already vaporized.")
      }
      const { room, member } = found
      // seat already held by a live socket — don't let a second tab steal it
      if (member.socketId && io.sockets.sockets.has(member.socketId)) {
        return fail(socket, "ROOM_GONE", "That seat is already taken.")
      }
      clearGrace(member.id)
      const wasAway = member.status === "away"
      member.socketId = socket.id
      member.status = "active"
      sessions.set(socket.id, {
        name: member.name,
        roomId: room.id,
        memberId: member.id,
        tokens: LIMITS.RATE_BURST,
        lastRefill: Date.now(),
      })
      socket.join(room.id)
      socket.emit("session:ready", { name: member.name })
      socket.emit("room:joined", {
        roomId: room.id,
        kind: room.kind,
        capacity: room.capacity,
        key: room.key,
        title: room.title,
        peers: presenceSnapshot(room).filter((p) => p.id !== member.id),
        name: member.name,
        selfId: member.id,
        resumeToken: member.resumeToken,
      })
      if (wasAway) broadcastPresence(io, room)
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
      if (!s) return fail(socket, "NAME_REQUIRED", "A name first. Any name.")
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

    socket.on("public:create", ({ roomName }) => {
      const s = sessions.get(socket.id)
      if (!s) return fail(socket, "NAME_REQUIRED", "A name first. Any name.")
      const title = sanitizeRoomName(String(roomName ?? ""), LIMITS.ROOM_NAME_MAX)
      if (!title) {
        return fail(socket, "ROOM_NAME_REQUIRED", "The room needs a name.")
      }
      exitRoom(io, socket, s)
      dropFromQueue(socket.id)
      enterRoom(io, socket, s, createPublicRoom(title))
    })

    socket.on("public:join", ({ roomId }) => {
      const s = sessions.get(socket.id)
      if (!s) return fail(socket, "NAME_REQUIRED", "A name first. Any name.")
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

    socket.on("private:create", ({ roomName }) => {
      const s = sessions.get(socket.id)
      if (!s) return fail(socket, "NAME_REQUIRED", "A name first. Any name.")
      const title = sanitizeRoomName(String(roomName ?? ""), LIMITS.ROOM_NAME_MAX)
      if (!title) {
        return fail(socket, "ROOM_NAME_REQUIRED", "The room needs a name.")
      }
      exitRoom(io, socket, s)
      dropFromQueue(socket.id)
      enterRoom(io, socket, s, createPrivateRoom(title))
    })

    socket.on("private:join", ({ key }) => {
      const s = sessions.get(socket.id)
      if (!s) return fail(socket, "NAME_REQUIRED", "A name first. Any name.")
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
      if (!s) return fail(socket, "NAME_REQUIRED", "A name first. Any name.")
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
      // a sent message settles any typing signal for its author
      socket.to(s.roomId).emit("room:peer_typing", {
        name: s.name,
        active: false,
      })
      // echo to author with self=true; broadcast to the rest with self=false
      socket.emit("room:message", { ...msg, self: true })
      socket.to(s.roomId).emit("room:message", { ...msg, self: false })
    })

    // ---- typing: pure relay, never stored, never rate-billed ----

    socket.on("room:typing", ({ active }) => {
      const s = sessions.get(socket.id)
      if (!s?.roomId || !getRoom(s.roomId)) return
      socket.to(s.roomId).emit("room:peer_typing", {
        name: s.name,
        active: Boolean(active),
      })
    })

    // ---- ending and leaving ----

    socket.on("room:end", () => {
      const s = sessions.get(socket.id)
      if (!s) return fail(socket, "NAME_REQUIRED", "A name first. Any name.")
      if (!s.roomId) return fail(socket, "NOT_IN_ROOM", "You're not in a room.")
      const room = getRoom(s.roomId)
      s.roomId = null
      s.memberId = null
      if (!room) return
      endRoom(io, room, "The chat was ended for everyone.", s.name)
    })

    socket.on("room:leave", () => {
      const s = sessions.get(socket.id)
      if (!s) return
      exitRoom(io, socket, s)
    })

    socket.on("disconnect", () => {
      const s = sessions.get(socket.id)
      dropFromQueue(socket.id)
      if (s?.roomId && s.memberId) {
        const room = getRoom(s.roomId)
        const member = room?.members.get(s.memberId)
        if (room && member) beginGrace(io, room, member)
      }
      sessions.delete(socket.id)
    })
  })
}
