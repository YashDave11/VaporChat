import { useRef, useState, useCallback, useEffect } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import type { RoomJoined, ReplyRef, PeerInfo } from "@shared/protocol"
import { ROOM_RULES } from "@shared/protocol"
import { Button } from "@/components/ui/button"
import type { ChatSession } from "./useChatSession"
import { MessageList } from "./MessageList"
import { Composer } from "./Composer"
import { SharePanel } from "./SharePanel"

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

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
  // a freshly created private room opens on its own invite panel — the
  // link and key ARE the success state; there is no other way anyone arrives
  const [shareOpen, setShareOpen] = useState(
    () => room?.kind === "private-group" && room.peers.length === 0
  )
  /** true while the exit animation is dissolving the panel */
  const leavingRef = useRef(false)

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

  const oneToOne = room ? ROOM_RULES[room.kind].oneToOne : false

  /**
   * Confirmed exit: dissolve the panel, then tell the server. The socket call
   * waits for the animation so the room seems to evaporate rather than cut —
   * unless reduced motion asks for the cut.
   */
  const confirmedVaporize = useCallback(() => {
    if (leavingRef.current) return
    leavingRef.current = true
    setConfirmOpen(false)
    const done = () => {
      leavingRef.current = false
      vaporize(oneToOne)
    }
    if (prefersReducedMotion() || !ref.current) {
      done()
      return
    }
    gsap.to(ref.current, {
      opacity: 0,
      y: -16,
      filter: "blur(12px)",
      duration: 0.45,
      ease: "power2.in",
      onComplete: done,
    })
  }, [vaporize, oneToOne])

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
      className="mx-auto flex h-[calc(100svh-6rem)] w-full max-w-2xl flex-col px-4 sm:px-6"
    >
      <ChatHeader
        room={room}
        peers={session.peers}
        onVaporize={openConfirm}
        onShare={openShare}
      />

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

/** context bar: kind eyebrow · title · live presence · invite · vaporize */
function ChatHeader({
  room,
  peers,
  onVaporize,
  onShare,
}: {
  room: RoomJoined
  peers: PeerInfo[]
  onVaporize: () => void
  onShare: () => void
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
    <header className="flex items-center justify-between border-b hairline py-3.5">
      <div className="flex min-w-0 items-center gap-3">
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
            className="group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-sm border border-fog/20 bg-smoke px-2.5 py-1 font-mono text-[11px] text-fog transition-colors duration-300 outline-none hover:border-signal/40 hover:text-signal focus-visible:ring-2 focus-visible:ring-signal/40"
          >
            <span
              aria-hidden="true"
              className="h-1 w-1 rounded-full bg-signal/70 transition-colors group-hover:bg-signal"
            />
            invite
          </button>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="hidden font-mono text-[10px] uppercase tracking-widest text-fog-dim sm:block">
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
