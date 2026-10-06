import { useRef, useState, useCallback, useEffect } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import type { RoomJoined, ReplyRef, PeerInfo, CallState } from "@shared/protocol"
import { ROOM_RULES } from "@shared/protocol"
import { Button } from "@/components/ui/button"
import type { ChatSession } from "./useChatSession"
import { MessageList } from "./MessageList"
import { Composer } from "./Composer"
import { SharePanel } from "./SharePanel"
import { CallDock } from "./CallDock"
import { IncomingCallModal } from "./IncomingCallModal"
import { useWebRTC } from "./useWebRTC"

/**
 * The room shell. One column: context bar, transcript, typing line, composer.
 * Owns the reply-arming and vaporize-confirm state — everything else lives in
 * its children, so a keystroke in the composer never re-renders the transcript.
 *
 * One exit: Vaporize. What it means is the room's kind's business — in 1v1
 * (stranger, private chat) it ends the conversation for both; in an open room
 * it removes only you. The confirmation says which before anything happens.
 */
export function Room({ session }: { session: ChatSession }) {
  const room = session.stage.view === "room" ? session.stage.room : null
  const ref = useRef<HTMLDivElement>(null)
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [dismissedCallKey, setDismissedCallKey] = useState<string | null>(null)

  const rtc = useWebRTC(session.callState, session.stage.view === "room")

  // a freshly created private room opens on its own invite panel — the
  // link and key ARE the success state; there is no other way anyone arrives
  const [shareOpen, setShareOpen] = useState(
    () => room?.kind === "private-group" && room.peers.length === 0
  )

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // room-entry: the whole panel condenses in once
        gsap.from(ref.current, {
          opacity: 0,
          y: 24,
          filter: "blur(10px)",
          duration: 0.9,
          ease: "power3.out",
        })
      })
    },
    { scope: ref }
  )

  /**
   * The room ended for everyone — make it visible. The real transcript
   * evaporates: every bubble lifts, blurs and drifts up (bottom-first), the
   * surrounding chrome fades with it, and only then does the Ended screen
   * commit. Reduced motion skips straight to the after-image.
   */
  const dissolving = session.dissolving
  const finishDissolve = session.finishDissolve
  const dissolvedRef = useRef(false)
  useGSAP(
    () => {
      if (!dissolving || dissolvedRef.current) return
      dissolvedRef.current = true
      if (rtc.inCall) rtc.leaveCall()

      const el = ref.current
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        if (el) gsap.set(el, { pointerEvents: "none" })
        const bubbles = gsap.utils.toArray<HTMLElement>(
          el?.querySelectorAll("[data-mid], [data-sys], [data-call-dock]") ?? []
        )
        const tl = gsap.timeline({ onComplete: finishDissolve })
        if (bubbles.length) {
          tl.to(bubbles, {
            y: -28,
            x: () => gsap.utils.random(-10, 10),
            opacity: 0,
            filter: "blur(10px)",
            duration: 0.9,
            ease: "power1.in",
            stagger: { each: 0.03, from: "end" },
          })
        }
        // the chrome (header, typing line, composer) thins out a beat behind
        tl.to(el, { opacity: 0, duration: 0.8, ease: "power1.in" }, bubbles.length ? 0.25 : 0)
      })
      mm.add("(prefers-reduced-motion: reduce)", () => {
        finishDissolve()
      })
    },
    { scope: ref, dependencies: [dissolving] }
  )

  const { sendMessage, sendTyping, vaporize, clearError } = session
  const cancelReply = useCallback(() => setReplyTo(null), [])
  const send = useCallback(
    (text: string, reply?: ReplyRef) => sendMessage(text, reply),
    [sendMessage]
  )
  const openConfirm = useCallback(() => setConfirmOpen(true), [])
  const closeConfirm = useCallback(() => setConfirmOpen(false), [])
  const openShare = useCallback(() => setShareOpen(true), [])
  const closeShare = useCallback(() => setShareOpen(false), [])

  const onStartVoiceCall = useCallback(() => {
    void rtc.startCall()
  }, [rtc])

  // Track other members in an active call
  const otherCallMembers = session.callState.members.filter(
    (m) => m.peerId !== room?.selfId
  )
  const activeCallKey = otherCallMembers.map((m) => m.peerId).sort().join(",")

  // Automatically reset declined state when the previous call finishes completely
  useEffect(() => {
    if (!session.callState.active || otherCallMembers.length === 0) {
      setDismissedCallKey(null)
    }
  }, [session.callState.active, otherCallMembers.length])

  // Track previous inCall state to prevent auto-ring when user leaves the call
  const prevInCallRef = useRef(rtc.inCall)
  useEffect(() => {
    if (prevInCallRef.current && !rtc.inCall) {
      // User just left the call — dismiss active call key so they are NOT auto-rung by the remaining callers!
      if (activeCallKey) {
        setDismissedCallKey(activeCallKey)
      }
    }
    prevInCallRef.current = rtc.inCall
  }, [rtc.inCall, activeCallKey])

  // Display incoming call alert when another member is in call and we haven't joined or dismissed
  const showIncomingCall =
    session.callState.active &&
    !rtc.inCall &&
    !rtc.isStarting &&
    otherCallMembers.length > 0 &&
    dismissedCallKey !== activeCallKey

  const incomingCaller = otherCallMembers[0]

  const onAcceptIncomingCall = useCallback(() => {
    setDismissedCallKey(null)
    void rtc.startCall()
  }, [rtc])

  const onDeclineIncomingCall = useCallback(() => {
    setDismissedCallKey(activeCallKey)
  }, [activeCallKey])

  // Wrap leaveCall to immediately register call dismissal and prevent any auto-ring loop
  const onLeaveCall = useCallback(() => {
    if (activeCallKey) {
      setDismissedCallKey(activeCallKey)
    }
    rtc.leaveCall()
  }, [rtc, activeCallKey])

  const rtcWithDismiss = {
    ...rtc,
    leaveCall: onLeaveCall,
  }

  const oneToOne = room ? ROOM_RULES[room.kind].oneToOne : false

  /**
   * Confirmed exit: tell the server. For 1v1 the server's room:ended returns to
   * both sides and the transcript dissolve plays identically for everyone; for a
   * group this member just leaves and returns to the gate.
   */
  const confirmedVaporize = useCallback(() => {
    if (rtc.inCall) onLeaveCall()
    setConfirmOpen(false)
    vaporize(oneToOne)
  }, [vaporize, oneToOne, rtc.inCall, onLeaveCall])

  if (!room) return null

  const alone = session.peers.length === 0
  const composerError =
    session.error &&
    (session.error.code === "RATE_LIMITED" ||
      session.error.code === "MSG_TOO_LONG" ||
      session.error.code === "ALONE_IN_ROOM")
      ? session.error.message
      : null

  return (
    <div
      ref={ref}
      className="mx-auto flex h-[calc(100dvh-4.25rem)] w-full max-w-5xl xl:max-w-6xl flex-col px-3 sm:px-6"
    >
      <ChatHeader
        room={room}
        peers={session.peers}
        onVaporize={openConfirm}
        onShare={openShare}
        callState={session.callState}
        inCall={rtc.inCall}
        onStartVoiceCall={onStartVoiceCall}
      />

      {rtc.inCall && (
        <CallDock
          rtc={rtcWithDismiss}
          callState={session.callState}
          selfName={room.name}
          selfId={room.selfId}
        />
      )}

      {/* Ongoing call banner for members not in call (declined or previously left) */}
      {session.callState.active && !rtc.inCall && otherCallMembers.length > 0 && (
        <div className="mb-2.5 flex items-center justify-between rounded-sm border border-signal/30 bg-smoke/90 p-2 px-3 font-mono text-xs shadow-[0_4px_16px_rgba(0,0,0,0.3)] backdrop-blur-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-signal" />
            </span>
            <div className="flex items-center gap-2 truncate text-[11px] text-fog">
              <span className="text-breath font-medium">Voice call ongoing</span>
              <span className="text-fog-dim hidden sm:inline">·</span>
              <span className="text-signal truncate hidden sm:inline">
                {otherCallMembers.map((m) => m.name).join(", ")}
              </span>
              <span className="text-fog-dim">
                ({otherCallMembers.length} {otherCallMembers.length === 1 ? "person" : "people"})
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onStartVoiceCall}
            className="shrink-0 flex items-center gap-1.5 rounded-sm border border-signal/50 bg-signal/15 px-2.5 py-1 font-mono text-[11px] font-semibold text-signal hover:bg-signal/25 hover:border-signal/80 cursor-pointer shadow-[0_0_10px_rgba(169,232,220,0.2)] transition-all"
            title="Join the active voice call"
          >
            <span>Join Call</span>
            <span>↗</span>
          </button>
        </div>
      )}

      <MessageList
        lines={session.lines}
        alone={alone}
        kind={room.kind}
        onReply={setReplyTo}
      />

      <TypingLine typing={session.typing} />

      <Composer
        alone={alone}
        replyTo={replyTo}
        onCancelReply={cancelReply}
        onSend={send}
        onTyping={sendTyping}
        errorText={composerError}
        onClearError={clearError}
      />

      {confirmOpen && (
        <ConfirmVaporize
          oneToOne={oneToOne}
          onConfirm={confirmedVaporize}
          onCancel={closeConfirm}
        />
      )}

      {shareOpen && room.invite && (
        <SharePanel room={room} onClose={closeShare} />
      )}

      {showIncomingCall && incomingCaller && (
        <IncomingCallModal
          callerName={incomingCaller.name}
          onAccept={onAcceptIncomingCall}
          onDecline={onDeclineIncomingCall}
        />
      )}
    </div>
  )
}

