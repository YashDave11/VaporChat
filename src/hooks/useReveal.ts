import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useGSAP } from "@gsap/react"
import type { RefObject } from "react"

gsap.registerPlugin(ScrollTrigger)

/**
 * Shared entrance: elements tagged [data-reveal] inside `scope`
 * condense in (blur -> sharp) when they scroll into view.
 * No-op transform under reduced motion.
 */
export function useReveal(scope: RefObject<HTMLElement | null>) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia()

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
          gsap.from(el, {
            opacity: 0,
            y: 28,
            filter: "blur(8px)",
            duration: 1,
            ease: "power3.out",
            scrollTrigger: {
              trigger: el,
              start: "top 82%",
              toggleActions: "play none none none",
            },
          })
        })
      })
    },
    { scope }
  )
}
