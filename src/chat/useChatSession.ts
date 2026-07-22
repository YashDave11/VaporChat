import { useEffect, useReducer, useCallback, useRef } from "react"
import type {
  ChatMessage,
  RoomJoined,
  AppError,
  PublicRoomInfo,
  PeerInfo,
  ReplyRef,
  EndCause,
  CandidateGoneReason,
  InviteInfo,
  InviteDeadReason,
  HostedRoomKind,
} from "@shared/protocol"
import { LIMITS } from "@shared/protocol"
import { getSocket } from "./socket"
import { playCue } from "@/lib/sound"

/** a line in the transcript: a real message or a quiet system notice */
export type Line =
  | { type: "msg"; msg: ChatMessage }
  | { type: "sys"; id: string; text: string }

/**
 * Where the stranger search stands. The candidate never becomes a room
 * until both sides accept; "waiting" means we said yes and they haven't.
 */
export type MatchPhase = "searching" | "candidate" | "waiting"

export interface MatchState {
  phase: MatchPhase
  /** the other side's display name while a candidate exists */
  candidate: string | null
  /** they already said yes — shown on the candidate card */
  peerAccepted: boolean
  /** quiet status line after a dissolved pairing ("Looking for someone else…") */
  note: string | null
}

/**
 * The life of an opened invite link: the token resolves into a doorstep
 * (room name, kind, seats), or into one of the dead ends. "resolving" is
 * the beat between opening the link and knowing what it points at.
 */
export type InviteState =
  | { phase: "resolving"; token: string }
  | { phase: "open"; info: InviteInfo }
  | { phase: "dead"; reason: InviteDeadReason }

export type Stage =
  | { view: "gate" } // name + mode selection + public directory
  | { view: "matching"; match: MatchState } // searching / deciding on a stranger
  | { view: "invite"; invite: InviteState } // arrived via a shared link
  | { view: "room"; room: RoomJoined }
  | { view: "ended"; reason: string; cause: EndCause; by?: string } // over, for everyone

interface State {
  stage: Stage
  name: string | null
  /** identities searching for a stranger right now — live while matching */
  queueCount: number
  lines: Line[]
  /** everyone else in the room, with live presence */
  peers: PeerInfo[]
  /** display names currently composing */
  typing: string[]
  directory: PublicRoomInfo[]
  error: AppError | null
}

type Action =
  | { type: "ready"; name: string }
  | { type: "waiting" }
  | { type: "count"; count: number }
  | { type: "candidate"; name: string }
  | { type: "peer_accepted" }
  | { type: "accepted" }
  | { type: "candidate_gone"; reason: CandidateGoneReason }
  | { type: "declined" }
  | { type: "joined"; room: RoomJoined }
  | { type: "line"; line: Line }
  | { type: "presence"; peers: PeerInfo[] }
  | { type: "typing"; name: string; active: boolean }
  | { type: "directory"; rooms: PublicRoomInfo[] }
  | { type: "invite_resolving"; token: string }
  | { type: "invite_info"; info: InviteInfo }
  | { type: "invite_dead"; reason: InviteDeadReason }
  | { type: "ended"; reason: string; cause: EndCause; by?: string }
  | { type: "error"; error: AppError }
  | { type: "clear_error" }
  | { type: "left" }

const initial: State = {
  stage: { view: "gate" },
  name: null,
  queueCount: 0,
  lines: [],
  peers: [],
  typing: [],
  directory: [],
  error: null,
}

const searchingAgain = (note: string | null): Stage => ({
  view: "matching",
  match: { phase: "searching", candidate: null, peerAccepted: false, note },
})

let sysId = 0
const nextSysId = () => `sys-${++sysId}`

/** per-tab: survives refresh, dies with the tab — like the chat itself */
const RESUME_KEY = "vapor:resume"
const NAME_KEY = "vapor:name"
const CLIENT_KEY = "vapor:client"

