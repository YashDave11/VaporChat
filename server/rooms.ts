import { randomUUID } from "node:crypto"
import type { RoomKind } from "../shared/protocol.ts"
import { LIMITS } from "../shared/protocol.ts"

/**
 * In-memory room engine. Everything lives in these Maps and nowhere else —
 * when a room empties it is deleted, and a process restart forgets the world.
 */

export interface Room {
  id: string
  kind: RoomKind
  /** private rooms only */
  key?: string
  /** socketId → display name */
  members: Map<string, string>
}

export const LOBBY_ID = "lobby"

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

/** the lobby exists whenever someone is in it */
export function ensureLobby(): Room {
  let lobby = rooms.get(LOBBY_ID)
  if (!lobby) {
    lobby = { id: LOBBY_ID, kind: "lobby", members: new Map() }
    rooms.set(LOBBY_ID, lobby)
  }
  return lobby
}

export function createStrangerRoom(): Room {
  const room: Room = {
    id: `s-${randomUUID().slice(0, 8)}`,
    kind: "stranger",
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

export function addMember(room: Room, socketId: string, name: string): void {
  room.members.set(socketId, name)
}

/**
 * Remove a member; if the room empties, vaporize it.
 * Returns true if the room was deleted.
 */
export function removeMember(room: Room, socketId: string): boolean {
  room.members.delete(socketId)
  if (room.members.size === 0 && room.id !== LOBBY_ID) {
    rooms.delete(room.id)
    if (room.key) privateKeys.delete(room.key)
    return true
  }
  if (room.id === LOBBY_ID && room.members.size === 0) {
    // even the lobby leaves no residue when the last person drifts out
    rooms.delete(LOBBY_ID)
  }
  return false
}
