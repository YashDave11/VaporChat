import { useState, useRef, useEffect, useId } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { Button } from "@/components/ui/button"
import { LIMITS, type PublicRoomInfo } from "@shared/protocol"
import type { ChatSession } from "./useChatSession"
import { rememberedName } from "./useChatSession"

type Channel = "stranger" | "public" | "private" | "join"

const CHANNELS: { id: Channel; freq: string; name: string; desc: string }[] = [
  {
    id: "stranger",
    freq: "CH·01",
    name: "Stranger",
    desc: "Pair with someone, somewhere. No profile, no follow button.",
  },
  {
    id: "public",
    freq: "CH·02",
    name: "New open room",
    desc: "Name a room anyone can find. Ten voices at most.",
  },
  {
    id: "private",
    freq: "CH·03",
    name: "New private room",
    desc: "Name it, get a four-character key. One conversation, two people.",
  },
  {
    id: "join",
    freq: "CH·04",
    name: "Join with a key",
    desc: "Someone gave you four characters. Use them here.",
  },
]

/** "moments ago" freshness — precise enough for rooms that live minutes */
function freshness(createdAt: number): string {
  const mins = Math.floor((Date.now() - createdAt) / 60_000)
  if (mins < 1) return "just formed"
  if (mins === 1) return "1 min"
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)} h`
}

/**
 * The gate: name yourself and pick a channel. The name is not optional —
 * every action below the field checks it first and points back here.
 * Same hairline-list language as the landing page's Modes section, with the
 * open-room directory continuing the list below — one instrument, five bands.
 */
export function Gate({ session }: { session: ChatSession }) {
  const [name, setName] = useState(rememberedName)
  const [nameError, setNameError] = useState(false)
  const [key, setKey] = useState("")
  const [roomName, setRoomName] = useState("")
  const [roomNameError, setRoomNameError] = useState(false)
  /** which channel's inline panel is open (public/private/join) */
  const [openPanel, setOpenPanel] = useState<Channel | null>(null)
  const keyInputRef = useRef<HTMLInputElement>(null)
  const roomNameRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  const nameFieldId = useId()
  const keyFieldId = useId()
  const roomNameFieldId = useId()

  const joinOpen = openPanel === "join"
  const badKey =
    session.error &&
    (session.error.code === "BAD_KEY" ||
      (session.error.code === "ROOM_FULL" && joinOpen))
      ? session.error
      : null
  const directoryError =
    session.error &&
    (session.error.code === "ROOM_GONE" ||
      (session.error.code === "ROOM_FULL" && !joinOpen))
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
    if (openPanel === "join") keyInputRef.current?.focus()
    if (openPanel === "public" || openPanel === "private")
      roomNameRef.current?.focus()
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
    const clean = requireName()
    if (!clean) return
    session.clearError()
    if (channel === "stranger") {
      session.hello(clean)
      session.joinQueue()
      return
    }
    // create/join channels open their inline panel first
    setOpenPanel((p) => (p === channel ? null : channel))
    setRoomNameError(false)
  }

  const createRoom = (kind: "public" | "private") => {
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
    if (kind === "public") session.createPublicRoom(title)
    else session.createPrivateRoom(title)
  }

  const joinListed = (roomId: string) => {
    const clean = requireName()
    if (!clean) return
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
    session.joinPrivateRoom(k)
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
              ? "border-red-400/40"
              : "border-fog/20 focus:border-signal/50"
          }`}
        />
        {nameError && (
          <p
            id={`${nameFieldId}-err`}
            role="alert"
            className="mt-2 font-mono text-xs text-red-300/80"
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
              aria-expanded={c.id !== "stranger" ? openPanel === c.id : undefined}
              onClick={() => pick(c.id)}
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

            {(c.id === "public" || c.id === "private") &&
              openPanel === c.id && (
                <form
                  className="flex flex-wrap items-end gap-3 pb-6 pl-[88px] sm:pl-[126px] sm:pr-4"
                  onSubmit={(e) => {
                    e.preventDefault()
                    createRoom(c.id as "public" | "private")
                  }}
                >
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
                      placeholder={
                        c.id === "public" ? "what's it about?" : "name it anyway"
                      }
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={roomNameError || undefined}
                      aria-describedby={
                        roomNameError ? `${roomNameFieldId}-err` : undefined
                      }
                      className={`mt-2 block w-full rounded-sm border bg-smoke/60 px-4 py-2.5 font-body text-breath placeholder:text-fog-dim outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-signal/40 ${
                        roomNameError
                          ? "border-red-400/40"
                          : "border-fog/20 focus:border-signal/50"
                      }`}
                    />
                  </div>
                  <Button type="submit" variant="ghost" size="default">
                    {c.id === "public" ? "Open the room" : "Mint the key"}
                  </Button>
                  {roomNameError && (
                    <p
                      id={`${roomNameFieldId}-err`}
                      role="alert"
                      className="w-full font-mono text-xs text-red-300/80"
                    >
                      The room needs a name before it can exist.
                    </p>
                  )}
                </form>
              )}

            {c.id === "join" && joinOpen && (
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

      <Directory
        rooms={session.directory}
        error={directoryError?.message ?? null}
        onJoin={joinListed}
      />

      <p data-gate-item className="mt-8 font-mono text-[11px] text-fog-dim">
        no account · no history · nothing leaves this session
      </p>
    </div>
  )
}

/**
 * The open-room directory: rooms that exist right now and stop existing when
 * their last voice leaves. A signal meter per room, not a server browser.
 */
function Directory({
  rooms,
  error,
  onJoin,
}: {
  rooms: PublicRoomInfo[]
  error: string | null
  onJoin: (roomId: string) => void
}) {
  return (
    <section data-gate-item className="mt-10" aria-label="Open rooms">
      <div className="flex items-baseline justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-fog-dim">
          open rooms · live
        </h2>
        {rooms.length > 0 && (
          <span className="font-mono text-[11px] text-fog-dim">
            {rooms.length} on air
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 font-mono text-xs text-red-300/80">
          {error}
        </p>
      )}

      {rooms.length === 0 ? (
        <p className="mt-4 border-t hairline pt-5 pb-2 font-mono text-xs leading-relaxed text-fog-dim">
          nothing on air right now.
          <span className="text-fog"> start an open room</span> and it will
          appear here until the last person leaves.
        </p>
      ) : (
        <ul className="mt-4 border-t hairline" role="list">
          {rooms.map((room) => {
            const full = room.count >= room.capacity
            return (
              <li key={room.id} className="border-b hairline">
                <button
                  type="button"
                  onClick={() => onJoin(room.id)}
                  disabled={full}
                  className="group flex w-full cursor-pointer items-center gap-4 py-4 text-left transition-colors duration-500 outline-none hover:bg-smoke/40 focus-visible:bg-smoke/40 disabled:cursor-default disabled:hover:bg-transparent sm:px-4"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-3 items-end gap-[3px]"
                  >
                    {Array.from({ length: room.capacity }, (_, i) => (
                      <span
                        key={i}
                        className={`w-[3px] rounded-full transition-colors duration-500 ${
                          i < room.count
                            ? "h-3 bg-signal/80"
                            : "h-1.5 bg-fog/20"
                        }`}
                      />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate font-display text-base font-medium ${
                        full ? "text-fog-dim" : "text-breath"
                      }`}
                    >
                      {room.title}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-fog-dim">
                    {room.count}/{room.capacity} · {freshness(room.createdAt)}
                  </span>
                  <span
                    className={`shrink-0 font-mono text-[11px] transition-colors duration-500 ${
                      full
                        ? "text-fog-dim"
                        : "text-fog group-hover:text-signal"
                    }`}
                  >
                    {full ? "full" : "join →"}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
