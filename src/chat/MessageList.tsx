import {
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
  memo,
} from "react"
import type { ChatMessage, ReplyRef, RoomKind } from "@shared/protocol"
import { LIMITS } from "@shared/protocol"
import type { Line } from "./useChatSession"

/**
 * The transcript. Owns everything about scroll physics and quote navigation;
 * the outside world only hands it lines and receives reply intents.
 * Memoized so typing in the composer never touches it.
 */

/** consecutive messages within this window fuse into one group */
const GROUP_WINDOW_MS = 4 * 60_000

type Block =
  | { type: "sys"; id: string; text: string }
  | {
      type: "group"
      id: string
      self: boolean
      from: string
      msgs: ChatMessage[]
    }

/** fold raw lines into sender-grouped blocks */
function toBlocks(lines: Line[]): Block[] {
  const blocks: Block[] = []
  for (const line of lines) {
    if (line.type === "sys") {
      blocks.push({ type: "sys", id: line.id, text: line.text })
      continue
    }
    const m = line.msg
    const last = blocks[blocks.length - 1]
    if (
      last &&
      last.type === "group" &&
      last.self === m.self &&
      last.from === m.from &&
      m.ts - last.msgs[last.msgs.length - 1].ts < GROUP_WINDOW_MS
    ) {
      last.msgs.push(m)
    } else {
      blocks.push({
        type: "group",
        id: m.id,
        self: m.self,
        from: m.from,
        msgs: [m],
      })
    }
  }
  return blocks
}

const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
})

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export const MessageList = memo(function MessageList({
  lines,
  alone,
  kind,
  onReply,
}: {
  lines: Line[]
  alone: boolean
  kind: RoomKind
  onReply: (ref: ReplyRef) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const [unseen, setUnseen] = useState(0)
  /** which message is flashing after quote navigation; n retriggers */
  const [flash, setFlash] = useState<{ id: string; n: number } | null>(null)

  const blocks = useMemo(() => toBlocks(lines), [lines])

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto",
    })
  }, [])

  // new lines: glide if pinned or own message; otherwise count as unseen
  useEffect(() => {
    if (lines.length === 0) return
    const last = lines[lines.length - 1]
    const own = last.type === "msg" && last.msg.self
    if (pinnedRef.current || own) {
      scrollToBottom(true)
      pinnedRef.current = true
      setUnseen(0)
    } else {
      setUnseen((n) => n + 1)
    }
  }, [lines, scrollToBottom])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 64
    pinnedRef.current = nearBottom
    if (nearBottom) setUnseen(0)
  }

  /** quote click → find the original, center it, flash it */
  const jumpToMessage = useCallback((id: string) => {
    const el = scrollRef.current?.querySelector(`[data-mid="${CSS.escape(id)}"]`)
    if (!el) return
    pinnedRef.current = false
    el.scrollIntoView({
      block: "center",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    })
    setFlash((f) => ({ id, n: (f?.n ?? 0) + 1 }))
  }, [])

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-label="Messages"
        className="h-full overflow-y-auto py-6"
      >
        {blocks.length === 0 && <EmptyState alone={alone} kind={kind} />}

        <ol className="flex flex-col gap-3 px-1" role="list">
          {blocks.map((block) =>
            block.type === "sys" ? (
              <li
                key={block.id}
                className="msg-in py-1 text-center font-mono text-[11px] text-fog-dim"
              >
                — {block.text} —
              </li>
            ) : (
              <MessageGroup
                key={block.id}
                block={block}
                flash={flash}
                onReply={onReply}
                onQuoteClick={jumpToMessage}
              />
            )
          )}
        </ol>
      </div>

      {unseen > 0 && (
        <button
          type="button"
          onClick={() => {
            scrollToBottom(true)
            pinnedRef.current = true
            setUnseen(0)
          }}
          className="pill-in absolute bottom-3 left-1/2 flex -translate-x-1/2 cursor-pointer items-center gap-2 rounded-full border border-signal/30 bg-void/90 px-4 py-1.5 font-mono text-[11px] text-signal backdrop-blur transition-colors duration-300 outline-none hover:border-signal/60 focus-visible:ring-2 focus-visible:ring-signal/40"
        >
          ↓ {unseen} new
        </button>
      )}
    </div>
  )
})