/** the token carried by a shared join link — #/join/<token> — or null */
export function inviteTokenFromHash(): string | null {
  const m = window.location.hash.match(/^#\/join\/([A-Za-z0-9]+)/)
  return m ? m[1].toUpperCase() : null
}

/**
 * A consumed or abandoned invite link steps aside for the plain chat hash,
 * so a refresh resumes the seat instead of knocking on the door again.
 * replaceState fires no hashchange — nothing re-renders, nothing navigates.
 */
function clearInviteHash(): void {
  if (window.location.hash.startsWith("#/join/")) {
    history.replaceState(null, "", "#/chat")
  }
}

/**
 * Per-tab identity for stranger matching. With the display name it forms the
 * match identity — so a refresh doesn't double the online count, and a
 * declined pair stays apart until someone returns under a new name.
 */
function clientId(): string {
  let id = sessionStorage.getItem(CLIENT_KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(CLIENT_KEY, id)
  }
  return id
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ready":
      return { ...state, name: action.name }
    case "waiting":
      return { ...state, stage: searchingAgain(null), error: null }
    case "count":
      return { ...state, queueCount: action.count }
    case "candidate":
      // ignore a candidate racing a cancel — we already left the search
      if (state.stage.view !== "matching") return state
      // a fresh candidate always resets consent state — no stale "waiting"
      return {
        ...state,
        stage: {
          view: "matching",
          match: {
            phase: "candidate",
            candidate: action.name,
            peerAccepted: false,
            note: null,
          },
        },
      }
    case "peer_accepted": {
      if (state.stage.view !== "matching") return state
      const m = state.stage.match
      if (!m.candidate) return state
      return {
        ...state,
        stage: { view: "matching", match: { ...m, peerAccepted: true } },
      }
    }
    case "accepted": {
      // we said yes; until they do (or the pairing dies) we hold
      if (state.stage.view !== "matching") return state
      const m = state.stage.match
      if (m.phase !== "candidate") return state
      return {
        ...state,
        stage: { view: "matching", match: { ...m, phase: "waiting" } },
      }
    }
    case "candidate_gone": {
      if (state.stage.view !== "matching") return state
      // the server already put us back in the queue — narrate it gently
      const note =
        action.reason === "timeout"
          ? "That moment passed. Looking again…"
          : "Looking for someone else…"
      return { ...state, stage: searchingAgain(note) }
    }
    case "declined":
      // our own no — return to the search quietly, no note needed
      if (state.stage.view !== "matching") return state
      return { ...state, stage: searchingAgain(null) }
    case "joined":
      return {
        ...state,
        stage: { view: "room", room: action.room },
        name: action.room.name,
        lines: [],
        peers: action.room.peers,
        typing: [],
        error: null,
      }
    case "line":
      return { ...state, lines: [...state.lines, action.line] }
    case "presence": {
      const selfId =
        state.stage.view === "room" ? state.stage.room.selfId : null
      const peers = action.peers.filter((p) => p.id !== selfId)
      // drop typing signals from anyone no longer active
      const active = new Set(
        peers.filter((p) => p.status === "active").map((p) => p.name)
      )
      return {
        ...state,
        peers,
        typing: state.typing.filter((n) => active.has(n)),
      }
    }
    case "typing": {
      const without = state.typing.filter((n) => n !== action.name)
      return {
        ...state,
        typing: action.active ? [...without, action.name] : without,
      }
    }
    case "directory":
      return { ...state, directory: action.rooms }
    case "invite_resolving":
      return {
        ...state,
        stage: { view: "invite", invite: { phase: "resolving", token: action.token } },
        error: null,
      }
    case "invite_info":
      // info only matters while the doorstep is on screen
      if (state.stage.view !== "invite") return state
      return {
        ...state,
        stage: { view: "invite", invite: { phase: "open", info: action.info } },
      }
    case "invite_dead":
      if (state.stage.view !== "invite") return state
      return {
        ...state,
        stage: { view: "invite", invite: { phase: "dead", reason: action.reason } },
      }
    case "ended":
      // an ended notice matters only for the room we're standing in — after
      // a deliberate navigate-away (e.g. onto an invite doorstep) it's stale
      if (state.stage.view !== "room") return state
      return {
        ...state,
        stage: {
          view: "ended",
          reason: action.reason,
          cause: action.cause,
          by: action.by,
        },
        lines: [],
        peers: [],
        typing: [],
      }
    case "error":
      return { ...state, error: action.error }
    case "clear_error":
      return { ...state, error: null }
    case "left":
      return { ...initial, name: state.name, directory: state.directory }
    default:
      return state
  }
}