/** presence summary for the header — one quiet phrase, never a banner */
function presencePhrase(room: RoomJoined, peers: PeerInfo[]): string {
  if (!ROOM_RULES[room.kind].oneToOne) {
    if (peers.length === 0) return "just you, on air"
    const active = peers.filter((p) => p.status === "active").length
    const away = peers.length - active
    const base = `${active + 1} active`
    return away > 0 ? `${base} · ${away} away` : base
  }
  // 1-to-1: name the state of the one other person
  if (peers.length === 0)
    return room.kind === "private" ? "waiting" : "connecting"
  return peers[0].status === "active" ? "with you now" : "connection lost…"
}

/** the header eyebrow per kind — stated once, like ROOM_RULES */
const KIND_LABEL: Record<RoomJoined["kind"], string> = {
  stranger: "stranger · 1 to 1",
  public: "open room",
  private: "private chat · 1 to 1",
  "private-group": "private room · link or key",
}

/** context bar: kind eyebrow · title · live presence · invite · call actions · vaporize */
function ChatHeader({
  room,
  peers,
  onVaporize,
  onShare,
  callState,
  inCall,
  onStartVoiceCall,
}: {
  room: RoomJoined
  peers: PeerInfo[]
  onVaporize: () => void
  onShare: () => void
  callState: CallState
  inCall: boolean
  onStartVoiceCall: () => void
}) {
  const kindLabel = KIND_LABEL[room.kind]
  const group = !ROOM_RULES[room.kind].oneToOne && room.kind !== "stranger"

  const title = room.kind === "stranger" ? "a stranger" : (room.title ?? "room")

  const anyActive = peers.some((p) => p.status === "active")
  const anyAway = peers.some((p) => p.status === "away")
  // dot: signal = someone's here, amber-ish fog = away, dim = alone
  const dotClass = anyActive
    ? "presence bg-signal"
    : anyAway
      ? "bg-fog"
      : "bg-fog-dim"

  return (
    <header className="flex items-center justify-between border-b hairline py-3 sm:py-3.5">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-500 ${dotClass}`}
        />
        <div className="min-w-0">
          <span className="block font-mono text-[9px] uppercase tracking-[0.25em] text-fog-dim">
            {kindLabel}
          </span>
          <span className="block truncate font-mono text-xs text-fog">
            {title}
            <span className="text-fog-dim">
              {" "}· {presencePhrase(room, peers)}
              {group && (
                <> · {peers.length + 1}/{room.capacity}</>
              )}
            </span>
          </span>
        </div>

        {room.invite && (
          <button
            type="button"
            onClick={onShare}
            title="Invite someone by link"
            className="group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-sm border border-fog/20 bg-smoke px-2 py-1 font-mono text-[11px] text-fog transition-colors duration-300 outline-none hover:border-signal/40 hover:text-signal focus-visible:ring-2 focus-visible:ring-signal/40"
          >
            <span
              aria-hidden="true"
              className="h-1 w-1 rounded-full bg-signal/70 transition-colors group-hover:bg-signal"
            />
            invite
          </button>
        )}

        {/* Ephemeral voice call action button */}
        {inCall ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-sm border border-signal/40 bg-signal/10 px-2 py-1 font-mono text-[11px] text-signal">
            <span className="h-1.5 w-1.5 rounded-full bg-signal animate-pulse" />
            in call
          </span>
        ) : (
          <button
            type="button"
            onClick={onStartVoiceCall}
            title={
              callState.active
                ? `Join voice call (${callState.members.length} in call)`
                : "Start ephemeral voice call"
            }
            className={`group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-sm border px-2.5 py-1 font-mono text-[11px] transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-signal/40 ${
              callState.active
                ? "border-signal/60 bg-signal/15 text-signal shadow-[0_0_12px_rgba(169,232,220,0.25)] hover:bg-signal/25"
                : "border-fog/20 bg-smoke text-fog hover:border-signal/40 hover:text-signal"
            }`}
          >
            {callState.active ? (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-signal" />
              </span>
            ) : (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0 transition-transform duration-300 group-hover:scale-110"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            )}
            <span className={callState.active ? "font-semibold" : "hidden xs:inline"}>
              {callState.active ? `Join Call (${callState.members.length})` : "call"}
            </span>
          </button>
        )}
      </div>
      <div className="flex items-center gap-3 sm:gap-4">
        <span className="hidden font-mono text-[10px] uppercase tracking-widest text-fog-dim md:block">
          unrecorded
        </span>
        <Button variant="danger" size="sm" onClick={onVaporize}>
          vaporize ↗
        </Button>
      </div>
    </header>
  )
}

/** who's composing, whispered under the transcript — never louder than that */
function TypingLine({ typing }: { typing: string[] }) {
  if (typing.length === 0) return null
  const text =
    typing.length === 1
      ? `${typing[0]} is typing`
      : typing.length === 2
        ? `${typing[0]} and ${typing[1]} are typing`
        : "several people are typing"
  return (
    <p
      role="status"
      className="typing-in flex items-baseline gap-1.5 pb-1.5 pl-1 font-mono text-[11px] text-fog-dim"
    >
      {text}
      <span aria-hidden="true" className="flex gap-[3px]">
        <span className="typing-dot h-[3px] w-[3px] rounded-full bg-fog" />
        <span className="typing-dot h-[3px] w-[3px] rounded-full bg-fog" />
        <span className="typing-dot h-[3px] w-[3px] rounded-full bg-fog" />
      </span>
    </p>
  )
}

/**
 * The vaporize confirmation: a veil, a question, two ways out.
 * Built from Vapor's own surfaces — no borrowed dialog chrome. The copy
 * carries the semantics: 1v1 warns it ends for both; group says only you go.
 */
function ConfirmVaporize({
  oneToOne,
  onConfirm,
  onCancel,
}: {
  oneToOne: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-veil]", { opacity: 0, duration: 0.35, ease: "power2.out" })
        gsap.from("[data-panel]", {
          opacity: 0,
          y: 16,
          filter: "blur(10px)",
          duration: 0.5,
          ease: "power3.out",
        })
      })
    },
    { scope: ref }
  )

  // focus lands on the safe option; Escape backs out
  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCancel])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vaporize-title"
      aria-describedby="vaporize-desc"
      className="fixed inset-0 z-40 flex items-center justify-center px-6"
    >
      <button
        type="button"
        data-veil
        aria-label="Keep talking"
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-void/70 backdrop-blur-sm"
      />
      <div
        data-panel
        className="relative w-full max-w-sm rounded-sm border border-ember/25 bg-smoke/95 p-6 shadow-[var(--shadow-panel)] backdrop-blur"
      >
        <p
          id="vaporize-title"
          className="font-display text-xl font-semibold tracking-tight text-breath"
        >
          {oneToOne ? "Vaporize this chat?" : "Vaporize out of this room?"}
        </p>
        <p id="vaporize-desc" className="mt-2 text-sm leading-relaxed text-fog">
          {oneToOne
            ? "It ends for both of you — the room and its key stop existing. Nothing was kept, and nothing will be."
            : "Only you leave. The room stays on air for the others until the last voice goes."}
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button ref={cancelRef} variant="bare" size="sm" onClick={onCancel}>
            keep talking
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>
            {oneToOne ? "vaporize it ↗" : "vaporize me ↗"}
          </Button>
        </div>
      </div>
    </div>
  )
}
