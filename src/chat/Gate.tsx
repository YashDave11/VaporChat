import { useState, useRef, useEffect, useId } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { Button } from "@/components/ui/button"
import { LIMITS } from "@shared/protocol"
import type { HostedRoomKind } from "@shared/protocol"
import type { ChatSession } from "./useChatSession"
import { rememberedName } from "./useChatSession"
import { RoomBrowser } from "./RoomBrowser"

/**
 * The four intents of the gate. "stranger" acts immediately; "open" raises
 * the full room board over the gate; the other two expand an inline panel —
 * only one panel is ever open, so the first screen stays a quiet list of
 * four lines no matter what's inside them.
 */
type Channel = "stranger" | "open" | "create" | "key"

const CHANNELS: { id: Channel; freq: string; name: string; desc: string }[] = [
  {
    id: "stranger",
    freq: "CH·01",
    name: "Find Stranger",
    desc: "One-to-one with someone, somewhere — you both say yes first. No room, no profile, no trace.",
  },
  {
    id: "open",
    freq: "CH·02",
    name: "Join an Open Room",
    desc: "Browse what's on air right now and step into a room.",
  },
  {
    id: "create",
    freq: "CH·03",
    name: "Create a Room",
    desc: "Host a conversation — open to anyone, private for a room, or one-to-one behind a key.",
  },
  {
    id: "key",
    freq: "CH·04",
    name: "Join with a Key",
    desc: "Someone gave you four characters. Their private room opens here.",
  },
]

/**
 * The create panel's three hosted kinds, stated once — kind, label, hint,
 * placeholder, and the verb on the button. No conditionals downstream: the
 * selected entry carries everything the form needs.
 */
const CREATE_OPTIONS: {
  kind: HostedRoomKind
  label: string
  hint: string
  placeholder: string
  action: string
}[] = [
  {
    kind: "public",
    label: "Public room",
    hint: "visible in open rooms · anyone can join · up to ten",
    placeholder: "what's it about?",
    action: "Create Public Room",
  },
  {
    kind: "private-group",
    label: "Private room",
    hint: "hidden from open rooms · join by invite or key · up to ten",
    placeholder: "name your circle",
    action: "Create Private Room",
  },
  {
    kind: "private",
    label: "Private chat",
    hint: "one-to-one · join by invite or key",
    placeholder: "name this conversation",
    action: "Create Private Chat",
  },
]

/**
 * The gate: name yourself and pick a channel. The name is not optional —
 * every action funnels through requireName() and points back to the field.
 * Same hairline-list language as the landing page's Modes section.
 */
