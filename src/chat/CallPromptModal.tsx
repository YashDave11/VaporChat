import { useEffect, useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import type { CallMode } from "@shared/protocol"
import { Button } from "@/components/ui/button"

interface CallPromptModalProps {
  onStart: (mode: CallMode) => void
  onCancel: () => void
}

/**
 * Ephemeral call mode selector modal.
 * Follows Vapor's dialog grammar (data-veil, data-panel, hairline borders,
 * frosted backdrop, Escape key dismiss, GSAP condense animation).
 */
export function CallPromptModal({ onStart, onCancel }: CallPromptModalProps) {
  const ref = useRef<HTMLDivElement>(null)
  const voiceBtnRef = useRef<HTMLButtonElement>(null)

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

  useEffect(() => {
    voiceBtnRef.current?.focus()
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
      aria-labelledby="call-modal-title"
      aria-describedby="call-modal-desc"
      className="fixed inset-0 z-40 flex items-center justify-center px-6"
    >
      <button
        type="button"
        data-veil
        aria-label="Close"
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-void/70 backdrop-blur-sm"
      />
      <div
        data-panel
        className="relative w-full max-w-sm rounded-sm border border-fog/20 bg-smoke/95 p-6 shadow-[var(--shadow-panel)] backdrop-blur"
      >
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-signal" />
          <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-fog-dim">
            Ephemeral Call
          </span>
        </div>

        <p
          id="call-modal-title"
          className="mt-2 font-display text-xl font-semibold tracking-tight text-breath"
        >
          Start a call
        </p>
        <p id="call-modal-desc" className="mt-2 text-sm leading-relaxed text-fog">
          Direct peer-to-peer media stream. Encrypted end-to-end, zero audio/video stored or kept. The chat remains active during the call.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            ref={voiceBtnRef}
            onClick={() => onStart("audio")}
            className="group flex cursor-pointer flex-col items-start gap-1 rounded-sm border border-fog/20 bg-void/50 p-3 text-left transition-all duration-300 hover:border-signal/50 hover:bg-signal/5 focus-visible:ring-2 focus-visible:ring-signal/40"
          >
            <span className="font-mono text-xs font-medium text-breath group-hover:text-signal">
              ● Voice call
            </span>
            <span className="font-mono text-[10px] text-fog-dim">
              Audio only · low latency
            </span>
          </button>

          <button
            type="button"
            onClick={() => onStart("video")}
            className="group flex cursor-pointer flex-col items-start gap-1 rounded-sm border border-fog/20 bg-void/50 p-3 text-left transition-all duration-300 hover:border-signal/50 hover:bg-signal/5 focus-visible:ring-2 focus-visible:ring-signal/40"
          >
            <span className="font-mono text-xs font-medium text-breath group-hover:text-signal">
              ▲ Video call
            </span>
            <span className="font-mono text-[10px] text-fog-dim">
              Voice + live camera
            </span>
          </button>
        </div>

        <div className="mt-5 flex items-center justify-end">
          <Button variant="bare" size="sm" onClick={onCancel}>
            cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
