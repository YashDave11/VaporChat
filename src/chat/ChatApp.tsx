import { useRef, useState, useSyncExternalStore } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import type { EndCause } from "@shared/protocol"
import { Button } from "@/components/ui/button"
import { VaporField, type VaporIntensity } from "@/components/VaporField"
import { ThemeToggle } from "@/components/ThemeToggle"
import { isSoundOn, setSoundOn, subscribeSound } from "@/lib/sound"
import { useChatSession } from "./useChatSession"
import { Gate } from "./Gate"
import { PreChatNotice, hasAcceptedNotice } from "./PreChatNotice"
import { Matching } from "./Matching"
import { JoinGate } from "./JoinGate"
import { Room } from "./Room"

/** each view sets how far the atmosphere leans into the frame */
const VAPOR_BY_VIEW: Record<string, VaporIntensity> = {
  gate: "cinematic",
  matching: "heightened",
  invite: "heightened",
  room: "quiet",
  ended: "cinematic",
}

/**
 * The product shell. One screen at a time — gate, matching, room, or the
 * after-image of a room that just vaporized.
 */
export function ChatApp() {
  const session = useChatSession()
  const view = session.stage.view
  // read-once acknowledgement — per tab, like the name and the resume token.
  // A resumed seat or an invite link still passes through it on a fresh tab.
  const [accepted, setAccepted] = useState(hasAcceptedNotice)

  return (
    <div className="relative flex min-h-svh flex-col">
      <VaporField
        intensity={accepted ? (VAPOR_BY_VIEW[view] ?? "cinematic") : "cinematic"}
      />

      <header className="relative z-10 mx-auto flex w-full max-w-2xl items-center justify-between px-6 py-6">
        <a
          href="#/"
          onClick={() => session.backToGate()}
          className="font-display text-lg font-semibold tracking-wide text-breath outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
        >
          vapor
          <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-signal align-middle" />
        </a>
        <div className="flex items-center gap-4">
          {/* not on the gate or a doorstep — both are still asking who you are */}
          {session.name && view !== "gate" && view !== "invite" && (
            <span className="font-mono text-xs text-fog-dim">
              you are <span className="text-fog">{session.name}</span>
            </span>
          )}
          <ThemeToggle />
          <SoundToggle />
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col justify-center pb-10">
        {!accepted ? (
          <PreChatNotice
            onAccept={() => setAccepted(true)}
            onDecline={() => {
              window.location.hash = "#/"
            }}
          />
        ) : (
          <>
            {view === "gate" && <Gate session={session} />}
            {view === "matching" && <Matching session={session} />}
            {view === "invite" && <JoinGate session={session} />}
            {view === "room" && <Room session={session} />}
            {view === "ended" && session.stage.view === "ended" && (
              <Ended
                reason={session.stage.reason}
                cause={session.stage.cause}
                by={session.stage.by}
                selfName={session.name}
                onBack={session.backToGate}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}

/**
 * The sound switch: a tiny waveform that flattens when muted. Session-global,
 * remembered per device. Its label carries the state for screen readers; the
 * flat line carries it for everyone else — no cue is ever the only signal.
 */
function SoundToggle() {
  const on = useSyncExternalStore(subscribeSound, isSoundOn, () => true)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? "Sound on — mute cues" : "Sound off — unmute cues"}
      title={on ? "sound on" : "sound off"}
      onClick={() => setSoundOn(!on)}
      className="group flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
    >
      <span aria-hidden="true" className="flex h-3.5 items-center gap-[2.5px]">
        {[7, 12, 5, 10, 6].map((h, i) => (
          <span
            key={i}
            className={`w-px rounded-full transition-all duration-500 ${
              on ? "bg-signal/70" : "bg-fog-dim"
            }`}
            style={{ height: on ? `${h}px` : "1.5px" }}
          />
        ))}
      </span>
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.2em] transition-colors duration-500 ${
          on ? "text-fog" : "text-fog-dim"
        }`}
      >
        {on ? "snd" : "mute"}
      </span>
    </button>
  )
}

/** the moment after: a room existed, and now it doesn't — for everyone */
function Ended({
  reason,
  cause,
  by,
  selfName,
  onBack,
}: {
  reason: string
  cause: EndCause
  by?: string
  selfName: string | null
  onBack: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-closed-line]", {
          opacity: 0,
          y: 14,
          filter: "blur(8px)",
          duration: 0.9,
          ease: "power3.out",
          stagger: 0.12,
        })
      })
    },
    { scope: ref }
  )

  // who did what: vaporized (deliberate), left, or just dropped off the air
  const byLine = by
    ? by === selfName
      ? "You vaporized it. Clean exit."
      : cause === "vaporized"
        ? `${by} vaporized it. Nothing lingers.`
        : cause === "disconnected"
          ? `${by} lost their signal and never came back.`
          : `${by} left. Nothing lingers.`
    : null

  return (
    <div
      ref={ref}
      className="mx-auto flex w-full max-w-md flex-col items-center px-6 text-center"
    >
      <p
        data-closed-line
        role="status"
        className="font-display text-3xl font-semibold tracking-tight text-breath"
      >
        <span className="ghost-word">Gone.</span>
      </p>
      <p data-closed-line className="mt-3 text-fog">
        {byLine ?? reason}
      </p>
      <div data-closed-line className="mt-10">
        <Button onClick={onBack}>Talk to someone else</Button>
      </div>
    </div>
  )
}
