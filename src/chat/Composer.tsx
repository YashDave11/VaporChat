import { useRef, useState, useEffect, useCallback, memo } from "react"
import type { ReplyRef } from "@shared/protocol"
import { LIMITS } from "@shared/protocol"
import { Button } from "@/components/ui/button"

/**
 * The composer: a multiline line to speak into. Enter sends, Shift+Enter
 * breaks the line. Owns its own text state so keystrokes stay local.
 */

const EMOJI = ["🙂", "😅", "🤍", "👋", "🫥", "🌫️", "🔥", "💭"] as const

export const Composer = memo(function Composer({
  alone,
  replyTo,
  onCancelReply,
  onSend,
  onTyping,
  errorText,
  onClearError,
}: {
  /** the only one in the room — nothing can be sent until someone joins */
  alone: boolean
  replyTo: ReplyRef | null
  onCancelReply: () => void
  onSend: (text: string, replyTo?: ReplyRef) => void
  onTyping: (active: boolean) => void
  errorText: string | null
  onClearError: () => void
}) {
  const [text, setText] = useState("")
  const [emojiOpen, setEmojiOpen] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // typing signal: start once, refresh quietly, stop on idle/send/empty.
  // refs so keystrokes never allocate new closures for the socket layer
  const typingRef = useRef<{ active: boolean; idle?: ReturnType<typeof setTimeout> }>({
    active: false,
  })

  const stopTyping = useCallback(() => {
    const t = typingRef.current
    clearTimeout(t.idle)
    if (t.active) {
      t.active = false
      onTyping(false)
    }
  }, [onTyping])

  const noteTyping = useCallback(
    (hasText: boolean) => {
      const t = typingRef.current
      if (!hasText) {
        stopTyping()
        return
      }
      if (!t.active) {
        t.active = true
        onTyping(true)
      }
      clearTimeout(t.idle)
      // pause → the signal fades on its own before the peer's TTL does
      t.idle = setTimeout(stopTyping, 2000)
    },
    [onTyping, stopTyping]
  )

  // leaving the room mid-thought must not strand an active signal
  useEffect(() => stopTyping, [stopTyping])

  // an armed reply pulls focus into the line
  useEffect(() => {
    if (replyTo) inputRef.current?.focus()
  }, [replyTo])

  /** grow with content, up to ~5 lines */
  const autosize = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
  }, [])

  const send = () => {
    if (alone) return // nobody to hear it — the server would refuse anyway
    const body = text.trim()
    if (!body) return
    stopTyping() // the message itself is the signal now
    onSend(body, replyTo ?? undefined)
    setText("")
    setEmojiOpen(false)
    if (replyTo) onCancelReply()
    requestAnimationFrame(autosize)
    inputRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
    if (e.key === "Escape" && replyTo) {
      e.preventDefault()
      onCancelReply()
    }
  }

  const remaining = LIMITS.MESSAGE_MAX - text.length

  return (
    <div className="border-t hairline pt-3 pb-4">
      {errorText && (
        <p role="alert" className="pb-2 font-mono text-[11px] text-fog">
          {errorText}
        </p>
      )}

      {alone && !errorText && (
        <p role="status" className="pb-2 font-mono text-[11px] text-fog-dim">
          Someone else has to join before you can chat.
        </p>
      )}

      {replyTo && (
        <div className="reply-in mb-2 flex items-center gap-3 rounded-sm border-l-2 border-signal/50 bg-smoke/80 py-2 pr-2 pl-3">
          <div className="min-w-0 flex-1">
            <span className="block font-mono text-[10px] text-signal/80">
              replying to {replyTo.from}
            </span>
            <span className="mt-0.5 block truncate text-xs text-fog">
              {replyTo.excerpt}
            </span>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="shrink-0 cursor-pointer rounded-sm px-2 py-1 font-mono text-sm text-fog-dim transition-colors duration-300 outline-none hover:text-breath focus-visible:ring-2 focus-visible:ring-signal/40"
          >
            ×
          </button>
        </div>
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
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <button
          type="button"
          aria-label="Add emoji"
          aria-expanded={emojiOpen}
          disabled={alone}
          onClick={() => setEmojiOpen((v) => !v)}
          className="flex h-11 w-10 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-fog/20 text-fog transition-colors duration-300 outline-none hover:border-fog/50 hover:text-breath focus-visible:ring-2 focus-visible:ring-signal/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-fog/20 disabled:hover:text-fog"
        >
          <span aria-hidden="true" className="text-base leading-none">☺</span>
        </button>

        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          disabled={alone}
          onChange={(e) => {
            const next = e.target.value.slice(0, LIMITS.MESSAGE_MAX)
            setText(next)
            noteTyping(next.trim().length > 0)
            if (errorText) onClearError()
            autosize()
          }}
          onKeyDown={onKeyDown}
          placeholder={alone ? "waiting for someone to join…" : "say something"}
          aria-label="Message"
          autoComplete="off"
          className="min-h-11 min-w-0 flex-1 resize-none rounded-sm border border-fog/20 bg-smoke/60 px-4 py-2.5 font-body text-[15px] leading-relaxed text-breath placeholder:text-fog-dim outline-none transition-colors duration-300 focus:border-signal/50 focus-visible:ring-2 focus-visible:ring-signal/40 disabled:cursor-not-allowed disabled:opacity-60"
        />

        <Button type="submit" size="default" disabled={alone || !text.trim()}>
          Send
        </Button>
      </form>

      <p className="flex justify-between pt-2 pl-12 font-mono text-[10px] text-fog-dim">
        <span>enter to send · shift+enter for a new line · nothing is stored</span>
        {remaining <= 50 && (
          <span className={remaining <= 10 ? "text-signal" : ""}>
            {remaining}
          </span>
        )}
      </p>
    </div>
  )
})
