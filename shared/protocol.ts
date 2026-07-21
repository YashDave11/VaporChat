/**
 * Vapor wire protocol — the single source of truth for both sides.
 * Server is authoritative: it assigns ids, names, timestamps, and echoes
 * messages back to the sender so there is exactly one render path.
 */

export const LIMITS = {
  NAME_MAX: 24,
  MESSAGE_MAX: 500,
  KEY_LENGTH: 4,
  /** token-bucket rate limit: burst size and refill per second */
  RATE_BURST: 6,
  RATE_REFILL_PER_SEC: 1.2,
} as const

export type RoomKind = "stranger" | "lobby" | "private"

export type ErrorCode =
  | "BAD_KEY"
  | "RATE_LIMITED"
  | "MSG_TOO_LONG"
  | "NO_SESSION"
  | "NOT_IN_ROOM"

export interface ChatMessage {
  id: string
  from: string
  text: string
  ts: number
  /** true on the copy echoed to its author */
  self: boolean
}

export interface RoomJoined {
  roomId: string
  kind: RoomKind
  /** present only for private rooms */
  key?: string
  /** display names of peers already present */
  peers: string[]
  /** your own (possibly server-assigned) name */
  name: string
}

export interface AppError {
  code: ErrorCode
  message: string
}

/** client → server */
export interface ClientToServer {
  "session:hello": (p: { name: string }) => void
  "queue:join": () => void
  "queue:leave": () => void
  "lobby:join": () => void
  "room:create": () => void
  "room:join": (p: { key: string }) => void
  "room:message": (p: { text: string }) => void
  "room:leave": () => void
}

/** server → client */
export interface ServerToClient {
  "session:ready": (p: { name: string }) => void
  "queue:waiting": () => void
  "room:joined": (p: RoomJoined) => void
  "room:peer_joined": (p: { name: string }) => void
  "room:peer_left": (p: { name: string }) => void
  "room:message": (p: ChatMessage) => void
  "room:closed": (p: { reason: string }) => void
  "app:error": (p: AppError) => void
}
