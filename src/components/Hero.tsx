import { useRef } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useGSAP } from "@gsap/react"
import { Button } from "@/components/ui/button"
import { FogBackground } from "@/components/FogBackground"
import { LiveTranscript } from "@/components/LiveTranscript"

gsap.registerPlugin(ScrollTrigger)

const VAPOR = "vapor.".split("")

export function Hero() {
  const ref = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline({ defaults: { ease: "power3.out" } })

        tl.from("[data-hero-word]", {
          opacity: 0,
          filter: "blur(14px)",
          y: 24,
          duration: 1.1,
          stagger: 0.14,
        })
          // "vapor." condenses in last, letter by letter…
          .from(
            "[data-vapor-char]",
            {
              opacity: 0,
              filter: "blur(10px)",
              y: 16,
              duration: 0.7,
              stagger: 0.06,
            },
            "-=0.5"
          )
          .from(
            "[data-hero-sub], [data-hero-cta]",
            { opacity: 0, y: 12, duration: 0.7, stagger: 0.08 },
            "-=0.3"
          )
          .from(
            "[data-hero-panel]",
            { opacity: 0, y: 40, filter: "blur(8px)", duration: 1.1 },
            "-=0.5"
          )

        // …then never fully settles: each letter drifts in a slow haze,
        // permanently half-evaporating. The word is never done being said.
        gsap.utils.toArray<HTMLElement>("[data-vapor-char]").forEach((c, i) => {
          gsap.to(c, {
            opacity: 0.25,
            filter: "blur(5px)",
            y: -10,
            duration: 2.4 + i * 0.3,
            ease: "sine.inOut",
            repeat: -1,
            yoyo: true,
            delay: 2.2 + i * 0.35,
          })
        })

        // leaving the hero evaporates the whole composition — scrolling away
        // is itself an act of deletion
        gsap.to("[data-hero-scrub]", {
          opacity: 0,
          y: -60,
          filter: "blur(10px)",
          ease: "none",
          scrollTrigger: {
            trigger: ref.current,
            start: "35% top",
            end: "85% top",
            scrub: 0.6,
          },
        })
      })

      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(
          "[data-hero-word], [data-vapor-char], [data-hero-sub], [data-hero-cta], [data-hero-panel]",
          { opacity: 1 }
        )
      })
    },
    { scope: ref }
  )

  return (
    <section
      ref={ref}
      className="relative flex min-h-svh flex-col justify-center overflow-hidden pt-28 pb-20"
    >
      <FogBackground />

      <div data-hero-scrub className="relative mx-auto w-full max-w-6xl px-6">
        <h1 className="font-display text-[clamp(2.75rem,7.5vw,6.5rem)] font-semibold leading-[0.98] tracking-tight text-breath">
          <span data-hero-word className="inline-block">
            Say
          </span>{" "}
          <span data-hero-word className="inline-block">
            it
          </span>{" "}
          <span data-hero-word className="inline-block">
            once.
          </span>
          <br />
          <span data-hero-word className="inline-block text-fog">
            Then
          </span>{" "}
          <span data-hero-word className="inline-block text-fog">
            it&rsquo;s
          </span>{" "}
          <span className="inline-block" aria-label="vapor.">
            {VAPOR.map((c, i) => (
              <span
                key={i}
                data-vapor-char
                aria-hidden="true"
                className="inline-block text-breath"
              >
                {c}
              </span>
            ))}
          </span>
        </h1>

        {/* copy + CTA left, room panel right — clear of the headline */}
        <div className="mt-12 flex flex-col gap-12 lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-16">
          <div className="max-w-md">
            <p data-hero-sub className="text-lg leading-relaxed text-fog">
              A stranger, a room, or a friend with a key. No signup, no
              profile, no record. When the conversation ends, it never
              happened.
            </p>

            <div className="mt-9 flex flex-wrap items-start gap-4">
              <div data-hero-cta className="flex flex-col items-start gap-2">
                <Button size="lg" onClick={() => (window.location.hash = "#/chat")}>
                  Start chatting
                </Button>
                <span className="pl-0.5 font-mono text-[11px] text-fog-dim">
                  free · no account · you&rsquo;re in before you can blink
                </span>
              </div>
              <Button
                data-hero-cta
                variant="ghost"
                size="lg"
                onClick={() => (window.location.hash = "#/chat")}
              >
                Start a private chat
              </Button>
            </div>
          </div>

          <div data-hero-panel>
            <LiveTranscript />
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-void" />
    </section>
  )
}
