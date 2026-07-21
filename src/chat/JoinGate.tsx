import { useState, useRef, useId } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { Button } from "@/components/ui/button"
import { LIMITS } from "@shared/protocol"
import type { InviteInfo, InviteDeadReason } from "@shared/protocol"
import type { ChatSession, InviteState } from "./useChatSession"
import { rememberedName } from "./useChatSession"

/**
 * The doorstep. Someone followed a shared link — they haven't chosen a
 * channel, they've been *invited somewhere specific*. So this screen is not
 * the gate: it names the room first, asks who's arriving second, and offers
 * exactly one door. The same screen absorbs all three fates of a link —
 * resolving, open, and dead — so nothing ever jumps or reroutes mid-thought.
 */
export function JoinGate({ session }: { session: ChatSession }) {
  const invite = session.stage.view === "invite" ? session.stage.invite : null
  if (!invite) return null

  if (invite.phase === "resolving") return <Resolving />
  if (invite.phase === "dead")
    return <DeadLink reason={invite.reason} onBack={session.declineInvite} />
  return <Doorstep invite={invite} session={session} />
}

/** the beat between opening the link and knowing where it leads */
function Resolving() {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(ref.current, { opacity: 0, duration: 0.6, ease: "power2.out" })
        // the trace line breathes while the token resolves
        gsap.to("[data-trace]", {
          opacity: 0.25,
          duration: 0.9,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
          stagger: { each: 0.06, from: "center" },
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
      <span aria-hidden="true" className="flex h-4 items-center gap-1">
        {Array.from({ length: 18 }, (_, i) => (
          <span
            key={i}
            data-trace
            className="inline-block w-px bg-signal/60"
            style={{ height: `${5 + ((i * 5741) % 8)}px` }}
          />
        ))}
      </span>
      <p role="status" className="mt-6 font-mono text-xs uppercase tracking-[0.25em] text-fog-dim">
        following the link…
      </p>
    </div>
  )
}

/** a valid link: the room, stated plainly, and one field between you and it */
function Doorstep({
  invite,
  session,
}: {
  invite: Extract<InviteState, { phase: "open" }>
  session: ChatSession
}) {
  const info: InviteInfo = invite.info
  const [name, setName] = useState(rememberedName)
  const [nameError, setNameError] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  const fieldId = useId()

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-door-line]", {
          opacity: 0,
          y: 16,
          filter: "blur(8px)",
          duration: 0.85,
          ease: "power3.out",
          stagger: 0.09,
        })
      })
    },
    { scope: ref }
  )

  const kindLine =
    info.kind === "private"
      ? "a private chat · one to one"
      : `an open room · ${info.count} ${info.count === 1 ? "voice" : "voices"} inside`

  const enter = () => {
    const clean = name.trim()
    if (!clean) {
      setNameError(true)
      nameRef.current?.focus()
      return
    }
    session.clearError()
    session.acceptInvite(clean, info.token)
  }

  // the server can still say no to a name the client thought was fine
  const serverNameError = session.error?.code === "NAME_REQUIRED"
  const showNameError = nameError || serverNameError

  return (
    <div ref={ref} className="mx-auto w-full max-w-md px-6">
      <p
        data-door-line
        className="font-mono text-[11px] uppercase tracking-[0.25em] text-signal/80"
      >
        you&rsquo;ve been invited to
      </p>
      <h1
        data-door-line
        className="mt-3 font-display text-4xl font-semibold tracking-tight text-breath sm:text-5xl"
      >
        {info.title}
      </h1>
      <p data-door-line className="mt-3 font-mono text-xs text-fog-dim">
        {kindLine}
        {info.kind === "public" && (
          <> · {info.count}/{info.capacity} seats</>
        )}
      </p>

      <form
        data-door-line
        className="mt-10"
        onSubmit={(e) => {
          e.preventDefault()
          enter()
        }}
      >
        <label
          htmlFor={fieldId}
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-fog-dim"
        >
          arrive as · required
        </label>
        <div className="mt-2 flex flex-wrap items-stretch gap-3">
          <input
            id={fieldId}
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (nameError && e.target.value.trim()) setNameError(false)
              if (serverNameError) session.clearError()
            }}
            maxLength={LIMITS.NAME_MAX}
            placeholder="who are you tonight?"
            autoComplete="off"
            spellCheck={false}
            // the doorstep exists for this field — focus lands here on arrival
            autoFocus
            aria-invalid={showNameError || undefined}
            aria-describedby={showNameError ? `${fieldId}-err` : undefined}
            className={`min-w-0 flex-1 basis-52 rounded-sm border bg-smoke/60 px-4 py-3 font-body text-breath placeholder:text-fog-dim outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-signal/40 ${
              showNameError
                ? "border-ember/50"
                : "border-fog/20 focus:border-signal/50"
            }`}
          />
          <Button type="submit">Step in →</Button>
        </div>
        {showNameError && (
          <p
            id={`${fieldId}-err`}
            role="alert"
            className="mt-2 font-mono text-xs text-ember"
          >
            A name first. Any name — it only has to last one conversation.
          </p>
        )}
      </form>

      <div data-door-line className="mt-8 flex items-baseline justify-between">
        <p className="font-mono text-[11px] text-fog-dim">
          no account · no history · nothing leaves this session
        </p>
        <button
          type="button"
          onClick={session.declineInvite}
          className="cursor-pointer font-mono text-[11px] text-fog-dim underline decoration-fog/30 underline-offset-4 transition-colors duration-300 hover:text-fog"
        >
          not now
        </button>
      </div>
    </div>
  )
}

/** the link leads nowhere — dead air, said kindly, with a way onward */
function DeadLink({
  reason,
  onBack,
}: {
  reason: InviteDeadReason
  onBack: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-dead-line]", {
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

  const headline = reason === "full" ? "No seats left." : "This link vaporized."
  const body =
    reason === "full"
      ? "The room this link opens is already full. Rooms here are small on purpose — ask for a fresh link once a seat frees up, or start something of your own."
      : "The conversation it pointed to has ended, and links die with their rooms — that's the whole idea. Nothing was kept, and nothing can bring it back."

  return (
    <div
      ref={ref}
      className="mx-auto flex w-full max-w-md flex-col items-center px-6 text-center"
    >
      <p
        data-dead-line
        role="status"
        className="font-display text-3xl font-semibold tracking-tight text-breath"
      >
        <span className="ghost-word">{headline}</span>
      </p>
      <p data-dead-line className="mt-3 leading-relaxed text-fog">
        {body}
      </p>
      <div data-dead-line className="mt-10">
        <Button onClick={onBack}>Start your own conversation</Button>
      </div>
    </div>
  )
}
