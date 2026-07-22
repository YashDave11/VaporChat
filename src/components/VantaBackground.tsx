import { useEffect, useRef, useSyncExternalStore } from "react"
import { getResolvedTheme, subscribeTheme, type ResolvedTheme } from "@/lib/theme"

/**
 * Vanta NET constellation, tuned to the Vapor palette: faint signal-mint
 * lines drifting in the void, like a network you can see but not record.
 * three.js + vanta load lazily so the initial bundle stays lean, and the
 * whole effect is skipped under prefers-reduced-motion.
 *
 * Vanta bakes its colors into materials at construction, so a theme change
 * rebuilds the effect — the View Transition crossfade covers the seam.
 */
const NET_PALETTE: Record<ResolvedTheme, { color: number; bg: number }> = {
  // night: dim condensation-mint on void
  dark: { color: 0x2e5850, bg: 0x08090b },
  // morning: sea-glass threads a breath deeper than the mist
  light: { color: 0x7fb5aa, bg: 0xe8edf0 },
}

export function VantaBackground() {
  const ref = useRef<HTMLDivElement>(null)
  const theme = useSyncExternalStore(subscribeTheme, getResolvedTheme, () => "dark" as const)

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
      const win = typeof window !== "undefined" ? (window as unknown as Record<string, Record<string, unknown>>) : undefined
      const NET = (
        typeof dflt === "function"
          ? dflt
          : typeof dflt?.default === "function"
            ? dflt.default
            : typeof mod._vantaEffect === "function"
              ? mod._vantaEffect
              : typeof win?.VANTA === "object" && typeof win.VANTA?.NET === "function"
                ? win.VANTA.NET
                : undefined
      ) as ((options: Record<string, unknown>) => { destroy(): void }) | undefined
      if (typeof NET !== "function") {
        console.warn("vanta NET export not found; skipping background")
        return
      }
      const palette = NET_PALETTE[theme]
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
        color: palette.color,
        backgroundColor: palette.bg,
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
  }, [theme])

  return (
    <div ref={ref} aria-hidden="true" className="fixed inset-0 z-0" />
  )
}
