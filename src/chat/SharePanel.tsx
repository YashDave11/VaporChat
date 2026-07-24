import { useRef, useState, useEffect, useCallback } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import type { RoomJoined } from "@shared/protocol"
import { Button } from "@/components/ui/button"
import { inviteUrl } from "@/lib/urls"

/** the panel's words per room kind — stated once, no branching in the JSX */
const SHARE_COPY: Record<
  string,
  { eyebrow: string; title: string; body: string }
> = {
  private: {
    eyebrow: "invite by link or key",
    title: "One seat. One link.",
    body: "Whoever opens this joins you — and the link dies when the chat does.",
  },
  "private-group": {
    eyebrow: "invite by link or key",
    title: "Your circle. Your door.",
    body: "Hidden from open rooms — only the link or the key gets someone in. Up to ten voices.",
  },
  public: {
    eyebrow: "invite by link",
    title: "Bring someone in.",
    body: "Anyone with this link can step into the room while it's on air.",
  },
}

/**
 * The invite surface: a veil and one small panel, same materials as the
 * vaporize confirm. It holds exactly one idea — "hand someone this room" —
 * with the copy actions as the hero and the native share sheet one step
 * behind them. Keyed rooms also show the spoken key with its own copy:
 * the link is for sending, the key is for saying out loud.
 */
export function SharePanel({
  room,
  onClose,
}: {
  room: RoomJoined
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const copyRef = useRef<HTMLButtonElement>(null)
  /** context-safe copied-feedback pulses, installed by useGSAP below */
  const pulseRef = useRef<((target: string) => void) | null>(null)
  const [copied, setCopied] = useState<"link" | "key" | null>(null)
  const url = inviteUrl(room.invite ?? "")
  // strip the scheme for display — the link reads like an address, not code
  const shownUrl = url.replace(/^https?:\/\//, "")
  const canShare = typeof navigator.share === "function"
  const words = SHARE_COPY[room.kind] ?? SHARE_COPY.public

  useGSAP(
    (_ctx, contextSafe) => {
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
      // copied feedback: the copied line exhales once — quiet confirmation
      const pulse = contextSafe?.((target: string) => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
        gsap.fromTo(
          target,
          { boxShadow: "0 0 0 1px var(--color-signal)" },
          {
            boxShadow: "0 0 0 1px transparent",
            duration: 1.1,
            ease: "power2.out",
          }
        )
      })
      pulseRef.current = pulse ?? null
    },
    { scope: ref }
  )

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied("link")
      pulseRef.current?.("[data-link-line]")
      setTimeout(() => setCopied(null), 1800)
    } catch {
      /* clipboard unavailable — the link is on screen to select by hand */
    }
  }, [url])

  const copyKey = useCallback(async () => {
    if (!room.key) return
    try {
      await navigator.clipboard.writeText(room.key)
      setCopied("key")
      pulseRef.current?.("[data-key-line]")
      setTimeout(() => setCopied(null), 1800)
    } catch {
      /* clipboard unavailable — the key is on screen to say out loud */
    }
  }, [room.key])

  const shareLink = useCallback(() => {
    navigator
      .share({
        title: room.title ? `vapor · ${room.title}` : "vapor",
        text: "Join me for a conversation that vanishes.",
        url,
      })
      .catch(() => {
        /* dismissed the sheet — nothing to do */
      })
  }, [room.title, url])

  // focus lands on the primary action; Escape lets the veil lift
  useEffect(() => {
    copyRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-title"
      className="fixed inset-0 z-40 flex items-center justify-center px-6"
    >
      <button
        type="button"
        data-veil
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-void/70 backdrop-blur-sm"
      />
      <div
        data-panel
        className="relative w-full max-w-sm rounded-sm border border-fog/20 bg-smoke/95 p-6 shadow-[var(--shadow-panel)] backdrop-blur"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-signal/80">
          {words.eyebrow}
        </p>
        <p
          id="share-title"
          className="mt-2 font-display text-xl font-semibold tracking-tight text-breath"
        >
          {words.title}
        </p>
        {room.title && (
          <p className="mt-1 font-mono text-xs text-fog-dim">
            {room.title} ·{" "}
            {room.kind === "public" ? "visible in open rooms" : "hidden from open rooms"}
          </p>
        )}
        <p className="mt-2 text-sm leading-relaxed text-fog">{words.body}</p>

        {/* the link itself: visible, selectable, never precious */}
        <div
          data-link-line
          className="mt-5 flex items-center gap-2 rounded-sm border border-fog/20 bg-void/40 px-3 py-2.5"
        >
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-fog select-all">
            {shownUrl}
          </span>
          <span
            aria-live="polite"
            className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors duration-300 ${
              copied === "link" ? "text-signal" : "text-transparent"
            }`}
          >
            copied
          </span>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button ref={copyRef} size="sm" onClick={copyLink} className="flex-1">
            {copied === "link" ? "Copied" : "Copy Link"}
          </Button>
          {canShare && (
            <Button variant="ghost" size="sm" onClick={shareLink} className="flex-1">
              Share…
            </Button>
          )}
        </div>

        {room.key && (
          <div
            data-key-line
            className="mt-5 flex items-center gap-3 rounded-sm border border-fog/20 bg-void/40 px-3 py-2"
          >
            <span className="min-w-0 flex-1 font-mono text-[11px] text-fog-dim">
              or say it out loud:{" "}
              <span className="tracking-[0.3em] text-signal select-all">
                {room.key}
              </span>
            </span>
            <span
              aria-live="polite"
              className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors duration-300 ${
                copied === "key" ? "text-signal" : "text-transparent"
              }`}
            >
              copied
            </span>
            <Button variant="ghost" size="sm" onClick={copyKey}>
              {copied === "key" ? "Copied" : "Copy Key"}
            </Button>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 cursor-pointer rounded-sm p-1.5 font-mono text-[11px] text-fog-dim transition-colors duration-300 outline-none hover:text-breath focus-visible:ring-2 focus-visible:ring-signal/40"
        >
          esc ✕
        </button>
      </div>
    </div>
  )
}
