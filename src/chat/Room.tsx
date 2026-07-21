import { useRef, useState, useCallback } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import type { RoomJoined, ReplyRef } from "@shared/protocol"
import { Button } from "@/components/ui/button"
import type { ChatSession } from "./useChatSession"
import { MessageList } from "./MessageList"
import { Composer } from "./Composer"

/**
 * The room shell. One column: context bar, transcript, composer.
 * Owns only the reply-arming state — everything else lives in its children,
 * so a keystroke in the composer never re-renders the transcript.
 */
export function Room({ session }: { session: ChatSession }) {
  const room = session.stage.view === "room" ? session.stage.room : null
  const ref = useRef<HTMLDivElement>(null)
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(null)

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

  const { sendMessage, clearError } = session
  const cancelReply = useCallback(() => setReplyTo(null), [])
  const send = useCallback(
    (text: string, reply?: ReplyRef) => sendMessage(text, reply),
    [sendMessage]
  )

  if (!room) return null

  const alone = session.peerCount === 0
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
        alone={alone}
        peerCount={session.peerCount}
        onLeave={session.leaveRoom}
      />

      <MessageList
        lines={session.lines}
        alone={alone}
        kind={room.kind}
        onReply={setReplyTo}
      />

      <Composer
        replyTo={replyTo}
        onCancelReply={cancelReply}
        onSend={send}
        errorText={composerError}
        onClearError={clearError}
      />
    </div>
  )
}

/** context bar: kind eyebrow · title · key chip · presence · leave */
function ChatHeader({
  room,
  alone,
  peerCount,
  onLeave,
}: {
  room: RoomJoined
  alone: boolean
  peerCount: number
  onLeave: () => void
}) {
  const [copied, setCopied] = useState(false)

  const kindLabel =
    room.kind === "stranger"
      ? "stranger"
      : room.kind === "public"
        ? "open room"
        : "private room"

  const title =
    room.kind === "stranger"
      ? "a stranger"
      : room.kind === "public"
        ? (room.title ?? "open room")
        : "just you two"

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
        <div className="min-w-0">
          <span className="block font-mono text-[9px] uppercase tracking-[0.25em] text-fog-dim">
            {kindLabel}
          </span>
          <span className="block truncate font-mono text-xs text-fog">
            {title}
            {room.kind === "public" && (
              <span className="text-fog-dim">
                {" "}· {peerCount + 1}/{room.capacity}
              </span>
            )}
            {room.kind === "private" && (
              <span className="text-fog-dim">
                {" "}· {alone ? "waiting" : "both here"}
              </span>
            )}
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
        <Button variant="ghost" size="sm" onClick={onLeave}>
          vaporize ↗
        </Button>
      </div>
    </header>
  )
}
