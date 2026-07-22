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
  /** invite token length — URL-safe glyphs, minted per room */
  INVITE_LENGTH: 10,
  /** hard capacity per room kind */
  PUBLIC_CAP: 10,
  PRIVATE_GROUP_CAP: 10,
  PRIVATE_CAP: 2,
  STRANGER_CAP: 2,
  /** token-bucket rate limit: burst size and refill per second */
  RATE_BURST: 6,
  RATE_REFILL_PER_SEC: 1.2,
  /** a disconnect shorter than this is never shown to anyone */
  PRESENCE_GRACE_MS: 2500,
  /** how long an "away" member may resume before they are fully gone */
  RESUME_GRACE_MS: 30_000,
  /** how long both sides of a tentative match have to say yes */
  CONSENT_WINDOW_MS: 20_000,
  /** a declined (or timed-out) pair stays unmatchable this long */
  REMATCH_BLOCK_MS: 10 * 60_000,
  /** client-side: a typing signal goes stale after this long */
  TYPING_TTL_MS: 3000,
} as const

export type RoomKind = "stranger" | "public" | "private" | "private-group"

/**
 * The room model, stated once. Four kinds, four rule sets:
 *  - stranger:      random-matched 1v1 — begins only after both sides say
 *                   yes — invisible, dies with either side
 *  - public:        discoverable group room, lives until the last voice leaves
 *  - private:       key-joined 1v1 chat, invisible, dies with either side
 *  - private-group: keyed group room — public capacity, private visibility;
 *                   joined by link or key only, lives until the last voice leaves
 * `oneToOne` is what decides vaporize semantics — end for both vs leave alone.
 * `shareable` is what decides invite links — a stranger match is a consented
 * pairing with no address; nothing about it can be pointed at, so no link.
 * `keyed` is what decides join keys — every invisible hosted room mints one,
 * so "join with a key" opens whatever the key holder was given.
 */
export const ROOM_RULES = {
  stranger: { capacity: LIMITS.STRANGER_CAP, discoverable: false, oneToOne: true, shareable: false, keyed: false },
  public: { capacity: LIMITS.PUBLIC_CAP, discoverable: true, oneToOne: false, shareable: true, keyed: false },
  private: { capacity: LIMITS.PRIVATE_CAP, discoverable: false, oneToOne: true, shareable: true, keyed: true },
  "private-group": { capacity: LIMITS.PRIVATE_GROUP_CAP, discoverable: false, oneToOne: false, shareable: true, keyed: true },
} as const satisfies Record<
  RoomKind,
  { capacity: number; discoverable: boolean; oneToOne: boolean; shareable: boolean; keyed: boolean }
>

/** the kinds a person can host from the gate — everything but a stranger match */
export type HostedRoomKind = Exclude<RoomKind, "stranger">

/** why a room ended — the ended screen reads differently for each */
export type EndCause = "vaporized" | "left" | "disconnected"

/**
 * Why a tentative pairing dissolved before it became a room.
 * "declined" and "timeout" also blacklist the pair for this search cycle;
 * "left" (walked away / disconnected) does not — nobody said no.
 */
export type CandidateGoneReason = "declined" | "timeout" | "left"

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
  | "SERVER_ERROR"

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

/**
 * What an invite link resolves to before anyone joins — just enough to
 * render a doorstep: what kind of room, what it's called, whether there's
 * still a seat. Never the room id, never who's inside by name.
 */
export interface InviteInfo {
  token: string
  kind: RoomKind
  title: string
  count: number
  capacity: number
}

/** why an invite link can't open its room — each reads differently */
export type InviteDeadReason = "gone" | "full"

export interface RoomJoined {
  roomId: string
  kind: RoomKind
  capacity: number
  /** present only for keyed rooms — private 1v1 and private group */
  key?: string
  /** shareable rooms carry their invite token — the base of the join link */
  invite?: string
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
  /** clientId: per-tab identity — with the name it forms the match identity */
  "session:hello": (p: { name: string; clientId?: string }) => void
  /** reclaim a seat left inside the resume grace window */
  "session:resume": (p: { token: string }) => void
  "queue:join": () => void
  "queue:leave": () => void
  /** consent to the current tentative match */
  "queue:accept": () => void
  /** pass on the current tentative match — both sides return to searching */
  "queue:decline": () => void
  "directory:subscribe": () => void
  "directory:unsubscribe": () => void
  /** host a room of any hosted kind — ROOM_RULES supplies everything else */
  "room:create": (p: { kind: HostedRoomKind; roomName: string }) => void
  "public:join": (p: { roomId: string }) => void
  /** join by key — opens whichever keyed room (1v1 or group) minted it */
  "key:join": (p: { key: string }) => void
  /** look up what a shared link points at — no name or session needed */
  "invite:resolve": (p: { token: string }) => void
  /** walk through the door the link opened — requires a named session */
  "invite:join": (p: { token: string }) => void
  "room:message": (p: { text: string; replyTo?: ReplyRef }) => void
  "room:typing": (p: { active: boolean }) => void
  /**
   * The one exit. Server decides what it means by room kind:
   * 1v1 → the room ends for both; group → only this member leaves.
   */
  "room:vaporize": () => void
}

/** server → client */
export interface ServerToClient {
  "session:ready": (p: { name: string }) => void
  "queue:waiting": () => void
  /** how many identities are searching or weighing a candidate right now */
  "queue:count": (p: { count: number }) => void
  /** a tentative match — the room starts only if both sides accept in time */
  "queue:candidate": (p: { name: string }) => void
  /** the other side already said yes; the decision is now yours alone */
  "queue:peer_accepted": (p: { name: string }) => void
  /** the pairing dissolved without a room — the server re-queues you */
  "queue:candidate_gone": (p: { reason: CandidateGoneReason }) => void
  "directory:update": (p: { rooms: PublicRoomInfo[] }) => void
  /** the doorstep view of a shared link — safe metadata only */
  "invite:info": (p: InviteInfo) => void
  /** the link points at nothing joinable — and in which way */
  "invite:dead": (p: { reason: InviteDeadReason }) => void
  "room:joined": (p: RoomJoined) => void
  "room:peer_joined": (p: { name: string }) => void
  "room:peer_left": (p: { name: string }) => void
  /** full presence snapshot for the room — includes the recipient */
  "room:presence": (p: { peers: PeerInfo[] }) => void
  "room:peer_typing": (p: { name: string; active: boolean }) => void
  "room:message": (p: ChatMessage) => void
  /** the room is over for everyone; `by` names who caused it, when knowable */
  "room:ended": (p: { reason: string; cause: EndCause; by?: string }) => void
  "app:error": (p: AppError) => void
}
