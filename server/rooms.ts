import { randomUUID } from "node:crypto"
import type { RoomKind, PublicRoomInfo, PeerInfo, PeerStatus } from "../shared/protocol.ts"
import { LIMITS } from "../shared/protocol.ts"

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
  /** private rooms only */
  key?: string
  /** creator-chosen name — public and private rooms */
  title?: string
  /** memberId → seat */
  members: Map<string, Member>
}

const rooms = new Map<string, Room>()
/** key → roomId for private-room joins */
const privateKeys = new Map<string, string>()
/** resumeToken → { roomId, memberId } for seat reclaim */
const resumeTokens = new Map<string, { roomId: string; memberId: string }>()

// glyphs avoid ambiguous 0/O, 1/I/L, 8/B — a key you can read aloud once
const KEY_GLYPHS = "ACDEFHJKMNPRTVWXYZ234679"

function mintKey(): string {
  for (;;) {
    let key = ""
    for (let i = 0; i < LIMITS.KEY_LENGTH; i++) {
      key += KEY_GLYPHS[Math.floor(Math.random() * KEY_GLYPHS.length)]
    }
    if (!privateKeys.has(key)) return key
  }
}

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId)
}

export function isFull(room: Room): boolean {
  return room.members.size >= room.capacity
}

export function createStrangerRoom(): Room {
  const room: Room = {
    id: `s-${randomUUID().slice(0, 8)}`,
    kind: "stranger",
    capacity: LIMITS.STRANGER_CAP,
    createdAt: Date.now(),
    members: new Map(),
  }
  rooms.set(room.id, room)
  return room
}

export function createPublicRoom(title: string): Room {
  const room: Room = {
    id: `g-${randomUUID().slice(0, 8)}`,
    kind: "public",
    capacity: LIMITS.PUBLIC_CAP,
    createdAt: Date.now(),
    title,
    members: new Map(),
  }
  rooms.set(room.id, room)
  return room
}

export function createPrivateRoom(title: string): Room {
  const key = mintKey()
  const room: Room = {
    id: `p-${randomUUID().slice(0, 8)}`,
    kind: "private",
    capacity: LIMITS.PRIVATE_CAP,
    createdAt: Date.now(),
    key,
    title,
    members: new Map(),
  }
  rooms.set(room.id, room)
  privateKeys.set(key, room.id)
  return room
}

export function findPrivateRoom(key: string): Room | undefined {
  const roomId = privateKeys.get(key.toUpperCase())
  return roomId ? rooms.get(roomId) : undefined
}

/**
 * The discoverable directory: active public rooms only, safe metadata only.
 * Freshest first — a new room should surface at the top of the gate.
 */
export function publicDirectory(): PublicRoomInfo[] {
  const list: PublicRoomInfo[] = []
  for (const room of rooms.values()) {
    if (room.kind !== "public") continue
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

/** authoritative teardown: registry, private key, and every resume token */
export function deleteRoom(room: Room): void {
  for (const m of room.members.values()) resumeTokens.delete(m.resumeToken)
  rooms.delete(room.id)
  if (room.key) privateKeys.delete(room.key)
}