function EmptyState({ alone, kind }: { alone: boolean; kind: RoomKind }) {
  return (
    <p className="py-10 text-center font-mono text-xs text-fog-dim">
      {alone
        ? kind === "private"
          ? "empty room. share the key — it only works while you're here"
          : kind === "stranger"
            ? "they're connecting…"
            : "this room is on air. anyone at the gate can find it now"
        : "nothing said yet. nothing will be kept"}
    </p>
  )
}

/**
 * One sender's run of messages: name once (incoming only), bubbles stacked,
 * time + status whispered once at the end.
 */
const MessageGroup = memo(function MessageGroup({
  block,
  flash,
  onReply,
  onQuoteClick,
}: {
  block: Extract<Block, { type: "group" }>
  flash: { id: string; n: number } | null
  onReply: (ref: ReplyRef) => void
  onQuoteClick: (id: string) => void
}) {
  const { self, from, msgs } = block
  const lastTs = msgs[msgs.length - 1].ts

  return (
    <li
      className={`flex flex-col gap-[3px] ${
        self ? "items-end" : "items-start"
      }`}
    >
      {!self && (
        <span className="msg-in mb-0.5 px-1 font-mono text-[11px] text-fog-dim">
          {from}
        </span>
      )}

      {msgs.map((m, i) => (
        <Bubble
          key={m.id}
          msg={m}
          isLast={i === msgs.length - 1}
          flashKey={flash?.id === m.id ? flash.n : 0}
          onReply={onReply}
          onQuoteClick={onQuoteClick}
        />
      ))}

      <span className="flex items-center gap-1.5 px-1 pt-0.5 font-mono text-[10px] text-fog-dim">
        {timeFmt.format(lastTs)}
        {self && (
          <span aria-label="sent" title="sent" className="text-signal/60">
            ✓
          </span>
        )}
      </span>
    </li>
  )
})

/**
 * A single message. Outgoing: a breath of signal on the right. Incoming:
 * raised smoke on the left. One softened corner marks direction — a tail
 * without a cartoon tail.
 */
const Bubble = memo(function Bubble({
  msg,
  isLast,
  flashKey,
  onReply,
  onQuoteClick,
}: {
  msg: ChatMessage
  isLast: boolean
  flashKey: number
  onReply: (ref: ReplyRef) => void
  onQuoteClick: (id: string) => void
}) {
  const { self } = msg
  const tail = isLast ? (self ? "rounded-br-sm" : "rounded-bl-sm") : ""

  const reply = () =>
    onReply({
      id: msg.id,
      from: self ? "you" : msg.from,
      excerpt: msg.text.slice(0, LIMITS.EXCERPT_MAX),
    })

  return (
    <div
      data-mid={msg.id}
      className={`msg-in group relative flex max-w-[85%] items-center gap-1.5 sm:max-w-[70%] ${
        self ? "flex-row-reverse" : ""
      }`}
    >
      <div
        key={flashKey || undefined}
        className={`rounded-lg border px-3.5 py-2 ${tail} ${
          flashKey ? "quote-flash" : ""
        } ${
          self
            ? "border-signal/15 bg-signal/10"
            : "border-fog/10 bg-smoke-2/80"
        }`}
      >
        {msg.replyTo && (
          <button
            type="button"
            onClick={() => onQuoteClick(msg.replyTo!.id)}
            title="Go to original message"
            className="mb-1.5 block w-full cursor-pointer rounded-sm border-l-2 border-signal/50 bg-void/40 px-2.5 py-1.5 text-left outline-none transition-colors duration-300 hover:bg-void/70 focus-visible:ring-2 focus-visible:ring-signal/40"
          >
            <span className="block font-mono text-[10px] text-signal/80">
              {msg.replyTo.from}
            </span>
            <span className="mt-0.5 block truncate text-xs text-fog">
              {msg.replyTo.excerpt}
            </span>
          </button>
        )}
        <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap text-breath">
          {msg.text}
        </p>
      </div>

      <button
        type="button"
        onClick={reply}
        aria-label={`Reply to ${self ? "your message" : msg.from}`}
        className="shrink-0 cursor-pointer rounded-sm p-1 font-mono text-xs text-fog-dim opacity-0 transition-opacity duration-300 outline-none group-hover:opacity-100 hover:text-signal focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-signal/40"
      >
        ↩
      </button>
    </div>
  )
})
