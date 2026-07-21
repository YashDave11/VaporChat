import { useRef, useSyncExternalStore } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { Button } from "@/components/ui/button"
import { LIMITS } from "@shared/protocol"
import {
  getResolvedTheme,
  subscribeTheme,
  tokenColor,
  tokenRGBA,
} from "@/lib/theme"
import type { ChatSession, MatchState } from "./useChatSession"

/**
 * Matching state: the scanning dial from the landing page, now live — and
 * now the site of consent. Three phases, one instrument:
 *
 *   searching  — the dial sweeps, a live count of who else is listening
 *   candidate  — the dial LOCKS: ticks settle into a steady centered
 *                waveform and a name surfaces. Nothing starts until you
 *                both say yes.
 *   waiting    — you said hello; the signal holds while they decide
 *
 * A hairline clock drains across the consent window so time pressure is
 * visible but never shouted.
 */

const TICKS = 32
const CENTER = (TICKS - 1) / 2

/** the locked waveform: a quiet gaussian peak, brightest at the center.
    Colors come off the live tokens so the dial follows the theme. */
function lockShape(i: number) {
  const t = Math.exp(-((i - CENTER) ** 2) / 20)
  return {
    height: 4 + 12 * t,
    backgroundColor:
      t > 0.5
        ? tokenColor("--color-signal")
        : tokenRGBA("--color-fog", 0.2 + 0.35 * t),
  }
}

