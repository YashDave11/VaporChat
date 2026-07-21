/**
 * Vapor wire protocol — the single source of truth for both sides.
 * Server is authoritative: it assigns ids, names, keys, titles, timestamps,
 * and echoes messages back to the sender so there is exactly one render path.
 */

export const LIMITS = {
  NAME_MAX: 24,
  MESSAGE_MAX: 500,
  /** quoted-reply snippet length */
  EXCERPT_MAX: 90,
  KEY_LENGTH: 4,
  /** hard capacity per room kind */
  PUBLIC_CAP: 10,
  PRIVATE_CAP: 2,
  STRANGER_CAP: 2,
  /** token-bucket rate limit: burst size and refill per second */
  RATE_BURST: 6,
  RATE_REFILL_PER_SEC: 1.2,
} as const

export type RoomKind = "stranger" | "public" | "private"

export type ErrorCode =
  | "BAD_KEY"
  | "ROOM_FULL"
  | "ROOM_GONE"
  | "RATE_LIMITED"
  | "MSG_TOO_LONG"
  | "NO_SESSION"
  | "NOT_IN_ROOM"

/**
 * A quoted reply travels WITH the message — the server stores nothing, so
 * the excerpt is the only context a late joiner will ever have.
 */
export interface ReplyRef {
  id: string
  from: string
  excerpt: string
}

/**
 * Delivery status is a client-side presentation concept: "sent" means the
 * server echoed the message back. delivered/read are reserved for later.
 */
export type MessageStatus = "sent" | "delivered" | "read"

export interface ChatMessage {
  id: string
  from: string
  text: string
  ts: number
  /** true on the copy echoed to its author */
  self: boolean
  /** present when this message quotes another */
  replyTo?: ReplyRef
}

/** the only thing the directory ever reveals about a public room */
export interface PublicRoomInfo {
  id: string
  title: string
  count: number
  capacity: number
  createdAt: number
}

export interface RoomJoined {
  roomId: string
  kind: RoomKind
  capacity: number
  /** present only for private rooms */
  key?: string
  /** present only for public rooms */
  title?: string
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
  "directory:subscribe": () => void
  "directory:unsubscribe": () => void
  "public:create": () => void
  "public:join": (p: { roomId: string }) => void
  "private:create": () => void
  "private:join": (p: { key: string }) => void
  "room:message": (p: { text: string; replyTo?: ReplyRef }) => void
  "room:leave": () => void
}

/** server → client */
export interface ServerToClient {
  "session:ready": (p: { name: string }) => void
  "queue:waiting": () => void
  "directory:update": (p: { rooms: PublicRoomInfo[] }) => void
  "room:joined": (p: RoomJoined) => void
  "room:peer_joined": (p: { name: string }) => void
  "room:peer_left": (p: { name: string }) => void
  "room:message": (p: ChatMessage) => void
  "room:closed": (p: { reason: string }) => void
  "app:error": (p: AppError) => void
}
