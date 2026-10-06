import { useEffect, useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import type { CallMode } from "@shared/protocol"
import { Button } from "@/components/ui/button"
import { playCue } from "@/lib/sound"

interface IncomingCallModalProps {
  callerName: string
  mode: CallMode
  onAccept: (mode: CallMode) => void
  onDecline: () => void
}

/**
 * Incoming call alert modal.
 * Pops up when another user in the room initiates an ephemeral voice or video call.
 * Features Vapor's signature frosted glass, pulsing signal ring, chime playback,
 * and clear accept / decline actions.
 */
export function IncomingCallModal({
  callerName,
  mode,
  onAccept,
  onDecline,
}: IncomingCallModalProps) {
  const ref = useRef<HTMLDivElement>(null)
  const acceptBtnRef = useRef<HTMLButtonElement>(null)

  // GSAP entrance animation matching Vapor modal grammar
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-veil]", { opacity: 0, duration: 0.35, ease: "power2.out" })
        gsap.from("[data-panel]", {
          opacity: 0,
          y: 20,
          scale: 0.96,
          filter: "blur(8px)",
          duration: 0.45,
          ease: "power3.out",
        })
      })
    },
    { scope: ref }
  )

  // Play repeating incoming call chime while modal is open
  useEffect(() => {
    playCue("call_ring")
    const interval = setInterval(() => {
      playCue("call_ring")
    }, 3200)

    return () => clearInterval(interval)
  }, [])

  // Auto-focus primary action; handle keyboard shortcuts (Enter to accept, Escape to decline)
  useEffect(() => {
    acceptBtnRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDecline()
      } else if (e.key === "Enter" && !e.shiftKey) {
        onAccept(mode)
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [mode, onAccept, onDecline])

  const isVideo = mode === "video"

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="incoming-call-title"
      aria-describedby="incoming-call-desc"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 sm:px-6"
    >
      {/* Frosted veil */}
      <button
        type="button"
        data-veil
        aria-label="Decline call"
        onClick={onDecline}
        className="absolute inset-0 cursor-default bg-void/80 backdrop-blur-md"
      />

      {/* Incoming Call Card */}
      <div
        data-panel
        className="relative w-full max-w-sm overflow-hidden rounded-md border hairline border-signal/40 bg-smoke/95 p-6 shadow-[0_0_40px_rgba(169,232,220,0.15)] backdrop-blur-xl"
      >
        {/* Top Eyebrow: Live pulse beacon */}
        <div className="flex items-center justify-between pb-3 border-b hairline">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-80" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-signal" />
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-signal font-medium">
              {isVideo ? "Incoming Video Call" : "Incoming Voice Call"}
            </span>
          </div>

          <span className="font-mono text-[9px] tracking-wider text-fog-dim uppercase">
            P2P · ZERO-STORAGE
          </span>
        </div>

        {/* Center caller badge with pulsing ripple rings */}
        <div className="my-6 flex flex-col items-center text-center">
          <div className="relative mb-3 flex items-center justify-center">
            {/* Ambient ripple circles */}
            <span className="absolute h-18 w-18 animate-ping rounded-full bg-signal/15 opacity-75" />
            <span className="absolute h-15 w-15 rounded-full border border-signal/30 bg-signal/5" />

            {/* Avatar circle with caller initial */}
            <div className="relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-signal/70 bg-void font-display text-xl font-bold tracking-tight text-breath shadow-[0_0_20px_rgba(169,232,220,0.25)]">
              {callerName.slice(0, 2).toUpperCase()}
            </div>
          </div>

          <h2
            id="incoming-call-title"
            className="font-display text-lg font-semibold tracking-tight text-breath"
          >
            {callerName}
          </h2>

          <p id="incoming-call-desc" className="mt-1 font-mono text-xs text-fog">
            {isVideo ? "is calling you with video..." : "is calling you..."}
          </p>

          <p className="mt-1.5 font-mono text-[10px] text-fog-dim">
            Direct end-to-end stream · unrecorded & ephemeral
          </p>
        </div>

        {/* Actions Grid */}
        <div className="flex flex-col gap-2 pt-2 border-t hairline">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Primary accept button */}
            <Button
              ref={acceptBtnRef}
              variant="signal"
              size="sm"
              onClick={() => onAccept(mode)}
              className="flex items-center justify-center gap-2 font-mono text-xs font-semibold cursor-pointer shadow-[0_0_15px_rgba(169,232,220,0.3)]"
            >
              {isVideo ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                  <span>Join Video ↗</span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  <span>Join Call ↗</span>
                </>
              )}
            </Button>

            {/* Alternate accept mode (voice if video, or video if voice) */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAccept(isVideo ? "audio" : "video")}
              className="flex items-center justify-center gap-1.5 font-mono text-xs cursor-pointer"
            >
              {isVideo ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                  <span>Voice only</span>
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                  <span>With video</span>
                </>
              )}
            </Button>
          </div>

          {/* Decline button */}
          <Button
            variant="danger"
            size="sm"
            onClick={onDecline}
            className="w-full h-8 font-mono text-[11px] cursor-pointer mt-1 opacity-90 hover:opacity-100"
          >
            Decline
          </Button>
        </div>
      </div>
    </div>
  )
}
