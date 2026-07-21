import { useRef, useEffect, useState, memo } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import type { RoomJoined } from "@shared/protocol"
import { LIMITS } from "@shared/protocol"
import { Button } from "@/components/ui/button"
import type { ChatSession, Line } from "./useChatSession"

/**
 * The room. One column, transcript above, a single line to type into below.
 * Messages sit on hairlines, not in bubbles — a transcript, not a feed.
 */
export function Room({ session }: { session: ChatSession }) {
  const room = session.stage.view === "room" ? session.stage.room : null
  const ref = useRef<HTMLDivElement>(null)

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

  if (!room) return null

  const alone = session.peerCount === 0
  const title =
    room.kind === "stranger"
      ? "a stranger"
      : room.kind === "lobby"
        ? "the lobby"
        : "private room"

  return (
    <div
      ref={ref}
      className="mx-auto flex h-[calc(100svh-6rem)] w-full max-w-2xl flex-col px-4 sm:px-6"
    >
      <RoomHeader
        room={room}
        title={title}
        alone={alone}
        peerCount={session.peerCount}
        onLeave={session.leaveRoom}
      />

      <Transcript lines={session.lines} alone={alone} kind={room.kind} />

      <Composer
        session={session}
        disabled={false}
      />
    </div>
  )
}

function RoomHeader({
  room,
  title,
  alone,
  peerCount,
  onLeave,
}: {
  room: RoomJoined
  title: string
  alone: boolean
  peerCount: number
  onLeave: () => void
}) {
  const [copied, setCopied] = useState(false)

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
          className={`presence h-1.5 w-1.5 shrink-0 rounded-full ${
            alone ? "bg-fog-dim" : "bg-signal"
          }`}
        />
        <span className="truncate font-mono text-xs text-fog">
          {title}
          {room.kind === "lobby" && peerCount > 0 && (
            <span className="text-fog-dim"> · {peerCount + 1} present</span>
          )}
        </span>
        {room.key && (
          <button
            type="button"
            onClick={copyKey}
            title="Copy room key"
            className="group flex cursor-pointer items-center gap-1.5 rounded-sm border border-fog/20 bg-smoke px-2.5 py-1 font-mono text-xs tracking-[0.3em] text-signal transition-colors duration-300 outline-none hover:border-signal/40 focus-visible:ring-2 focus-visible:ring-signal/40"
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
        <Button variant="ghost" size="sm" onClick={onLeave}>
          vaporize ↗
        </Button>
      </div>
    </header>
  )
}

/** memoized so typing in the composer never re-renders the transcript */
const Transcript = memo(function Transcript({
  lines,
  alone,
  kind,
}: {
  lines: Line[]
  alone: boolean
  kind: RoomJoined["kind"]
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)

  // stay pinned to the bottom unless the reader scrolled up on purpose
  useEffect(() => {
    const el = scrollRef.current
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight
  }, [lines])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      role="log"
      aria-live="polite"
      aria-label="Messages"
      className="flex-1 overflow-y-auto py-6"
    >
      {lines.length === 0 && (
        <p className="py-10 text-center font-mono text-xs text-fog-dim">
          {alone
            ? kind === "private"
              ? "empty room. share the key — it only works while you're here"
              : kind === "stranger"
                ? "they're connecting…"
                : "the lobby is quiet. say something into it"
            : "nothing said yet. nothing will be kept"}
        </p>
      )}
      <ol className="flex flex-col gap-0.5" role="list">
        {lines.map((line) =>
          line.type === "sys" ? (
            <li
              key={line.id}
              className="msg-in py-2 text-center font-mono text-[11px] text-fog-dim"
            >
              — {line.text} —
            </li>
          ) : (
            <li
              key={line.msg.id}
              className={`msg-in group grid grid-cols-[minmax(64px,auto)_1fr] items-baseline gap-3 rounded-sm px-2 py-2 hover:bg-smoke/40 sm:grid-cols-[minmax(84px,auto)_1fr]`}
            >
              <span
                className={`truncate text-right font-mono text-[11px] ${
                  line.msg.self ? "text-signal" : "text-fog-dim"
                }`}
              >
                {line.msg.self ? "you" : line.msg.from}
              </span>
              <span
                className={`text-[15px] leading-relaxed break-words ${
                  line.msg.self ? "text-breath" : "text-fog"
                }`}
              >
                {line.msg.text}
              </span>
            </li>
          )
        )}
      </ol>
    </div>
  )
})

const EMOJI = ["🙂", "😅", "🤍", "👋", "🫥", "🌫️", "🔥", "💭"] as const

function Composer({
  session,
  disabled,
}: {
  session: ChatSession
  disabled: boolean
}) {
  const [text, setText] = useState("")
  const [emojiOpen, setEmojiOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const rateError =
    session.error &&
    (session.error.code === "RATE_LIMITED" || session.error.code === "MSG_TOO_LONG")
      ? session.error
      : null

  const send = () => {
    const body = text.trim()
    if (!body) return
    session.sendMessage(body)
    setText("")
    setEmojiOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div className="border-t hairline pt-3 pb-4">
      {rateError && (
        <p role="alert" className="pb-2 font-mono text-[11px] text-fog">
          {rateError.message}
        </p>
      )}
      {emojiOpen && (
        <div
          role="toolbar"
          aria-label="Emoji"
          className="mb-2 flex gap-1 rounded-sm border border-fog/15 bg-smoke/80 p-1.5 backdrop-blur"
        >
          {EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                setText((t) => t + e)
                inputRef.current?.focus()
              }}
              className="cursor-pointer rounded-sm px-2 py-1 text-lg transition-colors duration-200 outline-none hover:bg-smoke-2 focus-visible:ring-2 focus-visible:ring-signal/40"
            >
              {e}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <button
          type="button"
          aria-label="Add emoji"
          aria-expanded={emojiOpen}
          onClick={() => setEmojiOpen((v) => !v)}
          className="flex h-11 w-10 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-fog/20 text-fog transition-colors duration-300 outline-none hover:border-fog/50 hover:text-breath focus-visible:ring-2 focus-visible:ring-signal/40"
        >
          <span aria-hidden="true" className="text-base leading-none">☺</span>
        </button>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value.slice(0, LIMITS.MESSAGE_MAX))
            if (rateError) session.clearError()
          }}
          placeholder="say something"
          aria-label="Message"
          autoComplete="off"
          disabled={disabled}
          className="h-11 min-w-0 flex-1 rounded-sm border border-fog/20 bg-smoke/60 px-4 font-body text-[15px] text-breath placeholder:text-fog-dim outline-none transition-colors duration-300 focus:border-signal/50 focus-visible:ring-2 focus-visible:ring-signal/40"
        />
        <Button type="submit" size="default" disabled={!text.trim()}>
          Send
        </Button>
      </form>
      <p className="pt-2 pl-12 font-mono text-[10px] text-fog-dim">
        enter to send · nothing is stored
      </p>
    </div>
  )
}
