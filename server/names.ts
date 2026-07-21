/**
 * Fallback anonymous names: quiet, atmospheric, on-brand.
 * "wren", "haze", "ember" — lowercase, one word, never clownish.
 */

const NAMES = [
  "wren", "haze", "ember", "sable", "drift", "onyx", "mist", "ash",
  "vale", "echo", "fern", "slate", "rune", "dusk", "moth", "pine",
  "smoke", "frost", "lark", "cove", "night", "reed", "storm", "cloud",
] as const

export function anonymousName(): string {
  const base = NAMES[Math.floor(Math.random() * NAMES.length)]
  // two digits keep collisions rare without turning the name into a serial
  const n = Math.floor(Math.random() * 90) + 10
  return `${base}·${n}`
}

/**
 * Server-assigned public room titles. Two quiet words — atmospheric, never
 * user input, so the directory can't be used as a billboard.
 */

const TITLE_A = [
  "low", "still", "grey", "half", "late", "thin", "pale", "slow",
  "quiet", "small", "cold", "soft",
] as const

const TITLE_B = [
  "static", "signal", "window", "hour", "orbit", "current", "weather",
  "harbor", "channel", "frequency", "tide", "room",
] as const

export function roomTitle(): string {
  const a = TITLE_A[Math.floor(Math.random() * TITLE_A.length)]
  const b = TITLE_B[Math.floor(Math.random() * TITLE_B.length)]
  return `${a} ${b}`
}

/** strip control chars, collapse whitespace, clamp length */
export function sanitizeName(raw: string, max: number): string {
  const cleaned = raw
    .replace(/\p{C}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
  return cleaned || anonymousName()
}
