import { useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"

/**
 * Ambient fog field: three soft blobs drifting very slowly behind the hero.
 * Runs only when motion is allowed; static gradient wash otherwise.
 */
export function FogBackground() {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.to("[data-fog='a']", {
          xPercent: 18,
          yPercent: -12,
          duration: 26,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        })
        gsap.to("[data-fog='b']", {
          xPercent: -14,
          yPercent: 10,
          duration: 32,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        })
        gsap.to("[data-fog='c']", {
          xPercent: 10,
          yPercent: 16,
          duration: 38,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        })
      })
    },
    { scope: ref }
  )

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden"
    >
      <div
        data-fog="a"
        className="fog-blob left-[-10%] top-[-15%] h-[55vh] w-[55vw] bg-[#1a2230]/60"
      />
      <div
        data-fog="b"
        className="fog-blob right-[-15%] top-[20%] h-[60vh] w-[45vw] bg-[#131a1e]/70"
      />
      <div
        data-fog="c"
        className="fog-blob bottom-[-25%] left-[25%] h-[50vh] w-[50vw] bg-[#10151c]/60"
      />
      {/* faint vertical signal line down the page spine */}
      <div className="absolute left-1/2 top-0 h-full w-px bg-gradient-to-b from-transparent via-fog/8 to-transparent" />
    </div>
  )
}
