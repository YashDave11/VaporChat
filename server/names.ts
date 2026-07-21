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

/** strip control chars, collapse whitespace, clamp length */
export function sanitizeName(raw: string, max: number): string {
  const cleaned = raw
    .replace(/\p{C}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
  return cleaned || anonymousName()
}
