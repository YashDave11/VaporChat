import { useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"

const SCRIPT = [
  { who: "wren", text: "you ever just want to talk to nobody in particular?" },
  { who: "you", text: "constantly. that's why i'm here" },
  { who: "wren", text: "no history feels weird at first" },
  { who: "you", text: "then it feels like breathing" },
  { who: "wren", text: "exactly. say it and let it go" },
] as const

/**
 * Signature element: a live room where messages condense in,
 * hang for a moment, then evaporate — the product promise, animated.
 * The loop runs only when the user allows motion.
 */
export function LiveTranscript() {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const rows = gsap.utils.toArray<HTMLElement>("[data-msg]")
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.6 })

        rows.forEach((row, i) => {
          // condense in
          tl.fromTo(
            row,
            { opacity: 0, y: 14, filter: "blur(6px)" },
            { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.55, ease: "power2.out" },
            i * 1.35
          )
        })

        // hold, then evaporate upward in sequence
        rows.forEach((row, i) => {
          tl.to(
            row,
            {
              opacity: 0,
              y: -18,
              filter: "blur(10px)",
              duration: 1.1,
              ease: "power1.in",
            },
            SCRIPT.length * 1.35 + 1.8 + i * 0.22
          )
        })
      })

      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set("[data-msg]", { opacity: 1 })
      })
    },
    { scope: ref }
  )

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="relative rounded-md border border-fog/15 bg-smoke/55 shadow-[0_30px_90px_-30px_rgba(0,0,0,0.8)] backdrop-blur-xl"
    >
      {/* room header */}
      <div className="flex items-center justify-between border-b border-fog/10 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="presence h-1.5 w-1.5 rounded-full bg-signal" />
          <span className="font-mono text-xs text-fog">room · K7XQ</span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-fog-dim">
          unrecorded
        </span>
      </div>

      {/* transcript */}
      <div className="flex min-h-[320px] flex-col justify-end gap-3 px-5 py-6">
        {SCRIPT.map((m, i) => (
          <div
            key={i}
            data-msg
            className={
              m.who === "you"
                ? "self-end rounded-md rounded-br-none bg-signal/12 px-4 py-2.5 text-sm text-breath"
                : "self-start rounded-md rounded-bl-none bg-smoke-2 px-4 py-2.5 text-sm text-fog"
            }
          >
            {m.who !== "you" && (
              <span className="mr-2 font-mono text-[10px] text-fog-dim">
                {m.who}
              </span>
            )}
            {m.text}
          </div>
        ))}
      </div>

      {/* input strip */}
      <div className="flex items-center gap-2 border-t border-fog/10 px-5 py-3.5">
        <span className="font-mono text-xs text-fog-dim">say something</span>
        <span className="blink inline-block h-3.5 w-px bg-signal" />
      </div>
    </div>
  )
}
