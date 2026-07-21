import { useRef } from "react"
import { useReveal } from "@/hooks/useReveal"

/**
 * Not a stepper: each step IS the piece of UI you'd touch at that moment,
 * shown as an artifact. Name field -> channel choice -> a bubble mid-evaporation.
 */
export function HowItWorks() {
  const ref = useRef<HTMLElement>(null)
  useReveal(ref)

  return (
    <section ref={ref} id="how" className="relative py-28 sm:py-36" aria-labelledby="how-title">
      <div className="mx-auto max-w-6xl px-6">
        <h2
          id="how-title"
          data-reveal
          className="mb-16 font-display text-3xl font-semibold tracking-tight text-breath sm:text-4xl"
        >
          The whole ceremony,
          <br />
          <span className="text-fog">start to gone.</span>
        </h2>

        <div className="grid gap-10 md:grid-cols-3 md:gap-8">
          {/* 1 — the name field */}
          <div data-reveal className="flex flex-col gap-5">
            <div className="rounded-md border border-fog/15 bg-smoke p-5">
              <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.25em] text-fog-dim">
                call yourself anything
              </p>
              <div className="flex items-center rounded-sm border border-fog/25 bg-void px-3.5 py-2.5">
                <span className="text-sm text-breath">wren</span>
                <span className="blink ml-0.5 inline-block h-4 w-px bg-signal" />
              </div>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-fog">
              <span className="text-breath">Type a name.</span> It exists for
              this conversation and identifies nothing.
            </p>
          </div>

          {/* 2 — the channel choice */}
          <div data-reveal className="flex flex-col gap-5">
            <div className="rounded-md border border-fog/15 bg-smoke p-5">
              <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.25em] text-fog-dim">
                where to?
              </p>
              <div className="flex flex-col gap-1.5">
                <div className="rounded-sm border border-signal/40 bg-signal/8 px-3.5 py-2 font-mono text-xs text-breath">
                  a stranger
                </div>
                <div className="rounded-sm border border-transparent px-3.5 py-2 font-mono text-xs text-fog-dim">
                  the lobby
                </div>
                <div className="rounded-sm border border-transparent px-3.5 py-2 font-mono text-xs text-fog-dim">
                  room · <span className="tracking-[0.2em]">····</span>
                </div>
              </div>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-fog">
              <span className="text-breath">Choose a channel.</span> A
              stranger, the lobby, or a room with a 4-character key.
            </p>
          </div>

          {/* 3 — a message mid-evaporation */}
          <div data-reveal className="flex flex-col gap-5">
            <div className="flex min-h-[132px] flex-col justify-center gap-2 rounded-md border border-fog/15 bg-smoke p-5">
              <div
                aria-hidden="true"
                className="self-end rounded-md rounded-br-none bg-signal/12 px-3.5 py-2 text-[13px] text-breath"
              >
                goodnight, whoever you were
              </div>
              <div
                aria-hidden="true"
                className="self-end rounded-md rounded-br-none bg-signal/6 px-3.5 py-2 text-[13px] text-breath/40 blur-[1.5px]"
              >
                goodnight, whoever you were
              </div>
              <div
                aria-hidden="true"
                className="self-end rounded-md rounded-br-none bg-signal/3 px-3.5 py-2 text-[13px] text-breath/10 blur-[3px]"
              >
                goodnight, whoever you were
              </div>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-fog">
              <span className="text-breath">Talk, then leave.</span> The moment
              the chat ends, every message is gone. Everywhere.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
