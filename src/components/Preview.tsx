import { useRef } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useGSAP } from "@gsap/react"
import { useReveal } from "@/hooks/useReveal"

gsap.registerPlugin(ScrollTrigger)

const LOBBY = [
  { who: "mira", text: "3am and the city is finally quiet", tone: "dim" },
  { who: "sable", text: "quiet here too. what are you listening to?", tone: "dim" },
  { who: "mira", text: "rain on the window, mostly", tone: "dim" },
  { who: "you", text: "that counts as music", tone: "you" },
  { who: "sable", text: "it absolutely does", tone: "dim" },
] as const

/**
 * Product preview: a believable browser frame around the lobby UI,
 * with a slight scroll parallax so it feels like a physical object.
 */
export function Preview() {
  const ref = useRef<HTMLElement>(null)
  useReveal(ref)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          "[data-frame]",
          { y: 60 },
          {
            y: -60,
            ease: "none",
            scrollTrigger: {
              trigger: "[data-frame]",
              start: "top bottom",
              end: "bottom top",
              scrub: 0.8,
            },
          }
        )
      })
    },
    { scope: ref }
  )

  return (
    <section
      ref={ref}
      id="preview"
      className="relative overflow-hidden py-28 sm:py-36"
      aria-labelledby="preview-title"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div data-reveal className="mb-14 max-w-xl">
          <h2
            id="preview-title"
            className="font-display text-3xl font-semibold tracking-tight text-breath sm:text-4xl"
          >
            Tonight, in an open room.
          </h2>
          <p className="mt-4 max-w-md leading-relaxed text-fog">
            No feed, no profiles, no scroll of the past. A room is only ever
            what&rsquo;s being said in it right now.
          </p>
        </div>

        <div data-reveal>
          <div
            data-frame
            className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-fog/15 bg-smoke shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]"
          >
            {/* window strip: no traffic lights, just the address and a live count */}
            <div className="flex items-center justify-between border-b border-fog/10 bg-void/60 px-5 py-3">
              <div className="flex items-center gap-2 font-mono text-[11px] text-fog">
                <svg width="9" height="11" viewBox="0 0 9 11" fill="none" aria-hidden="true">
                  <path
                    d="M2 5V3.5C2 2.1 3.1 1 4.5 1S7 2.1 7 3.5V5M1.5 5h6v5h-6V5Z"
                    stroke="currentColor"
                    strokeWidth="1"
                  />
                </svg>
                vapor.chat/low·static
              </div>
              <div className="flex items-center gap-2 font-mono text-[10px] text-fog-dim">
                <span className="presence h-1 w-1 rounded-full bg-signal" />
                live
              </div>
            </div>

            {/* app UI */}
            <div className="grid sm:grid-cols-[190px_1fr]">
              {/* left rail */}
              <div className="hidden border-r border-fog/10 p-4 sm:block">
                <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.25em] text-fog-dim">
                  channels
                </p>
                {[
                  ["stranger", false],
                  ["low static · 4/10", true],
                  ["room · K7XQ", false],
                ].map(([name, active]) => (
                  <div
                    key={name as string}
                    className={`mb-1 flex items-center gap-2.5 rounded-sm px-3 py-2 font-mono text-xs ${
                      active
                        ? "bg-smoke-2 text-breath"
                        : "text-fog-dim"
                    }`}
                  >
                    <span
                      className={`h-1 w-1 rounded-full ${
                        active ? "bg-signal" : "bg-fog/30"
                      }`}
                    />
                    {name}
                  </div>
                ))}
                <p className="mt-8 border-t hairline pt-4 font-mono text-[10px] leading-relaxed text-fog-dim">
                  4 people here now.
                  <br />
                  0 messages stored.
                </p>
              </div>

              {/* chat pane */}
              <div className="flex min-h-[340px] flex-col">
                <div className="flex flex-1 flex-col justify-end gap-2.5 p-5">
                  {LOBBY.map((m, i) => (
                    <div
                      key={i}
                      className={
                        m.tone === "you"
                          ? "self-end rounded-md rounded-br-none bg-signal/12 px-3.5 py-2 text-[13px] text-breath"
                          : "self-start rounded-md rounded-bl-none bg-smoke-2 px-3.5 py-2 text-[13px] text-fog"
                      }
                      style={{ opacity: 0.55 + i * 0.11 }}
                    >
                      {m.tone !== "you" && (
                        <span className="mr-2 font-mono text-[10px] text-fog-dim">
                          {m.who}
                        </span>
                      )}
                      {m.text}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-fog/10 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-fog-dim">
                      say something
                    </span>
                    <span className="blink inline-block h-3.5 w-px bg-signal" />
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-fog-dim">
                    esc to vanish
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
