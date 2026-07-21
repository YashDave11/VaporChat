import { useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { Button } from "@/components/ui/button"

/**
 * Matching state: the scanning dial from the landing page, now live.
 * Quiet, patient — a radio searching for a voice.
 */
export function Matching({ onCancel }: { onCancel: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(ref.current, {
          opacity: 0,
          filter: "blur(10px)",
          duration: 0.7,
          ease: "power3.out",
        })
        // a single bright tick sweeping across the dial
        const ticks = gsap.utils.toArray<HTMLElement>("[data-tick]")
        const tl = gsap.timeline({ repeat: -1 })
        ticks.forEach((t, i) => {
          tl.to(
            t,
            { backgroundColor: "#a9e8dc", height: 16, duration: 0.12 },
            i * 0.07
          ).to(
            t,
            { backgroundColor: "rgba(135,142,154,0.25)", height: 8, duration: 0.5 },
            i * 0.07 + 0.12
          )
        })
      })
    },
    { scope: ref }
  )

  return (
    <div
      ref={ref}
      className="mx-auto flex w-full max-w-md flex-col items-center px-6 text-center"
    >
      <div
        aria-hidden="true"
        className="flex h-6 items-center gap-1"
      >
        {Array.from({ length: 32 }, (_, i) => (
          <span
            key={i}
            data-tick
            className="inline-block h-2 w-px bg-fog/25"
          />
        ))}
      </div>

      <p
        role="status"
        className="mt-8 font-display text-2xl font-medium text-breath"
      >
        Listening for a stranger
      </p>
      <p className="mt-2 text-sm text-fog">
        Someone, somewhere, is about to say hello. This usually takes a
        moment.
      </p>

      <Button variant="bare" className="mt-10" onClick={onCancel}>
        never mind →
      </Button>
    </div>
  )
}
