import { useEffect, useReducer, useCallback, useRef } from "react"
import type { ChatMessage, RoomJoined, AppError } from "@shared/protocol"
import { getSocket } from "./socket"

/** a line in the transcript: a real message or a quiet system notice */
export type Line =
  | { type: "msg"; msg: ChatMessage }
  | { type: "sys"; id: string; text: string }

export type Stage =
  | { view: "gate" } // name + mode selection
  | { view: "matching" } // waiting in the stranger queue
  | { view: "room"; room: RoomJoined }
  | { view: "closed"; reason: string } // room vaporized under us

interface State {
  stage: Stage
  name: string | null
  lines: Line[]
  peerCount: number
  error: AppError | null
}

type Action =
  | { type: "ready"; name: string }
  | { type: "waiting" }
  | { type: "joined"; room: RoomJoined }
  | { type: "line"; line: Line }
  | { type: "peer"; delta: 1 | -1; line: Line }
  | { type: "closed"; reason: string }
  | { type: "error"; error: AppError }
  | { type: "clear_error" }
  | { type: "left" }

const initial: State = {
  stage: { view: "gate" },
  name: null,
  lines: [],
  peerCount: 0,
  error: null,
}

let sysId = 0
const nextSysId = () => `sys-${++sysId}`

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
        peerCount: action.room.peers.length,
        error: null,
      }
    case "line":
      return { ...state, lines: [...state.lines, action.line] }
    case "peer":
      return {
        ...state,
        peerCount: Math.max(0, state.peerCount + action.delta),
        lines: [...state.lines, action.line],
      }
    case "closed":
      return {
        ...state,
        stage: { view: "closed", reason: action.reason },
        lines: [],
        peerCount: 0,
      }
    case "error":
      return { ...state, error: action.error }
    case "clear_error":
      return { ...state, error: null }
    case "left":
      return { ...initial, name: state.name }
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

  useEffect(() => {
    const socket = getSocket()

    const onReady = (p: { name: string }) => dispatch({ type: "ready", name: p.name })
    const onWaiting = () => dispatch({ type: "waiting" })
    const onJoined = (room: RoomJoined) => dispatch({ type: "joined", room })
    const onMessage = (msg: ChatMessage) =>
      dispatch({ type: "line", line: { type: "msg", msg } })
    const onPeerJoined = (p: { name: string }) =>
      dispatch({
        type: "peer",
        delta: 1,
        line: { type: "sys", id: nextSysId(), text: `${p.name} is here` },
      })
    const onPeerLeft = (p: { name: string }) =>
      dispatch({
        type: "peer",
        delta: -1,
        line: { type: "sys", id: nextSysId(), text: `${p.name} left` },
      })
    const onClosed = (p: { reason: string }) =>
      dispatch({ type: "closed", reason: p.reason })
    const onError = (e: AppError) => dispatch({ type: "error", error: e })
    const onReconnect = () => {
      if (nameRef.current) socket.emit("session:hello", { name: nameRef.current })
    }

    socket.on("session:ready", onReady)
    socket.on("queue:waiting", onWaiting)
    socket.on("room:joined", onJoined)
    socket.on("room:message", onMessage)
    socket.on("room:peer_joined", onPeerJoined)
    socket.on("room:peer_left", onPeerLeft)
    socket.on("room:closed", onClosed)
    socket.on("app:error", onError)
    socket.io.on("reconnect", onReconnect)

    return () => {
      socket.off("session:ready", onReady)
      socket.off("queue:waiting", onWaiting)
      socket.off("room:joined", onJoined)
      socket.off("room:message", onMessage)
      socket.off("room:peer_joined", onPeerJoined)
      socket.off("room:peer_left", onPeerLeft)
      socket.off("room:closed", onClosed)
      socket.off("app:error", onError)
      socket.io.off("reconnect", onReconnect)
    }
  }, [])

  const hello = useCallback((name: string) => {
    nameRef.current = name
    getSocket().emit("session:hello", { name })
  }, [])

  const joinQueue = useCallback(() => getSocket().emit("queue:join"), [])
  const cancelQueue = useCallback(() => {
    getSocket().emit("queue:leave")
    dispatch({ type: "left" })
  }, [])
  const joinLobby = useCallback(() => getSocket().emit("lobby:join"), [])
  const createRoom = useCallback(() => getSocket().emit("room:create"), [])
  const joinRoom = useCallback(
    (key: string) => getSocket().emit("room:join", { key }),
    []
  )
  const sendMessage = useCallback(
    (text: string) => getSocket().emit("room:message", { text }),
    []
  )
  const leaveRoom = useCallback(() => {
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
    joinLobby,
    createRoom,
    joinRoom,
    sendMessage,
    leaveRoom,
    backToGate,
    clearError,
  }
}

export type ChatSession = ReturnType<typeof useChatSession>
