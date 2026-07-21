import { useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { useReveal } from "@/hooks/useReveal"

const KEY = ["K", "7", "X", "Q"]
const GLYPHS = "ABCDEFGHJKMNPQRSTVWXYZ2345679"

const MODES = [
  {
    freq: "CH·01",
    name: "Stranger",
    desc: "One tap pairs you with someone, somewhere. No profile to judge, no follow button after. Just two people and a blank line.",
    meta: "you ↔ one unknown",
  },
  {
    freq: "CH·02",
    name: "Lobby",
    desc: "An open room that anyone can drift through. Voices come and go. Nobody keeps a list of who was there.",
    meta: "you ↔ whoever's around",
  },
  {
    freq: "CH·03",
    name: "Private room",
    desc: "Four characters. Share them with someone you trust, talk, and let the key die with the room.",
    meta: "you ↔ people with the key",
  },
] as const

export function Modes() {
  const ref = useRef<HTMLElement>(null)
  useReveal(ref)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // the room key never settles: every second each cell flashes to a
        // fresh glyph — keys are minted, shared, and discarded forever.
        // Cells re-roll on offset beats so the key ripples left to right.
        const cells = gsap.utils.toArray<HTMLElement>("[data-key-cell]")

        cells.forEach((cell, i) => {
          const reroll = () => {
            cell.textContent =
              GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
            // brief mint flash + blur-in on each new glyph
            gsap.fromTo(
              cell,
              {
                color: "#a9e8dc",
                filter: "blur(3px)",
                boxShadow: "0 0 14px rgba(169,232,220,0.35)",
              },
              {
                color: "#a9e8dc",
                filter: "blur(0px)",
                boxShadow: "0 0 0px rgba(169,232,220,0)",
                duration: 0.45,
                ease: "power2.out",
              }
            )
          }

          gsap
            .timeline({ repeat: -1, delay: i * 0.12 })
            .call(reroll)
            .to({}, { duration: 1 })
        })
      })
    },
    { scope: ref }
  )

  return (
    <section ref={ref} id="modes" className="relative py-28 sm:py-36" aria-labelledby="modes-title">
      <div className="mx-auto max-w-6xl px-6">
        {/* header device: a channel-dial readout, not an eyebrow */}
        <div data-reveal className="mb-16 flex flex-wrap items-end justify-between gap-6">
          <h2
            id="modes-title"
            className="font-display text-3xl font-semibold tracking-tight text-breath sm:text-4xl"
          >
            Pick a channel.
            <br />
            Start talking.
          </h2>
          <div
            aria-hidden="true"
            className="hidden items-center gap-1 pb-1.5 font-mono text-[11px] text-fog-dim sm:flex"
          >
            {Array.from({ length: 24 }, (_, i) => (
              <span
                key={i}
                className={`inline-block w-px ${
                  i % 8 === 4 ? "h-4 bg-signal/70" : "h-2 bg-fog/25"
                }`}
              />
            ))}
            <span className="ml-3">scanning</span>
          </div>
        </div>

        <ul className="border-t hairline">
          {MODES.map((m) => (
            <li
              key={m.freq}
              data-reveal
              className="group grid gap-4 border-b hairline py-9 transition-colors duration-500 hover:bg-smoke/40 sm:grid-cols-[110px_1fr_auto] sm:items-baseline sm:gap-10 sm:px-4"
            >
              <span className="font-mono text-xs tracking-[0.25em] text-fog-dim transition-colors duration-500 group-hover:text-signal">
                {m.freq}
              </span>
              <div>
                <h3 className="font-display text-2xl font-medium text-breath">
                  {m.name}
                </h3>
                <p className="mt-2 max-w-lg leading-relaxed text-fog">
                  {m.desc}
                </p>
              </div>
              <span className="hidden font-mono text-[11px] text-fog-dim md:block">
                {m.meta}
              </span>
            </li>
          ))}
        </ul>

        {/* private-room key, shown as the one artifact you ever share */}
        <div data-reveal data-key-row className="mt-14 flex flex-wrap items-center gap-5">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-fog-dim">
            a room key is all you ever share
          </span>
          <div className="flex gap-2" aria-hidden="true">
            {KEY.map((c, i) => (
              <span
                key={i}
                data-key-cell
                className="flex h-11 w-10 items-center justify-center rounded-sm border border-fog/20 bg-smoke font-mono text-lg text-signal"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
