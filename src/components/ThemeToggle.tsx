import { useSyncExternalStore } from "react"
import { getResolvedTheme, setTheme, subscribeTheme } from "@/lib/theme"

/**
 * The sky switch, in the same grammar as the sound toggle: a tiny instrument
 * plus a mono microlabel. The instrument is a proper pair of glyphs — a clean
 * sun for day, a crescent moon for night — stacked in one square. On a toggle
 * they cross-rotate: the outgoing glyph spins and scales away while the
 * incoming one spins in, a short 220ms move in the app's restrained motion
 * vocabulary. Under prefers-reduced-motion the swap is instant (the
 * `motion-reduce:` variants drop the transition). The aria-label carries the
 * action for screen readers; the glyph and microlabel carry the state for
 * everyone else — no cue is ever the only signal.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribeTheme,
    getResolvedTheme,
    () => "dark" as const
  )
  const light = theme === "light"

  return (
    <button
      type="button"
      role="switch"
      aria-checked={light}
      aria-label={light ? "Switch to night theme" : "Switch to day theme"}
      title={light ? "day" : "night"}
      onClick={() => setTheme(light ? "dark" : "light")}
      className="group flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
    >
      <span aria-hidden="true" className="relative block h-4 w-4">
        {/* sun — solid and present by day, spun out of frame by night */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`absolute inset-0 h-4 w-4 text-signal transition-[opacity,transform] duration-[220ms] ease-out motion-reduce:transition-none ${
            light
              ? "rotate-0 scale-100 opacity-100"
              : "-rotate-90 scale-0 opacity-0"
          }`}
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
        {/* moon — present by night, spun out of frame by day */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`absolute inset-0 h-4 w-4 text-fog transition-[opacity,transform] duration-[220ms] ease-out motion-reduce:transition-none ${
            light
              ? "rotate-90 scale-0 opacity-0"
              : "rotate-0 scale-100 opacity-100"
          }`}
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </span>
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.2em] transition-colors duration-300 ${
          light ? "text-fog" : "text-fog-dim"
        } group-hover:text-fog`}
      >
        {light ? "day" : "night"}
      </span>
    </button>
  )
}
