import { useRef } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useGSAP } from "@gsap/react"
import { Button } from "@/components/ui/button"
import { useReveal } from "@/hooks/useReveal"

gsap.registerPlugin(ScrollTrigger)

export function FinalCta() {
  const ref = useRef<HTMLElement>(null)
  useReveal(ref)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // "gone" drains away as you scroll past — one last dissolve
        gsap.to("[data-gone]", {
          opacity: 0.15,
          filter: "blur(5px)",
          ease: "none",
          scrollTrigger: {
            trigger: "[data-gone]",
            start: "center 45%",
            end: "center 12%",
            scrub: 0.5,
          },
        })
      })
    },
    { scope: ref }
  )

  return (
    <section ref={ref} id="cta" className="relative py-32 sm:py-44">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-end gap-12 lg:grid-cols-[1.3fr_1fr]">
          <h2
            data-reveal
            className="font-display text-[clamp(2.75rem,8vw,6.5rem)] font-semibold leading-[0.98] tracking-tight text-breath"
          >
            Talk.
            <br />
            <span data-gone className="ghost-word inline-block">
              Then it&rsquo;s gone.
            </span>
          </h2>

          <div data-reveal className="pb-2 lg:justify-self-end">
            <p className="max-w-xs leading-relaxed text-fog">
              No account to make. No inbox to haunt you. The next conversation
              is one name away.
            </p>
            <div className="mt-8 flex flex-col items-start gap-3">
              <Button size="lg" onClick={() => (window.location.hash = "#/chat")}>
                Start chatting
              </Button>
              <button
                onClick={() => (window.location.hash = "#/chat")}
                className="cursor-pointer font-mono text-xs text-fog transition-colors duration-300 hover:text-signal"
              >
                or create a private room →
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function Footer() {
  return (
    <footer className="border-t hairline">
      <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-4 px-6 py-8">
        <span className="font-display text-sm font-medium text-fog">
          vapor
        </span>
        <span className="font-mono text-[11px] text-fog-dim">
          this page set no cookies and will not remember your visit
        </span>
        <span className="font-mono text-[11px] text-fog-dim">
          © {new Date().getFullYear()}, barely
        </span>
      </div>
    </footer>
  )
}
