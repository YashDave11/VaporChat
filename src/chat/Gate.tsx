import { useState, useRef, useEffect, useId } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { Button } from "@/components/ui/button"
import { LIMITS } from "@shared/protocol"
import type { ChatSession } from "./useChatSession"

type Channel = "stranger" | "lobby" | "create" | "join"

const CHANNELS: { id: Channel; freq: string; name: string; desc: string }[] = [
  {
    id: "stranger",
    freq: "CH·01",
    name: "Stranger",
    desc: "Pair with someone, somewhere. No profile, no follow button.",
  },
  {
    id: "lobby",
    freq: "CH·02",
    name: "Lobby",
    desc: "The open room. Voices come and go, nobody keeps a list.",
  },
  {
    id: "create",
    freq: "CH·03",
    name: "New private room",
    desc: "Mint a four-character key. Share it with someone you trust.",
  },
  {
    id: "join",
    freq: "CH·04",
    name: "Join with a key",
    desc: "Someone gave you four characters. Use them here.",
  },
]

/**
 * The gate: name yourself (or don't) and pick a channel.
 * Same hairline-list language as the landing page's Modes section.
 */
export function Gate({ session }: { session: ChatSession }) {
  const [name, setName] = useState("")
  const [key, setKey] = useState("")
  const [joinOpen, setJoinOpen] = useState(false)
  const keyInputRef = useRef<HTMLInputElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  const nameFieldId = useId()
  const keyFieldId = useId()

  const badKey = session.error?.code === "BAD_KEY" ? session.error : null

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-gate-item]", {
          opacity: 0,
          y: 18,
          filter: "blur(8px)",
          duration: 0.8,
          ease: "power3.out",
          stagger: 0.07,
        })
      })
    },
    { scope: ref }
  )

  useEffect(() => {
    if (joinOpen) keyInputRef.current?.focus()
  }, [joinOpen])

  const enter = (channel: Channel) => {
    session.clearError()
    session.hello(name)
    if (channel === "stranger") session.joinQueue()
    else if (channel === "lobby") session.joinLobby()
    else if (channel === "create") session.createRoom()
  }

  const submitKey = () => {
    const k = key.trim().toUpperCase()
    if (k.length !== LIMITS.KEY_LENGTH) return
    session.clearError()
    session.hello(name)
    session.joinRoom(k)
  }

  return (
    <div ref={ref} className="mx-auto w-full max-w-2xl px-6">
      <h1
        data-gate-item
        className="font-display text-4xl font-semibold tracking-tight text-breath sm:text-5xl"
      >
        Who&rsquo;s talking?
      </h1>
      <p data-gate-item className="mt-3 text-fog">
        A name for this conversation only. Leave it blank and we&rsquo;ll find
        you one.
      </p>

      <div data-gate-item className="mt-8">
        <label
          htmlFor={nameFieldId}
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-fog-dim"
        >
          display name
        </label>
        <input
          id={nameFieldId}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={LIMITS.NAME_MAX}
          placeholder="anyone"
          autoComplete="off"
          spellCheck={false}
          className="mt-2 block w-full rounded-sm border border-fog/20 bg-smoke/60 px-4 py-3 font-body text-breath placeholder:text-fog-dim outline-none transition-colors duration-300 focus:border-signal/50 focus-visible:ring-2 focus-visible:ring-signal/40"
        />
      </div>

      <ul data-gate-item className="mt-10 border-t hairline" role="list">
        {CHANNELS.map((c) => (
          <li key={c.id} className="border-b hairline">
            {c.id === "join" ? (
              <div>
                <button
                  type="button"
                  aria-expanded={joinOpen}
                  onClick={() => setJoinOpen((v) => !v)}
                  className="group grid w-full cursor-pointer grid-cols-[72px_1fr] items-baseline gap-4 py-6 text-left transition-colors duration-500 outline-none hover:bg-smoke/40 focus-visible:bg-smoke/40 sm:grid-cols-[110px_1fr] sm:px-4"
                >
                  <span className="font-mono text-xs tracking-[0.25em] text-fog-dim transition-colors duration-500 group-hover:text-signal">
                    {c.freq}
                  </span>
                  <span>
                    <span className="font-display text-xl font-medium text-breath">
                      {c.name}
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-fog">
                      {c.desc}
                    </span>
                  </span>
                </button>
                {joinOpen && (
                  <form
                    className="flex flex-wrap items-end gap-3 pb-6 pl-[88px] sm:pl-[126px] sm:pr-4"
                    onSubmit={(e) => {
                      e.preventDefault()
                      submitKey()
                    }}
                  >
                    <div>
                      <label htmlFor={keyFieldId} className="sr-only">
                        Room key, four characters
                      </label>
                      <input
                        id={keyFieldId}
                        ref={keyInputRef}
                        type="text"
                        value={key}
                        onChange={(e) => {
                          setKey(
                            e.target.value
                              .toUpperCase()
                              .replace(/[^A-Z0-9]/g, "")
                              .slice(0, LIMITS.KEY_LENGTH)
                          )
                          if (badKey) session.clearError()
                        }}
                        placeholder="····"
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={badKey ? true : undefined}
                        aria-describedby={badKey ? `${keyFieldId}-err` : undefined}
                        className={`w-32 rounded-sm border bg-smoke/60 px-4 py-2.5 text-center font-mono text-lg tracking-[0.5em] text-signal placeholder:text-fog-dim outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-signal/40 ${
                          badKey ? "border-red-400/40" : "border-fog/20 focus:border-signal/50"
                        }`}
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="ghost"
                      size="default"
                      disabled={key.length !== LIMITS.KEY_LENGTH}
                    >
                      Join room
                    </Button>
                    {badKey && (
                      <p
                        id={`${keyFieldId}-err`}
                        role="alert"
                        className="w-full font-mono text-xs text-red-300/80"
                      >
                        {badKey.message} Keys die with their rooms.
                      </p>
                    )}
                  </form>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => enter(c.id)}
                className="group grid w-full cursor-pointer grid-cols-[72px_1fr] items-baseline gap-4 py-6 text-left transition-colors duration-500 outline-none hover:bg-smoke/40 focus-visible:bg-smoke/40 sm:grid-cols-[110px_1fr] sm:px-4"
              >
                <span className="font-mono text-xs tracking-[0.25em] text-fog-dim transition-colors duration-500 group-hover:text-signal">
                  {c.freq}
                </span>
                <span>
                  <span className="font-display text-xl font-medium text-breath">
                    {c.name}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-fog">
                    {c.desc}
                  </span>
                </span>
              </button>
            )}
          </li>
        ))}
      </ul>

      <p data-gate-item className="mt-8 font-mono text-[11px] text-fog-dim">
        no account · no history · nothing leaves this session
      </p>
    </div>
  )
}