/**
 * The one stateful seam between the socket and the UI.
 * All socket listeners live here; components only read state and call actions.
 */
export function useChatSession() {
  const [state, dispatch] = useReducer(reducer, initial, (base): State => {
    // arriving via a shared link: open on the doorstep, not the gate
    const token = inviteTokenFromHash()
    if (!token) return base
    return {
      ...base,
      stage: { view: "invite", invite: { phase: "resolving", token } },
    }
  })
  // hello is re-sent on reconnect with the latest chosen name
  const nameRef = useRef<string>("")
  // typing signals go stale on their own if the stop never arrives
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  // mirror of the current view for socket handlers — cues must never fire
  // for events the reducer is about to ignore (e.g. a candidate racing a cancel)
  const viewRef = useRef(state.stage.view)
  viewRef.current = state.stage.view

  useEffect(() => {
    const socket = getSocket()

    const onReady = (p: { name: string }) => {
      nameRef.current = p.name
      sessionStorage.setItem(NAME_KEY, p.name)
      dispatch({ type: "ready", name: p.name })
    }
    const resumingRef = { current: false }
    const onWaiting = () => dispatch({ type: "waiting" })
    const onCount = (p: { count: number }) =>
      dispatch({ type: "count", count: p.count })
    const onCandidate = (p: { name: string }) => {
      // a signal locked on — the one moment worth hearing while matching.
      // Silent unless we're actually still searching (reducer drops it too).
      if (viewRef.current === "matching") playCue("match")
      dispatch({ type: "candidate", name: p.name })
    }
    const onPeerAccepted = () => dispatch({ type: "peer_accepted" })
    const onCandidateGone = (p: { reason: CandidateGoneReason }) =>
      dispatch({ type: "candidate_gone", reason: p.reason })
    const onJoined = (room: RoomJoined) => {
      // a reclaimed seat is not an arrival — resume stays silent
      if (!resumingRef.current) playCue("join")
      resumingRef.current = false
      sessionStorage.setItem(RESUME_KEY, room.resumeToken)
      // the link did its job; the hash settles so refresh means resume
      clearInviteHash()
      dispatch({ type: "joined", room })
    }
    const onMessage = (msg: ChatMessage) => {
      // a message settles its author's typing signal instantly
      if (!msg.self) dispatch({ type: "typing", name: msg.from, active: false })
      dispatch({ type: "line", line: { type: "msg", msg } })
    }
    const onPeerJoined = (p: { name: string }) =>
      dispatch({
        type: "line",
        line: { type: "sys", id: nextSysId(), text: `${p.name} is here` },
      })
    const onPeerLeft = (p: { name: string }) =>
      dispatch({
        type: "line",
        line: { type: "sys", id: nextSysId(), text: `${p.name} left the room` },
      })
    const onPresence = (p: { peers: PeerInfo[] }) =>
      dispatch({ type: "presence", peers: p.peers })
    const onPeerTyping = (p: { name: string; active: boolean }) => {
      const timers = typingTimers.current
      const prior = timers.get(p.name)
      if (prior) clearTimeout(prior)
      if (p.active) {
        timers.set(
          p.name,
          setTimeout(() => {
            timers.delete(p.name)
            dispatch({ type: "typing", name: p.name, active: false })
          }, LIMITS.TYPING_TTL_MS)
        )
      } else {
        timers.delete(p.name)
      }
      dispatch({ type: "typing", name: p.name, active: p.active })
    }
    const onDirectory = (p: { rooms: PublicRoomInfo[] }) =>
      dispatch({ type: "directory", rooms: p.rooms })
    const onInviteInfo = (info: InviteInfo) =>
      dispatch({ type: "invite_info", info })
    const onInviteDead = (p: { reason: InviteDeadReason }) => {
      // the link leads nowhere — it has no further job, settle the hash
      clearInviteHash()
      dispatch({ type: "invite_dead", reason: p.reason })
    }
    const onEnded = (p: { reason: string; cause: EndCause; by?: string }) => {
      // the room stopped existing — the mirror of the join cue
      playCue("leave")
      sessionStorage.removeItem(RESUME_KEY)
      dispatch({ type: "ended", reason: p.reason, cause: p.cause, by: p.by })
    }
    const onError = (e: AppError) => {
      // a failed resume just means the room is gone — arrive at the gate quietly
      if (e.code === "ROOM_GONE" && resumingRef.current) {
        resumingRef.current = false
        sessionStorage.removeItem(RESUME_KEY)
        return
      }
      dispatch({ type: "error", error: e })
    }
    const tryResume = () => {
      // an explicit link in the hash outranks a remembered seat — the user
      // asked for a doorstep, not for wherever they were before
      const invite = inviteTokenFromHash()
      if (invite) {
        socket.emit("invite:resolve", { token: invite })
        return
      }
      const token = sessionStorage.getItem(RESUME_KEY)
      if (token) {
        resumingRef.current = true
        socket.emit("session:resume", { token })
      } else if (nameRef.current) {
        socket.emit("session:hello", {
          name: nameRef.current,
          clientId: clientId(),
        })
      }
    }

    socket.on("session:ready", onReady)
    socket.on("queue:waiting", onWaiting)
    socket.on("queue:count", onCount)
    socket.on("queue:candidate", onCandidate)
    socket.on("queue:peer_accepted", onPeerAccepted)
    socket.on("queue:candidate_gone", onCandidateGone)
    socket.on("room:joined", onJoined)
    socket.on("room:message", onMessage)
    socket.on("room:peer_joined", onPeerJoined)
    socket.on("room:peer_left", onPeerLeft)
    socket.on("room:presence", onPresence)
    socket.on("room:peer_typing", onPeerTyping)
    socket.on("directory:update", onDirectory)
    socket.on("invite:info", onInviteInfo)
    socket.on("invite:dead", onInviteDead)
    socket.on("room:ended", onEnded)
    socket.on("app:error", onError)
    socket.io.on("reconnect", tryResume)

    // page refresh mid-conversation: reclaim the seat before it expires
    if (socket.connected) tryResume()
    else socket.once("connect", tryResume)

    // a join link pasted into a tab that's already inside the chat app
    const onHashChange = () => {
      const token = inviteTokenFromHash()
      if (!token) return
      dispatch({ type: "invite_resolving", token })
      if (socket.connected) socket.emit("invite:resolve", { token })
    }
    window.addEventListener("hashchange", onHashChange)
    // explicit page unload / tab close / refresh: leave room / queue
    const onUnload = () => {
      if (viewRef.current === "room") {
        sessionStorage.removeItem(RESUME_KEY)
        getSocket().emit("room:vaporize")
      } else if (viewRef.current === "matching") {
        getSocket().emit("queue:leave")
      }
    }
    window.addEventListener("beforeunload", onUnload)
    window.addEventListener("pagehide", onUnload)

    const timers = typingTimers.current
    return () => {
      window.removeEventListener("hashchange", onHashChange)
      window.removeEventListener("beforeunload", onUnload)
      window.removeEventListener("pagehide", onUnload)
      socket.off("session:ready", onReady)
      socket.off("queue:waiting", onWaiting)
      socket.off("queue:count", onCount)
      socket.off("queue:candidate", onCandidate)
      socket.off("queue:peer_accepted", onPeerAccepted)
      socket.off("queue:candidate_gone", onCandidateGone)
      socket.off("room:joined", onJoined)
      socket.off("room:message", onMessage)
      socket.off("room:peer_joined", onPeerJoined)
      socket.off("room:peer_left", onPeerLeft)
      socket.off("room:presence", onPresence)
      socket.off("room:peer_typing", onPeerTyping)
      socket.off("directory:update", onDirectory)
      socket.off("invite:info", onInviteInfo)
      socket.off("invite:dead", onInviteDead)
      socket.off("room:ended", onEnded)
      socket.off("app:error", onError)
      socket.io.off("reconnect", tryResume)
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
    }
  }, [])

  // watch the public directory only while the gate is on screen
  const onGate = state.stage.view === "gate"
  useEffect(() => {
    if (!onGate) return
    const socket = getSocket()
    socket.emit("directory:subscribe")
    return () => {
      socket.emit("directory:unsubscribe")
    }
  }, [onGate])

  const hello = useCallback((name: string) => {
    nameRef.current = name
    getSocket().emit("session:hello", { name, clientId: clientId() })
  }, [])

  const joinQueue = useCallback(() => getSocket().emit("queue:join"), [])
  const cancelQueue = useCallback(() => {
    getSocket().emit("queue:leave")
    dispatch({ type: "left" })
  }, [])
  /** say yes to the current candidate — the room starts when they do too */
  const acceptCandidate = useCallback(() => {
    getSocket().emit("queue:accept")
    dispatch({ type: "accepted" })
  }, [])
  /** pass — the server re-queues both sides and keeps them apart */
  const declineCandidate = useCallback(() => {
    getSocket().emit("queue:decline")
    dispatch({ type: "declined" })
  }, [])
  /** host a room — kind decides visibility, capacity, key, and link */
  const createRoom = useCallback(
    (kind: HostedRoomKind, roomName: string) =>
      getSocket().emit("room:create", { kind, roomName }),
    []
  )
  const joinPublicRoom = useCallback(
    (roomId: string) => getSocket().emit("public:join", { roomId }),
    []
  )
  /** a key opens whichever keyed room minted it — 1v1 chat or private group */
  const joinByKey = useCallback(
    (key: string) => getSocket().emit("key:join", { key }),
    []
  )
  /** name yourself on the doorstep and walk in — one gesture, one event pair */
  const acceptInvite = useCallback((name: string, token: string) => {
    const socket = getSocket()
    nameRef.current = name
    socket.emit("session:hello", { name, clientId: clientId() })
    socket.emit("invite:join", { token })
  }, [])
  /** step away from the doorstep — the link is abandoned, not the app */
  const declineInvite = useCallback(() => {
    clearInviteHash()
    dispatch({ type: "left" })
  }, [])
  const sendMessage = useCallback(
    (text: string, replyTo?: ReplyRef) =>
      getSocket().emit("room:message", { text, replyTo }),
    []
  )
  const sendTyping = useCallback(
    (active: boolean) => getSocket().emit("room:typing", { active }),
    []
  )
  /**
   * The one exit. The server decides what it means: in 1v1 the room ends
   * for both (room:ended comes back); in a group only this member leaves,
   * so the client returns to the gate on its own.
   */
  const vaporize = useCallback((oneToOne: boolean) => {
    sessionStorage.removeItem(RESUME_KEY)
    getSocket().emit("room:vaporize")
    if (!oneToOne) {
      // group exit: no room:ended will come back for us — the cue fires here
      playCue("leave")
      dispatch({ type: "left" })
    }
  }, [])
  const backToGate = useCallback(() => {
    if (viewRef.current === "room") {
      sessionStorage.removeItem(RESUME_KEY)
      getSocket().emit("room:vaporize")
    } else if (viewRef.current === "matching") {
      getSocket().emit("queue:leave")
    }
    dispatch({ type: "left" })
  }, [])
  const clearError = useCallback(() => dispatch({ type: "clear_error" }), [])

  return {
    ...state,
    hello,
    joinQueue,
    cancelQueue,
    acceptCandidate,
    declineCandidate,
    createRoom,
    joinPublicRoom,
    joinByKey,
    acceptInvite,
    declineInvite,
    sendMessage,
    sendTyping,
    vaporize,
    backToGate,
    clearError,
  }
}

/** the name remembered by this tab, if any — prefills the gate */
export function rememberedName(): string {
  return sessionStorage.getItem(NAME_KEY) ?? ""
}

export type ChatSession = ReturnType<typeof useChatSession>
