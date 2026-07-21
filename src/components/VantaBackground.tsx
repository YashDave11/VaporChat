import { useEffect, useRef } from "react"

/**
 * Vanta NET constellation, tuned to the Vapor palette: faint signal-mint
 * lines drifting in the void, like a network you can see but not record.
 * three.js + vanta load lazily so the initial bundle stays lean, and the
 * whole effect is skipped under prefers-reduced-motion.
 */
export function VantaBackground() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    let effect: { destroy(): void } | null = null
    let cancelled = false

    Promise.all([
      import("three"),
      import("vanta/dist/vanta.net.min"),
    ]).then(([THREE, vantaModule]) => {
      if (cancelled || !ref.current) return
      // vanta ships a UMD bundle; depending on interop the factory can land
      // on default, default.default, or the _vantaEffect global export
      const mod = vantaModule as Record<string, unknown>
      const dflt = mod.default as Record<string, unknown> | undefined
      const NET = (
        typeof dflt === "function"
          ? dflt
          : typeof dflt?.default === "function"
            ? dflt.default
            : mod._vantaEffect
      ) as ((options: Record<string, unknown>) => { destroy(): void }) | undefined
      if (typeof NET !== "function") {
        console.warn("vanta NET export not found; skipping background")
        return
      }
      effect = NET({
        el: ref.current,
        THREE,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200.0,
        minWidth: 200.0,
        scale: 1.0,
        scaleMobile: 1.0,
        // palette-matched: dim condensation-mint on void
        color: 0x2e5850,
        backgroundColor: 0x08090b,
        backgroundAlpha: 1,
        points: 9.0,
        maxDistance: 21.0,
        spacing: 17.0,
        showDots: true,
      })
    })

    return () => {
      cancelled = true
      effect?.destroy()
    }
  }, [])

  return (
    <div ref={ref} aria-hidden="true" className="fixed inset-0 z-0" />
  )
}