export function Matching({ session }: { session: ChatSession }) {
  const ref = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  /** consent clock anchor — set when a candidate arrives, read by the bar */
  const deadlineRef = useRef(0)
  const lastCandidateRef = useRef<string | null>(null)

  const match: MatchState =
    session.stage.view === "matching"
      ? session.stage.match
      : { phase: "searching", candidate: null, peerAccepted: false, note: null }
  const { phase, candidate, peerAccepted, note } = match
  const deciding = phase !== "searching"
  // re-run the dial's GSAP setup when the sky changes so its inline colors follow
  const theme = useSyncExternalStore(subscribeTheme, getResolvedTheme, () => "dark" as const)

  // ---- the dial: sweep while searching, lock when a signal is found ----
  useGSAP(
    () => {
      const ticks = gsap.utils.toArray<HTMLElement>("[data-tick]")
      const signal = tokenColor("--color-signal")
      const fogDim = tokenRGBA("--color-fog", 0.25)
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        if (!deciding) {
          // a single bright tick sweeping across the dial
          const tl = gsap.timeline({ repeat: -1 })
          ticks.forEach((t, i) => {
            tl.to(
              t,
              { backgroundColor: signal, height: 16, duration: 0.12 },
              i * 0.07
            ).to(
              t,
              {
                backgroundColor: fogDim,
                height: 8,
                duration: 0.5,
              },
              i * 0.07 + 0.12
            )
          })
        } else {
          // signal found: the sweep dies and the dial settles, center-out
          ticks.forEach((t, i) => {
            gsap.to(t, {
              ...lockShape(i),
              duration: 0.6,
              delay: Math.abs(i - CENTER) * 0.02,
              ease: "power3.out",
            })
          })
        }
      })
      mm.add("(prefers-reduced-motion: reduce)", () => {
        // no motion — but the locked/searching states must still read
        ticks.forEach((t, i) => {
          gsap.set(
            t,
            deciding
              ? lockShape(i)
              : { height: 8, backgroundColor: fogDim }
          )
        })
      })
    },
    { scope: ref, dependencies: [deciding, theme], revertOnUpdate: true }
  )

  // ---- phase content: each state breathes in, never snaps ----
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-phase-item]", {
          opacity: 0,
          y: 12,
          filter: "blur(6px)",
          duration: 0.6,
          ease: "power3.out",
          stagger: 0.08,
        })
      })
    },
    { scope: ref, dependencies: [phase, candidate], revertOnUpdate: true }
  )

  // ---- the consent clock: one hairline, draining in real time ----
  // Anchored to the candidate's arrival so the candidate → waiting
  // transition never resets it — the window is shared, and so is the bar.
  useGSAP(
    () => {
      if (!candidate || !barRef.current) {
        // between candidates: a new arrival must restart the clock, even
        // if the next stranger happens to wear the same name
        lastCandidateRef.current = null
        return
      }
      if (lastCandidateRef.current !== candidate) {
        lastCandidateRef.current = candidate
        deadlineRef.current = Date.now() + LIMITS.CONSENT_WINDOW_MS
      }
      const remaining = Math.max(deadlineRef.current - Date.now(), 0)
      gsap.fromTo(
        barRef.current,
        { scaleX: remaining / LIMITS.CONSENT_WINDOW_MS },
        { scaleX: 0, duration: remaining / 1000, ease: "none" }
      )
    },
    { scope: ref, dependencies: [candidate], revertOnUpdate: true }
  )

  return (
    <div
      ref={ref}
      className="mx-auto flex w-full max-w-md flex-col items-center px-6 text-center"
    >
      <div aria-hidden="true" className="flex h-6 items-center gap-1">
        {Array.from({ length: TICKS }, (_, i) => (
          <span key={i} data-tick className="inline-block h-2 w-px bg-fog/25" />
        ))}
      </div>

      {phase === "searching" && (
        <>
          <p
            data-phase-item
            role="status"
            className="mt-8 font-display text-2xl font-medium text-breath"
          >
            Listening for a stranger
          </p>
          <p data-phase-item className="mt-2 text-sm text-fog">
            {note ??
              "Someone, somewhere, is about to say hello. This usually takes a moment."}
          </p>
          <LiveCount count={session.queueCount} />
        </>
      )}

      {phase === "candidate" && candidate && (
        <>
          <p
            data-phase-item
            className="mt-8 font-mono text-[11px] uppercase tracking-[0.25em] text-signal/80"
          >
            signal · found
          </p>
          <p
            data-phase-item
            role="status"
            className="mt-3 font-display text-3xl font-semibold tracking-tight text-breath"
          >
            {candidate}
          </p>
          <p data-phase-item className="mt-3 text-sm text-fog">
            is on the other end. Do you want to chat with them?
          </p>
          {peerAccepted && (
            <p
              data-phase-item
              role="status"
              className="mt-2 font-mono text-[11px] text-signal/80"
            >
              they already said yes — your call.
            </p>
          )}
          <div data-phase-item className="mt-8 flex items-center gap-3">
            <Button onClick={session.acceptCandidate}>Say hello</Button>
            <Button variant="ghost" onClick={session.declineCandidate}>
              Keep looking
            </Button>
          </div>
        </>
      )}

      {phase === "waiting" && candidate && (
        <>
          <p
            data-phase-item
            role="status"
            className="mt-8 font-display text-2xl font-medium text-breath"
          >
            You said hello
          </p>
          <p data-phase-item className="mt-2 text-sm text-fog">
            Waiting for {candidate} to accept&hellip; if they pass, the search
            quietly continues.
          </p>
        </>
      )}

      {deciding && (
        <div
          data-phase-item
          aria-hidden="true"
          className="mt-8 h-px w-56 overflow-hidden bg-fog/15"
        >
          <div ref={barRef} className="h-full w-full origin-left bg-signal/70" />
        </div>
      )}

      <Button variant="bare" className="mt-10" onClick={session.cancelQueue}>
        never mind &rarr;
      </Button>
    </div>
  )
}

/**
 * The live count of identities out searching — refreshes and second tabs
 * don't inflate it. The number slips in on change; the sentence stays put.
 */
function LiveCount({ count }: { count: number }) {
  const ref = useRef<HTMLParagraphElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-count]", {
          y: 8,
          opacity: 0,
          filter: "blur(3px)",
          duration: 0.45,
          ease: "power2.out",
        })
      })
    },
    { scope: ref, dependencies: [count] }
  )

  return (
    <p
      ref={ref}
      data-phase-item
      className="mt-7 flex items-baseline justify-center gap-2 font-mono text-[11px] text-fog-dim"
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 translate-y-[-1px] animate-pulse rounded-full bg-signal/70 motion-reduce:animate-none"
      />
      {count <= 1 ? (
        <span data-count>just you out here — give it a moment</span>
      ) : (
        <span>
          <span data-count className="inline-block text-fog">
            {count}
          </span>{" "}
          listening right now
        </span>
      )}
    </p>
  )
}
