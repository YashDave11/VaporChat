import { useEffect, useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { LEGAL, type LegalDoc } from "@/content/legal"

/**
 * A routed legal page (privacy / terms). Same hairline-list grammar as the
 * entry notice — a screen of the product, not a wall of boilerplate. Reads
 * its copy from content/legal.ts; this file only lays it out.
 */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const ref = useRef<HTMLDivElement>(null)

  // hash routing doesn't reset scroll — do it ourselves on mount
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [doc.kind])

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-legal-item]", {
          opacity: 0,
          y: 18,
          filter: "blur(8px)",
          duration: 0.7,
          ease: "power3.out",
          stagger: 0.05,
        })
      })
    },
    { scope: ref }
  )

  const back = () => {
    if (window.history.length > 1) window.history.back()
    else window.location.hash = "#/"
  }

  return (
    <div ref={ref} className="mx-auto w-full max-w-2xl px-6 py-28 sm:py-32">
      <button
        data-legal-item
        onClick={back}
        className="mb-10 cursor-pointer font-mono text-xs tracking-wider text-fog transition-colors duration-300 hover:text-signal"
      >
        ← back
      </button>

      <p
        data-legal-item
        className="font-mono text-xs tracking-[0.25em] text-fog-dim"
      >
        {doc.eyebrow}
      </p>
      <h1
        data-legal-item
        className="mt-3 font-display text-4xl font-semibold tracking-tight text-breath sm:text-5xl"
      >
        {doc.title}
      </h1>
      <p
        data-legal-item
        className="mt-3 font-mono text-[11px] tracking-wider text-fog-dim"
      >
        Updated {LEGAL.updated}
      </p>
      <p data-legal-item className="mt-6 leading-relaxed text-fog">
        {doc.intro}
      </p>

      <div className="mt-12 border-t hairline">
        {doc.sections.map((s) => (
          <section
            key={s.tag}
            data-legal-item
            className="grid grid-cols-1 gap-2 border-b hairline py-7 sm:grid-cols-[110px_1fr] sm:gap-4 sm:px-4"
          >
            <span className="font-mono text-xs tracking-[0.25em] text-fog-dim">
              {s.tag}
            </span>
            <div>
              <h2 className="font-display text-lg font-medium text-breath">
                {s.title}
              </h2>
              {s.body.map((p, i) => (
                <p
                  key={i}
                  className="mt-2 text-sm leading-relaxed text-fog"
                >
                  {p}
                </p>
              ))}
              {s.bullets && (
                <ul className="mt-3 flex flex-col gap-2" role="list">
                  {s.bullets.map((b, i) => (
                    <li
                      key={i}
                      className="flex gap-2.5 text-sm leading-relaxed text-fog"
                    >
                      <span aria-hidden="true" className="text-signal">
                        ·
                      </span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ))}
      </div>

      <p data-legal-item className="mt-10 font-mono text-[11px] text-fog-dim">
        Plain-language summary of how Vapor works. It does not replace legal
        advice. {" · "}
        <a
          href={doc.kind === "privacy" ? "#/terms" : "#/privacy"}
          className="underline-offset-4 transition-colors duration-300 hover:text-fog hover:underline"
        >
          {doc.kind === "privacy" ? "terms of use" : "privacy policy"}
        </a>
      </p>
    </div>
  )
}
