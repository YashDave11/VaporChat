/**
 * Vapor wire protocol — the single source of truth for both sides.
 * Server is authoritative: it assigns ids, keys, timestamps, presence, and
 * echoes messages back to the sender so there is exactly one render path.
 * Names are always user-chosen and always required — no ghosts, no fallbacks.
 */

export const LIMITS = {
  NAME_MAX: 24,
  ROOM_NAME_MAX: 32,
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
  /** a disconnect shorter than this is never shown to anyone */
  PRESENCE_GRACE_MS: 2500,
  /** how long an "away" member may resume before they are fully gone */
  RESUME_GRACE_MS: 30_000,
  /** client-side: a typing signal goes stale after this long */
  TYPING_TTL_MS: 3000,
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
  | "NAME_REQUIRED"
  | "ROOM_NAME_REQUIRED"

/** presence: "away" means recently disconnected, inside the resume window */
export type PeerStatus = "active" | "away"

/** one member of a room as everyone else sees them */
export interface PeerInfo {
  /** socket id — lets a client find itself in a snapshot */
  id: string
  name: string
  status: PeerStatus
}

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
  /** creator-chosen room name — public and private rooms; strangers have none */
  title?: string
  /** members already present (never includes you) */
  peers: PeerInfo[]
  /** your own display name, as sanitized by the server */
  name: string
  /** your stable member id — find yourself in room:presence snapshots */
  selfId: string
  /** lets this exact seat be reclaimed after a refresh or blip */
  resumeToken: string
}

export interface AppError {
  code: ErrorCode
  message: string
}

/** client → server */
export interface ClientToServer {
  "session:hello": (p: { name: string }) => void
  /** reclaim a seat left inside the resume grace window */
  "session:resume": (p: { token: string }) => void
  "queue:join": () => void
  "queue:leave": () => void
  "directory:subscribe": () => void
  "directory:unsubscribe": () => void
  "public:create": (p: { roomName: string }) => void
  "public:join": (p: { roomId: string }) => void
  "private:create": (p: { roomName: string }) => void
  "private:join": (p: { key: string }) => void
  "room:message": (p: { text: string; replyTo?: ReplyRef }) => void
  "room:typing": (p: { active: boolean }) => void
  /** end the chat for everyone in the room */
  "room:end": () => void
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
  /** full presence snapshot for the room — includes the recipient */
  "room:presence": (p: { peers: PeerInfo[] }) => void
  "room:peer_typing": (p: { name: string; active: boolean }) => void
  "room:message": (p: ChatMessage) => void
  /** the room is over for everyone; `by` names who ended it, when known */
  "room:ended": (p: { reason: string; by?: string }) => void
  "app:error": (p: AppError) => void
}
