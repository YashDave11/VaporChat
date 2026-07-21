import { useRef, useState, useCallback, useEffect } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import type { RoomJoined, ReplyRef, PeerInfo } from "@shared/protocol"
import { Button } from "@/components/ui/button"
import type { ChatSession } from "./useChatSession"
import { MessageList } from "./MessageList"
import { Composer } from "./Composer"

/**
 * The room shell. One column: context bar, transcript, typing line, composer.
 * Owns the reply-arming and end-confirm state — everything else lives in its
 * children, so a keystroke in the composer never re-renders the transcript.
 *
 * Leaving vs ending: in 1-to-1 rooms the two are the same thing (the server
 * ends the room when either seat empties), so there is one action and it
 * asks first. Open rooms get both: step out quietly, or end it for everyone.
 */
export function Room({ session }: { session: ChatSession }) {
  const room = session.stage.view === "room" ? session.stage.room : null
  const ref = useRef<HTMLDivElement>(null)
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)

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

  const { sendMessage, sendTyping, clearError } = session
  const cancelReply = useCallback(() => setReplyTo(null), [])
  const send = useCallback(
    (text: string, reply?: ReplyRef) => sendMessage(text, reply),
    [sendMessage]
  )
  const openConfirm = useCallback(() => setConfirmEnd(true), [])
  const closeConfirm = useCallback(() => setConfirmEnd(false), [])
  const confirmedEnd = useCallback(() => {
    setConfirmEnd(false)
    session.endChat()
  }, [session])

  if (!room) return null

  const alone = session.peers.length === 0
  const composerError =
    session.error &&
    (session.error.code === "RATE_LIMITED" ||
      session.error.code === "MSG_TOO_LONG")
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
        onEnd={openConfirm}
        onLeave={session.leaveRoom}
      />

      <MessageList
        lines={session.lines}
        alone={alone}
        kind={room.kind}
        onReply={setReplyTo}
      />

      <TypingLine typing={session.typing} />

      <Composer
        replyTo={replyTo}
        onCancelReply={cancelReply}
        onSend={send}
        onTyping={sendTyping}
        errorText={composerError}
        onClearError={clearError}
      />

      {confirmEnd && (
        <ConfirmEnd
          oneToOne={room.kind !== "public"}
          onConfirm={confirmedEnd}
          onCancel={closeConfirm}
        />
      )}
    </div>
  )
}

/** presence summary for the header — one quiet phrase, never a banner */
function presencePhrase(room: RoomJoined, peers: PeerInfo[]): string {
  const active = peers.filter((p) => p.status === "active").length
  const away = peers.length - active

  if (room.kind === "public") {
    if (peers.length === 0) return "just you, on air"
    const base = `${active + 1} active`
    return away > 0 ? `${base} · ${away} away` : base
  }
  // 1-to-1: name the state of the one other person
  if (peers.length === 0)
    return room.kind === "private" ? "waiting" : "connecting"
  return peers[0].status === "active" ? "with you now" : "connection lost…"
}

/** context bar: kind eyebrow · title · key chip · live presence · actions */
function ChatHeader({
  room,
  peers,
  onEnd,
  onLeave,
}: {
  room: RoomJoined
  peers: PeerInfo[]
  onEnd: () => void
  onLeave: () => void
}) {
  const [copied, setCopied] = useState(false)

  const kindLabel =
    room.kind === "stranger"
      ? "stranger"
      : room.kind === "public"
        ? "open room"
        : "private room"

  const title = room.kind === "stranger" ? "a stranger" : (room.title ?? "room")

  const anyActive = peers.some((p) => p.status === "active")
  const anyAway = peers.some((p) => p.status === "away")
  // dot: signal = someone's here, amber-ish fog = away, dim = alone
  const dotClass = anyActive
    ? "presence bg-signal"
    : anyAway
      ? "bg-fog"
      : "bg-fog-dim"

  const copyKey = async () => {
    if (!room.key) return
    try {
      await navigator.clipboard.writeText(room.key)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable — the key is still on screen */
    }
  }

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
              {room.kind === "public" && (
                <> · {peers.length + 1}/{room.capacity}</>
              )}
            </span>
          </span>
        </div>
        {room.key && (
          <button
            type="button"
            onClick={copyKey}
            title="Copy room key"
            className="group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-sm border border-fog/20 bg-smoke px-2.5 py-1 font-mono text-xs tracking-[0.3em] text-signal transition-colors duration-300 outline-none hover:border-signal/40 focus-visible:ring-2 focus-visible:ring-signal/40"
          >
            {room.key}
            <span className="tracking-normal text-[10px] text-fog-dim transition-colors group-hover:text-fog">
              {copied ? "copied" : "copy"}
            </span>
          </button>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="hidden font-mono text-[10px] uppercase tracking-widest text-fog-dim sm:block">
          unrecorded
        </span>
        {room.kind === "public" && (
          <Button variant="bare" size="sm" onClick={onLeave}>
            step out →
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onEnd}>
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
 * The end-chat confirmation: a veil, a question, two ways out.
 * Built from Vapor's own surfaces — no borrowed dialog chrome.
 */
function ConfirmEnd({
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
      aria-labelledby="end-chat-title"
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
        className="relative w-full max-w-sm rounded-sm border border-fog/20 bg-smoke/95 p-6 backdrop-blur"
      >
        <p
          id="end-chat-title"
          className="font-display text-xl font-semibold tracking-tight text-breath"
        >
          End this chat for everyone?
        </p>
        <p className="mt-2 text-sm leading-relaxed text-fog">
          {oneToOne
            ? "It ends for both of you. Nothing was kept, and nothing will be."
            : "The room closes for every voice in it. Nothing was kept, and nothing will be."}
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button ref={cancelRef} variant="bare" size="sm" onClick={onCancel}>
            keep talking
          </Button>
          <Button variant="ghost" size="sm" onClick={onConfirm}>
            end it ↗
          </Button>
        </div>
      </div>
    </div>
  )
}
