import { randomUUID } from "node:crypto"
import type { RoomKind, PublicRoomInfo } from "../shared/protocol.ts"
import { LIMITS } from "../shared/protocol.ts"
import { roomTitle } from "./names.ts"

/**
 * In-memory room engine. Everything lives in these Maps and nowhere else —
 * when a room empties it is deleted, and a process restart forgets the world.
 *
 * Socket.IO's own room structure is transport only. This registry is the
 * source of truth, and the directory projection below is the ONLY thing a
 * client ever learns about rooms it isn't in.
 */

export interface Room {
  id: string
  kind: RoomKind
  capacity: number
  createdAt: number
  /** private rooms only */
  key?: string
  /** public rooms only — server-assigned, never user input */
  title?: string
  /** socketId → display name */
  members: Map<string, string>
}

const rooms = new Map<string, Room>()
/** key → roomId for private-room joins */
const privateKeys = new Map<string, string>()

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

export function createPublicRoom(): Room {
  const room: Room = {
    id: `g-${randomUUID().slice(0, 8)}`,
    kind: "public",
    capacity: LIMITS.PUBLIC_CAP,
    createdAt: Date.now(),
    title: roomTitle(),
    members: new Map(),
  }
  rooms.set(room.id, room)
  return room
}

export function createPrivateRoom(): Room {
  const key = mintKey()
  const room: Room = {
    id: `p-${randomUUID().slice(0, 8)}`,
    kind: "private",
    capacity: LIMITS.PRIVATE_CAP,
    createdAt: Date.now(),
    key,
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

export function addMember(room: Room, socketId: string, name: string): void {
  room.members.set(socketId, name)
}

/**
 * Remove a member; if the room empties, vaporize it — public rooms fall out
 * of the directory, private keys die with their rooms.
 * Returns true if the room was deleted.
 */
export function removeMember(room: Room, socketId: string): boolean {
  room.members.delete(socketId)
  if (room.members.size === 0) {
    rooms.delete(room.id)
    if (room.key) privateKeys.delete(room.key)
    return true
  }
  return false
}
