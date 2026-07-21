import { useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { Button } from "@/components/ui/button"
import { FogBackground } from "@/components/FogBackground"
import { useChatSession } from "./useChatSession"
import { Gate } from "./Gate"
import { Matching } from "./Matching"
import { Room } from "./Room"

/**
 * The product shell. One screen at a time — gate, matching, room, or the
 * after-image of a room that just vaporized.
 */
export function ChatApp() {
  const session = useChatSession()
  const view = session.stage.view

  return (
    <div className="relative flex min-h-svh flex-col">
      <FogBackground />

      <header className="relative z-10 mx-auto flex w-full max-w-2xl items-center justify-between px-6 py-6">
        <a
          href="#/"
          className="font-display text-lg font-semibold tracking-wide text-breath outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
        >
          vapor
          <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-signal align-middle" />
        </a>
        {session.name && view !== "gate" && (
          <span className="font-mono text-xs text-fog-dim">
            you are <span className="text-fog">{session.name}</span>
          </span>
        )}
      </header>

      <main className="relative z-10 flex flex-1 flex-col justify-center pb-10">
        {view === "gate" && <Gate session={session} />}
        {view === "matching" && <Matching onCancel={session.cancelQueue} />}
        {view === "room" && <Room session={session} />}
        {view === "closed" && (
          <Closed reason={session.stage.view === "closed" ? session.stage.reason : ""} onBack={session.backToGate} />
        )}
      </main>
    </div>
  )
}

/** the moment after: a room existed, and now it doesn't */
function Closed({ reason, onBack }: { reason: string; onBack: () => void }) {
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
        {reason}
      </p>
      <div data-closed-line className="mt-10">
        <Button onClick={onBack}>Talk to someone else</Button>
      </div>
    </div>
  )
}
