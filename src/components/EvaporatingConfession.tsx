import { useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"

const CONFESSIONS = [
  "i never told anyone this…",
  "3:07 am. tell me something true.",
  "promise this stays between us?",
]

/**
 * A message writes itself, hangs in the air, then evaporates
 * character by character — the whole product lifecycle on loop.
 * Under reduced motion it renders a single static line.
 */
export function EvaporatingConfession() {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const lines = gsap.utils.toArray<HTMLElement>("[data-line]")
        const master = gsap.timeline({ repeat: -1 })

        lines.forEach((line) => {
          const chars = Array.from(
            line.querySelectorAll<HTMLElement>("[data-c]")
          )
          const tl = gsap.timeline()

          // type in: chars appear crisply, left to right
          tl.set(line, { autoAlpha: 1 })
            .fromTo(
              chars,
              { opacity: 0 },
              { opacity: 1, duration: 0.02, stagger: 0.055, ease: "none" }
            )
            // hang in the air
            .to({}, { duration: 1.6 })
            // evaporate: each char drifts up on its own path and blurs out
            .to(chars, {
              opacity: 0,
              filter: "blur(8px)",
              y: () => gsap.utils.random(-34, -14),
              x: () => gsap.utils.random(-8, 8),
              duration: 1.2,
              stagger: { each: 0.035, from: "random" },
              ease: "power1.in",
            })
            .set(line, { autoAlpha: 0 })
            .set(chars, { opacity: 0, filter: "blur(0px)", x: 0, y: 0 })

          master.add(tl, "+=0.4")
        })
      })

      mm.add("(prefers-reduced-motion: reduce)", () => {
        const first = ref.current?.querySelector<HTMLElement>("[data-line]")
        if (first) {
          gsap.set(first, { autoAlpha: 1 })
          gsap.set(first.querySelectorAll("[data-c]"), { opacity: 1 })
        }
      })
    },
    { scope: ref }
  )

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="relative flex min-h-[220px] items-center justify-center lg:min-h-full"
    >
      {/* faint rising haze under the text */}
      <div className="absolute inset-x-8 bottom-4 top-1/2 bg-gradient-to-t from-signal/4 to-transparent blur-2xl" />

      <div className="relative grid w-full max-w-sm [grid-template-areas:'line']">
        {CONFESSIONS.map((phrase, li) => (
          <p
            key={li}
            data-line
            className="invisible font-display text-3xl font-medium leading-snug text-breath/90 [grid-area:line] sm:text-4xl"
          >
            {phrase.split("").map((c, ci) => (
              <span key={ci} data-c className="inline-block whitespace-pre opacity-0">
                {c === " " ? " " : c}
              </span>
            ))}
            <span className="blink ml-1 inline-block h-6 w-px bg-signal align-middle sm:h-7" />
          </p>
        ))}
      </div>
    </div>
  )
}