export function Gate({ session }: { session: ChatSession }) {
  const [name, setName] = useState(rememberedName)
  const [nameError, setNameError] = useState(false)
  const [key, setKey] = useState("")
  const [roomName, setRoomName] = useState("")
  const [roomNameError, setRoomNameError] = useState(false)
  /** create-panel choice — one of the three hosted kinds */
  const [createKind, setCreateKind] = useState<HostedRoomKind>("public")
  const createOption =
    CREATE_OPTIONS.find((o) => o.kind === createKind) ?? CREATE_OPTIONS[0]
  const [openPanel, setOpenPanel] = useState<Channel | null>(null)
  /** the room board — a surface over the gate, not a panel inside it */
  const [browsing, setBrowsing] = useState(false)
  const keyInputRef = useRef<HTMLInputElement>(null)
  const roomNameRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  const nameFieldId = useId()
  const keyFieldId = useId()
  const roomNameFieldId = useId()

  const keyOpen = openPanel === "key"
  const badKey =
    session.error &&
    (session.error.code === "BAD_KEY" ||
      (session.error.code === "ROOM_FULL" && keyOpen))
      ? session.error
      : null
  const directoryError =
    session.error &&
    (session.error.code === "ROOM_GONE" ||
      (session.error.code === "ROOM_FULL" && !keyOpen))
      ? session.error
      : null

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
    if (openPanel === "key") keyInputRef.current?.focus()
    if (openPanel === "create") roomNameRef.current?.focus()
  }, [openPanel])

  /** the one rule of the gate: no name, no channel */
  const requireName = (): string | null => {
    const clean = name.trim()
    if (!clean) {
      setNameError(true)
      nameInputRef.current?.focus()
      return null
    }
    return clean
  }

  const pick = (channel: Channel) => {
    if (channel === "stranger") {
      // the direct path: no panel, no creation — straight into the queue
      const clean = requireName()
      if (!clean) return
      session.clearError()
      session.hello(clean)
      session.joinQueue()
      return
    }
    if (channel === "open") {
      // browsing is free; naming yourself is the price of *entering*
      session.clearError()
      setBrowsing(true)
      setOpenPanel(null)
      return
    }
    session.clearError()
    setOpenPanel((p) => (p === channel ? null : channel))
    setRoomNameError(false)
  }

  const createRoom = () => {
    const clean = requireName()
    if (!clean) return
    const title = roomName.trim()
    if (!title) {
      setRoomNameError(true)
      roomNameRef.current?.focus()
      return
    }
    session.clearError()
    session.hello(clean)
    session.createRoom(createKind, title)
  }

  const joinListed = (roomId: string) => {
    const clean = requireName()
    if (!clean) {
      // no name yet — the board steps aside so the field can ask for one
      setBrowsing(false)
      return
    }
    session.clearError()
    session.hello(clean)
    session.joinPublicRoom(roomId)
  }

  const submitKey = () => {
    const clean = requireName()
    if (!clean) return
    const k = key.trim().toUpperCase()
    if (k.length !== LIMITS.KEY_LENGTH) return
    session.clearError()
    session.hello(clean)
    session.joinByKey(k)
  }

  const onAir = session.directory.length

  return (
    <div ref={ref} className="mx-auto w-full max-w-2xl px-6">
      <h1
        data-gate-item
        className="font-display text-4xl font-semibold tracking-tight text-breath sm:text-5xl"
      >
        Who&rsquo;s talking?
      </h1>
      <p data-gate-item className="mt-3 text-fog">
        A name for this conversation only. It vaporizes when you do.
      </p>

      <div data-gate-item className="mt-8">
        <label
          htmlFor={nameFieldId}
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-fog-dim"
        >
          display name · required
        </label>
        <input
          id={nameFieldId}
          ref={nameInputRef}
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (nameError && e.target.value.trim()) setNameError(false)
          }}
          maxLength={LIMITS.NAME_MAX}
          placeholder="who are you tonight?"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={nameError || undefined}
          aria-describedby={nameError ? `${nameFieldId}-err` : undefined}
          className={`mt-2 block w-full rounded-sm border bg-smoke/60 px-4 py-3 font-body text-breath placeholder:text-fog-dim outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-signal/40 ${
            nameError
              ? "border-ember/50"
              : "border-fog/20 focus:border-signal/50"
          }`}
        />
        {nameError && (
          <p
            id={`${nameFieldId}-err`}
            role="alert"
            className="mt-2 font-mono text-xs text-ember"
          >
            A name first. Any name — it only has to last one conversation.
          </p>
        )}
      </div>

      <ul data-gate-item className="mt-10 border-t hairline" role="list">
        {CHANNELS.map((c) => (
          <li key={c.id} className="border-b hairline">
            <button
              type="button"
              aria-expanded={
                c.id === "open"
                  ? browsing
                  : c.id !== "stranger"
                    ? openPanel === c.id
                    : undefined
              }
              aria-haspopup={c.id === "open" ? "dialog" : undefined}
              onClick={() => pick(c.id)}
              className="group grid w-full cursor-pointer grid-cols-[72px_1fr] items-baseline gap-4 py-6 text-left transition-colors duration-500 outline-none hover:bg-smoke/40 focus-visible:bg-smoke/40 sm:grid-cols-[110px_1fr] sm:px-4"
            >
              <span className="font-mono text-xs tracking-[0.25em] text-fog-dim transition-colors duration-500 group-hover:text-signal">
                {c.freq}
              </span>
              <span>
                <span className="flex items-baseline gap-3 font-display text-xl font-medium text-breath">
                  {c.name}
                  {c.id === "open" && onAir > 0 && (
                    <span className="font-mono text-[11px] font-normal tracking-normal text-signal/80">
                      {onAir} on air
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-fog">
                  {c.desc}
                </span>
              </span>
            </button>

            {c.id === "create" && openPanel === "create" && (
              <form
                className="panel-in flex flex-col gap-4 pb-6 pl-[88px] sm:pl-[126px] sm:pr-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  createRoom()
                }}
              >
                {/* kind selector: three quiet radio lines, not tabs, not cards */}
                <fieldset>
                  <legend className="font-mono text-[11px] uppercase tracking-[0.2em] text-fog-dim">
                    what kind?
                  </legend>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {CREATE_OPTIONS.map((o) => (
                      <label
                        key={o.kind}
                        className={`flex cursor-pointer items-baseline gap-3 rounded-sm border px-3.5 py-2.5 transition-colors duration-300 ${
                          createKind === o.kind
                            ? "border-signal/40 bg-smoke/60"
                            : "border-fog/15 hover:border-fog/35"
                        }`}
                      >
                        <input
                          type="radio"
                          name="create-kind"
                          value={o.kind}
                          checked={createKind === o.kind}
                          onChange={() => setCreateKind(o.kind)}
                          className="sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full transition-colors duration-300 ${
                            createKind === o.kind ? "bg-signal" : "bg-fog/30"
                          }`}
                        />
                        <span className="shrink-0 whitespace-nowrap font-body text-sm font-medium text-breath">
                          {o.label}
                        </span>
                        <span className="min-w-0 truncate font-mono text-[11px] text-fog-dim">
                          {o.hint}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <label
                      htmlFor={roomNameFieldId}
                      className="font-mono text-[11px] uppercase tracking-[0.2em] text-fog-dim"
                    >
                      room name · required
                    </label>
                    <input
                      id={roomNameFieldId}
                      ref={roomNameRef}
                      type="text"
                      value={roomName}
                      onChange={(e) => {
                        setRoomName(e.target.value)
                        if (roomNameError && e.target.value.trim())
                          setRoomNameError(false)
                      }}
                      maxLength={LIMITS.ROOM_NAME_MAX}
                      placeholder={createOption.placeholder}
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={roomNameError || undefined}
                      aria-describedby={
                        roomNameError ? `${roomNameFieldId}-err` : undefined
                      }
                      className={`mt-2 block w-full rounded-sm border bg-smoke/60 px-4 py-2.5 font-body text-breath placeholder:text-fog-dim outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-signal/40 ${
                        roomNameError
                          ? "border-ember/50"
                          : "border-fog/20 focus:border-signal/50"
                      }`}
                    />
                  </div>
                  <Button type="submit" variant="ghost" size="default">
                    {createOption.action}
                  </Button>
                  {roomNameError && (
                    <p
                      id={`${roomNameFieldId}-err`}
                      role="alert"
                      className="w-full font-mono text-xs text-ember"
                    >
                      The room needs a name before it can exist.
                    </p>
                  )}
                </div>
              </form>
            )}

            {c.id === "key" && keyOpen && (
              <form
                className="panel-in flex flex-wrap items-end gap-3 pb-6 pl-[88px] sm:pl-[126px] sm:pr-4"
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
                      badKey ? "border-ember/50" : "border-fog/20 focus:border-signal/50"
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
                    className="w-full font-mono text-xs text-ember"
                  >
                    {badKey.code === "ROOM_FULL"
                      ? badKey.message
                      : `${badKey.message} Keys die with their rooms.`}
                  </p>
                )}
              </form>
            )}
          </li>
        ))}
      </ul>

      <p data-gate-item className="mt-8 font-mono text-[11px] text-fog-dim">
        no account · no history · nothing leaves this session
      </p>

      {browsing && (
        <RoomBrowser
          rooms={session.directory}
          error={directoryError?.message ?? null}
          onJoin={joinListed}
          onCreate={() => {
            setBrowsing(false)
            setOpenPanel("create")
          }}
          onClose={() => setBrowsing(false)}
        />
      )}
    </div>
  )
}
