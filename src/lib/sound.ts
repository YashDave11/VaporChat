/**
 * Vapor's sonic identity — one small family of synthesized chimes, no assets.
 *
 * Everything is built from the same two pitches (G4 and D5, with C5+G5 as
 * the resolution) played by the same instrument: a soft sine with a quiet
 * octave partial, one shared envelope, through a gentle lowpass so nothing
 * is ever sharp. Three cues, one grammar:
 *
 *   match — G4 → D5   rising: something found
 *   join  — C5 + G5   a settled dyad: you're in
 *   leave — D5 → G4   the exact mirror of match: released
 *
 * Rules of the house:
 *  - sound is garnish. Every cue pairs with a visual state change and every
 *    failure path is silent — a blocked AudioContext never breaks a flow.
 *  - cues fire from the socket seam only (useChatSession), never from
 *    renders; a per-cue rate limit below guards against duplicate events.
 *  - the mute preference is a device setting, not conversation data, so it
 *    may outlive the session in localStorage.
 */

export type CueName = "match" | "join" | "leave"

const STORE_KEY = "vapor:sound"

// ---- the on/off store (framework-free; React reads it via useSyncExternalStore)

const listeners = new Set<() => void>()

let enabled = true
try {
  enabled = localStorage.getItem(STORE_KEY) !== "off"
} catch {
  /* storage unavailable — default to on for this session */
}

export function isSoundOn(): boolean {
  return enabled
}

export function setSoundOn(on: boolean): void {
  enabled = on
  try {
    localStorage.setItem(STORE_KEY, on ? "on" : "off")
  } catch {
    /* fine — the choice still holds for this session */
  }
  listeners.forEach((l) => l())
  // hearing the choice: the toggle click is a user gesture, so this also
  // unlocks the AudioContext under autoplay policy
  if (on) playCue("join")
}

export function subscribeSound(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

// ---- the instrument

let ctx: AudioContext | null = null
let out: GainNode | null = null

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null
  try {
    if (!ctx) {
      ctx = new AudioContext()
      // one shared voice: everything passes a soft lowpass before the speaker
      const lp = ctx.createBiquadFilter()
      lp.type = "lowpass"
      lp.frequency.value = 2600
      lp.Q.value = 0.4
      out = ctx.createGain()
      out.gain.value = 1
      out.connect(lp)
      lp.connect(ctx.destination)
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => {})
    return ctx
  } catch {
    return null
  }
}

// autoplay policy: warm the context on the first gesture so the first real
// cue (often a match arriving with no click nearby) can actually sound
if (typeof window !== "undefined") {
  const unlock = () => {
    window.removeEventListener("pointerdown", unlock)
    window.removeEventListener("keydown", unlock)
    audio()
  }
  window.addEventListener("pointerdown", unlock, { once: true })
  window.addEventListener("keydown", unlock, { once: true })
}

// ---- the cues: same envelope, same voice, different phrase

const CUES: Record<CueName, { freq: number; at: number }[]> = {
  match: [
    { freq: 392.0, at: 0 }, // G4
    { freq: 587.33, at: 0.11 }, // D5
  ],
  join: [
    { freq: 523.25, at: 0 }, // C5
    { freq: 783.99, at: 0.02 }, // G5 — near-simultaneous: a chord, not a run
  ],
  leave: [
    { freq: 587.33, at: 0 }, // D5
    { freq: 392.0, at: 0.12 }, // G4 — match, mirrored
  ],
}

/** duplicate socket events within this window play once */
const RATE_LIMIT_MS = 350
const lastPlayed: Partial<Record<CueName, number>> = {}

export function playCue(name: CueName): void {
  if (!enabled) return
  const now = performance.now()
  if (now - (lastPlayed[name] ?? -Infinity) < RATE_LIMIT_MS) return
  lastPlayed[name] = now

  const ac = audio()
  if (!ac || !out) return
  try {
    const t0 = ac.currentTime + 0.01
    for (const n of CUES[name]) {
      note(ac, out, n.freq, t0 + n.at)
      note(ac, out, n.freq * 2, t0 + n.at, 0.016) // glassy octave partial
    }
  } catch {
    /* audio is garnish — never let it take the flow down */
  }
}

/** one soft note: fast attack, long exponential release, then cleanup */
function note(
  ac: AudioContext,
  dest: AudioNode,
  freq: number,
  at: number,
  peak = 0.05
): void {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = "sine"
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.linearRampToValueAtTime(peak, at + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.55)
  osc.connect(gain)
  gain.connect(dest)
  osc.start(at)
  osc.stop(at + 0.6)
  osc.onended = () => {
    osc.disconnect()
    gain.disconnect()
  }
}
