import { useRef } from "react"
import { useReveal } from "@/hooks/useReveal"
import { EvaporatingConfession } from "@/components/EvaporatingConfession"

const NOTHINGS = [
  ["accounts", "none"],
  ["message history", "none"],
  ["stored chats", "none"],
  ["tracking profile", "none"],
  ["data to breach", "none"],
] as const

export function Privacy() {
  const ref = useRef<HTMLElement>(null)
  useReveal(ref)

  return (
    <section
      ref={ref}
      id="privacy"
      className="relative bg-smoke/30 py-28 sm:py-40"
      aria-labelledby="privacy-title"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-16 lg:grid-cols-2">
          <div>
            <p
              data-reveal
              aria-hidden="true"
              className="mb-5 font-mono text-xs leading-relaxed text-fog-dim"
            >
              <span className="text-fog">$</span> query archive --all
              <br />
              <span className="text-signal">0 results.</span> there is no
              archive.
            </p>
            <h2
              id="privacy-title"
              data-reveal
              className="font-display text-3xl font-semibold leading-tight tracking-tight text-breath sm:text-5xl"
            >
              We can&rsquo;t leak
              <br />
              what we never keep.
            </h2>
            <p data-reveal className="mt-6 max-w-md leading-relaxed text-fog">
              Vapor holds your conversation in memory only while it&rsquo;s
              alive. Close the tab, end the chat, lose the key — and there is
              nothing left to subpoena, sell, or screenshot from a server.
              Not because we promise not to look. Because there is nothing to
              look at.
            </p>

            {/* the ledger of nothing */}
            <dl data-reveal className="mt-10 max-w-md">
              {NOTHINGS.map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-baseline justify-between border-b hairline py-3"
                >
                  <dt className="text-sm text-fog">{k}</dt>
                  <dd className="font-mono text-xs uppercase tracking-[0.2em] text-signal">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* a confession types itself out, hangs, and evaporates on loop */}
          <div data-reveal>
            <EvaporatingConfession />
          </div>
        </div>
      </div>
    </section>
  )
}
