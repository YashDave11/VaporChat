import { useSyncExternalStore } from "react"
import { getResolvedTheme, setTheme, subscribeTheme } from "@/lib/theme"

/**
 * The sky switch, in the same grammar as the sound toggle: a tiny instrument
 * plus a mono microlabel. The instrument is a horizon — a hairline with a
 * small disc that has either risen above it (day) or set beneath it (night).
 * The label carries the state for screen readers; the horizon carries it for
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
      aria-label={light ? "Day theme — switch to night" : "Night theme — switch to day"}
      title={light ? "day" : "night"}
      onClick={() => setTheme(light ? "dark" : "light")}
      className="group flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
    >
      <span
        aria-hidden="true"
        className="relative block h-3.5 w-4 overflow-hidden"
      >
        {/* the horizon */}
        <span className="absolute inset-x-0 top-1/2 h-px bg-fog/50" />
        {/* the disc: risen and solid by day, set and hollow by night */}
        <span
          className={`absolute left-1/2 h-[7px] w-[7px] -translate-x-1/2 rounded-full transition-all duration-500 ${
            light
              ? "top-0 bg-signal"
              : "top-[8px] border border-fog bg-transparent"
          }`}
        />
      </span>
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.2em] transition-colors duration-500 ${
          light ? "text-fog" : "text-fog-dim"
        } group-hover:text-fog`}
      >
        {light ? "day" : "night"}
      </span>
    </button>
  )
}
