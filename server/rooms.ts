import { randomUUID, randomInt } from "node:crypto"
import type { RoomKind, PublicRoomInfo, PeerInfo, PeerStatus } from "../shared/protocol.ts"
import { LIMITS, ROOM_RULES } from "../shared/protocol.ts"

/**
 * In-memory room engine. Everything lives in these Maps and nowhere else —
 * when a room empties or ends it is deleted, and a process restart forgets
 * the world.
 *
 * A member is a *seat*, not a socket: the seat has a stable id and a resume
 * token, so a refresh or a network blip can reclaim it inside the grace
 * window. Socket.IO's own room structure is transport only; this registry
 * is the source of truth.
 */

export interface Member {
  /** stable seat id — survives socket swaps */
  id: string
  name: string
  /** current transport, or null while the member is away */
  socketId: string | null
  status: PeerStatus
  /** secret that lets a new socket reclaim this seat */
  resumeToken: string
}

export interface Room {
  id: string
  kind: RoomKind
  capacity: number
  createdAt: number
  /** display name of whoever opened the room — "" for matched strangers */
  createdBy: string
  /** private rooms only */
  key?: string
  /** shareable rooms only — the token their join link carries */
  invite?: string
  /** creator-chosen name — public and private rooms */
  title?: string
  /** memberId → seat */
  members: Map<string, Member>
}

const rooms = new Map<string, Room>()
/** key → roomId for private-room joins */
const privateKeys = new Map<string, string>()
/** invite token → roomId for link joins */
const inviteTokens = new Map<string, string>()
/** resumeToken → { roomId, memberId } for seat reclaim */
const resumeTokens = new Map<string, { roomId: string; memberId: string }>()

// glyphs avoid ambiguous 0/O, 1/I/L, 8/B — a key you can read aloud once
const KEY_GLYPHS = "ACDEFHJKMNPRTVWXYZ234679"

function mintGlyphs(length: number): string {
  let out = ""
  for (let i = 0; i < length; i++) {
    out += KEY_GLYPHS[randomInt(KEY_GLYPHS.length)]
  }
  return out
}

function mintKey(): string {
  for (;;) {
    const key = mintGlyphs(LIMITS.KEY_LENGTH)
    if (!privateKeys.has(key)) return key
  }
}

/**
 * Invite tokens share the readable alphabet but are long enough to be
 * unguessable (24^10 ≈ 6×10^13) — a link, not a thing you type.
 */
function mintInvite(): string {
  for (;;) {
    const token = mintGlyphs(LIMITS.INVITE_LENGTH)
    if (!inviteTokens.has(token)) return token
  }
}

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId)
}

export function isFull(room: Room): boolean {
  return room.members.size >= room.capacity
}

/** id prefixes keep room kinds legible in logs: s-, g-, p- */
const KIND_PREFIX = { stranger: "s", public: "g", private: "p" } as const

/**
 * The one constructor. ROOM_RULES supplies capacity; private rooms mint
 * their key here, shareable rooms mint their invite token here — neither
 * can ever exist without its room.
 */
export function createRoom(
  kind: RoomKind,
  opts: { title?: string; createdBy?: string } = {}
): Room {
  const room: Room = {
    id: `${KIND_PREFIX[kind]}-${randomUUID().slice(0, 8)}`,
    kind,
    capacity: ROOM_RULES[kind].capacity,
    createdAt: Date.now(),
    createdBy: opts.createdBy ?? "",
    title: opts.title,
    members: new Map(),
  }
  if (kind === "private") {
    room.key = mintKey()
    privateKeys.set(room.key, room.id)
  }
  if (ROOM_RULES[kind].shareable) {
    room.invite = mintInvite()
    inviteTokens.set(room.invite, room.id)
  }
  rooms.set(room.id, room)
  return room
}

export function findPrivateRoom(key: string): Room | undefined {
  const roomId = privateKeys.get(key.toUpperCase())
  return roomId ? rooms.get(roomId) : undefined
}

/** the room a shared link points at — undefined once it has vaporized */
export function findInvitedRoom(token: string): Room | undefined {
  const roomId = inviteTokens.get(token.toUpperCase())
  return roomId ? rooms.get(roomId) : undefined
}

/**
 * The discoverable directory: rooms whose rules say so (public only), safe
 * metadata only. Freshest first — a new room surfaces at the top of the gate.
 */
export function publicDirectory(): PublicRoomInfo[] {
  const list: PublicRoomInfo[] = []
  for (const room of rooms.values()) {
    if (!ROOM_RULES[room.kind].discoverable) continue
    list.push({
      id: room.id,
      title: room.title ?? "room",
      count: room.members.size,
      capacity: room.capacity,
      createdAt: room.createdAt,
    })
  }
  return list.sort((a, b) => b.createdAt - a.createdAt)
}

/** the room as everyone sees it — names and presence, nothing secret */
export function presenceSnapshot(room: Room): PeerInfo[] {
  return [...room.members.values()].map((m) => ({
    id: m.id,
    name: m.name,
    status: m.status,
  }))
}

export function addMember(room: Room, socketId: string, name: string): Member {
  const member: Member = {
    id: `m-${randomUUID().slice(0, 8)}`,
    name,
    socketId,
    status: "active",
    resumeToken: randomUUID(),
  }
  room.members.set(member.id, member)
  resumeTokens.set(member.resumeToken, { roomId: room.id, memberId: member.id })
  return member
}

export function findMemberBySocket(
  room: Room,
  socketId: string
): Member | undefined {
  for (const m of room.members.values()) {
    if (m.socketId === socketId) return m
  }
  return undefined
}

/** look a seat up by its resume token — undefined once the seat is gone */
export function findResumable(
  token: string
): { room: Room; member: Member } | undefined {
  const ref = resumeTokens.get(token)
  if (!ref) return undefined
  const room = rooms.get(ref.roomId)
  const member = room?.members.get(ref.memberId)
  if (!room || !member) {
    resumeTokens.delete(token)
    return undefined
  }
  return { room, member }
}

/**
 * Remove a seat; if the room empties, vaporize it — public rooms fall out
 * of the directory, private keys die with their rooms.
 * Returns true if the room was deleted.
 */
export function removeMember(room: Room, memberId: string): boolean {
  const member = room.members.get(memberId)
  if (member) resumeTokens.delete(member.resumeToken)
  room.members.delete(memberId)
  if (room.members.size === 0) {
    deleteRoom(room)
    return true
  }
  return false
}

/** authoritative teardown: registry, private key, invite, every resume token */
export function deleteRoom(room: Room): void {
  for (const m of room.members.values()) resumeTokens.delete(m.resumeToken)
  rooms.delete(room.id)
  if (room.key) privateKeys.delete(room.key)
  if (room.invite) inviteTokens.delete(room.invite)
}
