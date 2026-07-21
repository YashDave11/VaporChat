/**
 * Name hygiene. There are no fallback names anymore — a name is something
 * you choose, and choosing one is the price of entry. Sanitizers return ""
 * when nothing survives cleaning; callers decide what that means.
 */

/** strip control chars, collapse whitespace, clamp length */
export function sanitizeName(raw: string, max: number): string {
  return raw
    .replace(/\p{C}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

/**
 * Room names: same hygiene as display names, slightly longer leash.
 * User input now — the directory shows it, so control chars and whitespace
 * games are stripped, but the words are theirs.
 */
export function sanitizeRoomName(raw: string, max: number): string {
  return sanitizeName(raw, max)
}
