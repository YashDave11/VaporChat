import { useEffect, useReducer, useCallback, useRef } from "react"
import type {
  ChatMessage,
  RoomJoined,
  AppError,
  PublicRoomInfo,
  PeerInfo,
  ReplyRef,
} from "@shared/protocol"
import { LIMITS } from "@shared/protocol"
import { getSocket } from "./socket"

/** a line in the transcript: a real message or a quiet system notice */
export type Line =
  | { type: "msg"; msg: ChatMessage }
  | { type: "sys"; id: string; text: string }

export type Stage =
  | { view: "gate" } // name + mode selection + public directory
  | { view: "matching" } // waiting in the stranger queue
  | { view: "room"; room: RoomJoined }
  | { view: "ended"; reason: string; by?: string } // room ended for everyone

interface State {
  stage: Stage
  name: string | null
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
  | { type: "joined"; room: RoomJoined }
  | { type: "line"; line: Line }
  | { type: "presence"; peers: PeerInfo[] }
  | { type: "typing"; name: string; active: boolean }
  | { type: "directory"; rooms: PublicRoomInfo[] }
  | { type: "ended"; reason: string; by?: string }
  | { type: "error"; error: AppError }
  | { type: "clear_error" }
  | { type: "left" }

const initial: State = {
  stage: { view: "gate" },
  name: null,
  lines: [],
  peers: [],
  typing: [],
  directory: [],
  error: null,
}

let sysId = 0
const nextSysId = () => `sys-${++sysId}`

/** per-tab: survives refresh, dies with the tab — like the chat itself */
const RESUME_KEY = "vapor:resume"
const NAME_KEY = "vapor:name"

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ready":
      return { ...state, name: action.name }
    case "waiting":
      return { ...state, stage: { view: "matching" }, error: null }
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
    case "ended":
      return {
        ...state,
        stage: { view: "ended", reason: action.reason, by: action.by },
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
  const [state, dispatch] = useReducer(reducer, initial)
  // hello is re-sent on reconnect with the latest chosen name
  const nameRef = useRef<string>("")
  // typing signals go stale on their own if the stop never arrives
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const socket = getSocket()

    const onReady = (p: { name: string }) => {
      nameRef.current = p.name
      sessionStorage.setItem(NAME_KEY, p.name)
      dispatch({ type: "ready", name: p.name })
    }
    const resumingRef = { current: false }
    const onWaiting = () => dispatch({ type: "waiting" })
    const onJoined = (room: RoomJoined) => {
      resumingRef.current = false
      sessionStorage.setItem(RESUME_KEY, room.resumeToken)
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
        line: { type: "sys", id: nextSysId(), text: `${p.name} left` },
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
    const onEnded = (p: { reason: string; by?: string }) => {
      sessionStorage.removeItem(RESUME_KEY)
      dispatch({ type: "ended", reason: p.reason, by: p.by })
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
      const token = sessionStorage.getItem(RESUME_KEY)
      if (token) {
        resumingRef.current = true
        socket.emit("session:resume", { token })
      } else if (nameRef.current) {
        socket.emit("session:hello", { name: nameRef.current })
      }
    }

    socket.on("session:ready", onReady)
    socket.on("queue:waiting", onWaiting)
    socket.on("room:joined", onJoined)
    socket.on("room:message", onMessage)
    socket.on("room:peer_joined", onPeerJoined)
    socket.on("room:peer_left", onPeerLeft)
    socket.on("room:presence", onPresence)
    socket.on("room:peer_typing", onPeerTyping)
    socket.on("directory:update", onDirectory)
    socket.on("room:ended", onEnded)
    socket.on("app:error", onError)
    socket.io.on("reconnect", tryResume)

    // page refresh mid-conversation: reclaim the seat before it expires
    if (socket.connected) tryResume()
    else socket.once("connect", tryResume)

    const timers = typingTimers.current
    return () => {
      socket.off("session:ready", onReady)
      socket.off("queue:waiting", onWaiting)
      socket.off("room:joined", onJoined)
      socket.off("room:message", onMessage)
      socket.off("room:peer_joined", onPeerJoined)
      socket.off("room:peer_left", onPeerLeft)
      socket.off("room:presence", onPresence)
      socket.off("room:peer_typing", onPeerTyping)
      socket.off("directory:update", onDirectory)
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
    getSocket().emit("session:hello", { name })
  }, [])

  const joinQueue = useCallback(() => getSocket().emit("queue:join"), [])
  const cancelQueue = useCallback(() => {
    getSocket().emit("queue:leave")
    dispatch({ type: "left" })
  }, [])
  const createPublicRoom = useCallback(
    (roomName: string) => getSocket().emit("public:create", { roomName }),
    []
  )
  const joinPublicRoom = useCallback(
    (roomId: string) => getSocket().emit("public:join", { roomId }),
    []
  )
  const createPrivateRoom = useCallback(
    (roomName: string) => getSocket().emit("private:create", { roomName }),
    []
  )
  const joinPrivateRoom = useCallback(
    (key: string) => getSocket().emit("private:join", { key }),
    []
  )
  const sendMessage = useCallback(
    (text: string, replyTo?: ReplyRef) =>
      getSocket().emit("room:message", { text, replyTo }),
    []
  )
  const sendTyping = useCallback(
    (active: boolean) => getSocket().emit("room:typing", { active }),
    []
  )
  const endChat = useCallback(() => {
    sessionStorage.removeItem(RESUME_KEY)
    getSocket().emit("room:end")
  }, [])
  const leaveRoom = useCallback(() => {
    sessionStorage.removeItem(RESUME_KEY)
    getSocket().emit("room:leave")
    dispatch({ type: "left" })
  }, [])
  const backToGate = useCallback(() => dispatch({ type: "left" }), [])
  const clearError = useCallback(() => dispatch({ type: "clear_error" }), [])

  return {
    ...state,
    hello,
    joinQueue,
    cancelQueue,
    createPublicRoom,
    joinPublicRoom,
    createPrivateRoom,
    joinPrivateRoom,
    sendMessage,
    sendTyping,
    endChat,
    leaveRoom,
    backToGate,
    clearError,
  }
}

/** the name remembered by this tab, if any — prefills the gate */
export function rememberedName(): string {
  return sessionStorage.getItem(NAME_KEY) ?? ""
}

export type ChatSession = ReturnType<typeof useChatSession>
