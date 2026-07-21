/**
 * Vapor's two skies — night vapor and morning fog — behind one switch.
 *
 * The rules of the house (same contract as sound.ts):
 *  - by default the site wears whatever the visitor's system prefers, live:
 *    if they flip their OS theme mid-session and never touched our toggle,
 *    we follow.
 *  - one deliberate toggle sets an override, and the override is a device
 *    setting, not conversation data, so it may outlive the session in
 *    localStorage.
 *  - the actual theming is CSS: everything keys off `data-theme` on <html>,
 *    which an inline script in index.html sets before first paint so there
 *    is never a flash of the wrong sky. This store just keeps that
 *    attribute, the meta theme-color, and React subscribers in agreement.
 */

export type ResolvedTheme = "light" | "dark"

const STORE_KEY = "vapor:theme"
const META_COLOR: Record<ResolvedTheme, string> = {
  dark: "#08090b",
  light: "#e8edf0",
}

// ---- the store (framework-free; React reads it via useSyncExternalStore)

const listeners = new Set<() => void>()

/** "light" | "dark" = user override; null = follow the system */
let override: ResolvedTheme | null = null
try {
  const stored = localStorage.getItem(STORE_KEY)
  if (stored === "light" || stored === "dark") override = stored
} catch {
  /* storage unavailable — follow the system for this session */
}

const systemLight =
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-color-scheme: light)")
    : null

export function getResolvedTheme(): ResolvedTheme {
  if (override) return override
  return systemLight?.matches ? "light" : "dark"
}

export function subscribeTheme(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** write the resolved theme onto the document — the single source CSS reads */
function apply(): void {
  const theme = getResolvedTheme()
  document.documentElement.dataset.theme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", META_COLOR[theme])
}

/**
 * One restrained crossfade between skies via the View Transition API —
 * skipped under reduced motion, a plain cut where unsupported. No
 * per-element CSS transitions, so GSAP never has to fight the browser.
 */
function withCrossfade(fn: () => void): void {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => unknown
  }
  if (
    !doc.startViewTransition ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    fn()
    return
  }
  doc.startViewTransition(fn)
}

export function setTheme(theme: ResolvedTheme): void {
  override = theme
  try {
    localStorage.setItem(STORE_KEY, theme)
  } catch {
    /* fine — the choice still holds for this session */
  }
  withCrossfade(apply)
  listeners.forEach((l) => l())
}

// no override yet → the system preference stays live
systemLight?.addEventListener("change", () => {
  if (override) return
  apply()
  listeners.forEach((l) => l())
})

// ---- token readers for the few places JS must know a color (GSAP, Vanta)

/** resolved value of a CSS custom property, e.g. tokenColor("--color-signal") */
export function tokenColor(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
}

/** same token as an rgba() string — for animated shadows and dimmed ticks */
export function tokenRGBA(name: string, alpha: number): string {
  const hex = tokenColor(name).replace("#", "")
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex
  const n = parseInt(full.slice(0, 6), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}
