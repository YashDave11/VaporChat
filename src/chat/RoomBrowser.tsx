import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useId,
  useDeferredValue,
} from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import type { PublicRoomInfo } from "@shared/protocol"

/**
 * CH·02 as a destination: the full broadcast board. Not a dropdown, not a
 * command palette — a room-height surface where open frequencies are laid
 * out like a station directory. The gate stays visible behind the veil so
 * stepping in here never feels like leaving.
 *
 * The search field is a tuner: type a few characters and the board narrows
 * to matching frequencies. Everything else is Vapor's existing language —
 * hairline rows, signal meters, mono annotations.
 */

/** "moments ago" freshness — precise enough for rooms that live minutes */
function freshness(createdAt: number): string {
  const mins = Math.floor((Date.now() - createdAt) / 60_000)
  if (mins < 1) return "just formed"
  if (mins === 1) return "1 min"
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)} h`
}

export function RoomBrowser({
  rooms,
  error,
  onJoin,
  onCreate,
  onClose,
}: {
  rooms: PublicRoomInfo[]
  error: string | null
  onJoin: (roomId: string) => void
  /** "nothing on air" escape hatch: close and open the create panel */
  onCreate: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const closingRef = useRef(false)
  const [query, setQuery] = useState("")
  // deferred: keystrokes stay instant even if the board is long
  const deferredQuery = useDeferredValue(query)
  const titleId = useId()

  const shown = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    if (!q) return rooms
    return rooms.filter((r) => r.title.toLowerCase().includes(q))
  }, [rooms, deferredQuery])

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-veil]", { opacity: 0, duration: 0.4, ease: "power2.out" })
        gsap.from(panelRef.current, {
          opacity: 0,
          y: 28,
          filter: "blur(12px)",
          duration: 0.7,
          ease: "power3.out",
        })
        gsap.from("[data-board-item]", {
          opacity: 0,
          y: 14,
          filter: "blur(6px)",
          duration: 0.55,
          ease: "power3.out",
          stagger: 0.06,
          delay: 0.15,
        })
      })
    },
    { scope: ref }
  )

  /** leave the way we came: the board dissolves, then the veil lifts */
  const close = () => {
    if (closingRef.current) return
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !panelRef.current
    ) {
      onClose()
      return
    }
    closingRef.current = true
    gsap.to(panelRef.current, {
      opacity: 0,
      y: 20,
      filter: "blur(10px)",
      duration: 0.35,
      ease: "power2.in",
    })
    gsap.to("[data-veil]", {
      opacity: 0,
      duration: 0.4,
      ease: "power2.in",
      delay: 0.08,
      onComplete: onClose,
    })
  }

  // the tuner takes focus on arrival; Escape steps back out
  useEffect(() => {
    searchRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:px-6 sm:py-10"
    >
      <button
        type="button"
        data-veil
        aria-label="Close the room board"
        onClick={close}
        className="vapor-veil absolute inset-0 cursor-default backdrop-blur-md"
      />

      <div
        ref={panelRef}
        className="relative flex h-[92svh] w-full max-w-3xl flex-col overflow-hidden rounded-t-md border border-fog/15 bg-smoke/90 shadow-[var(--shadow-frame)] backdrop-blur-xl sm:h-[min(80svh,44rem)] sm:rounded-md"
      >
        {/* a breath of signal along the top edge — the board is live */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal/50 to-transparent"
        />

        <header
          data-board-item
          className="flex items-start justify-between px-6 pt-7 sm:px-10 sm:pt-9"
        >
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-signal/80">
              ch·02 · open frequencies
            </p>
            <h2
              id={titleId}
              className="mt-2 font-display text-3xl font-semibold tracking-tight text-breath sm:text-4xl"
            >
              On air right now
            </h2>
            <p className="mt-2 text-sm text-fog">
              {rooms.length === 0
                ? "Every room here lives only while someone's in it."
                : `${rooms.length} ${rooms.length === 1 ? "room" : "rooms"} broadcasting — step into any of them.`}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="shrink-0 cursor-pointer rounded-sm p-2 font-mono text-xs text-fog-dim transition-colors duration-300 outline-none hover:text-breath focus-visible:ring-2 focus-visible:ring-signal/40"
          >
            esc ✕
          </button>
        </header>

        {/* the tuner */}
        <div data-board-item className="px-6 pt-6 sm:px-10">
          <div className="group flex items-baseline gap-3 border-b hairline pb-3 transition-colors duration-300 focus-within:border-signal/50">
            <span
              aria-hidden="true"
              className="font-mono text-xs tracking-[0.25em] text-fog-dim transition-colors duration-300 group-focus-within:text-signal"
            >
              tune
            </span>
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search the board…"
              autoComplete="off"
              spellCheck={false}
              aria-label="Filter open rooms by name"
              className="w-full bg-transparent font-body text-lg text-breath placeholder:text-fog-dim outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("")
                  searchRef.current?.focus()
                }}
                className="shrink-0 cursor-pointer font-mono text-[11px] text-fog-dim transition-colors hover:text-fog"
              >
                clear
              </button>
            )}
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mx-6 mt-4 font-mono text-xs text-ember sm:mx-10"
          >
            {error}
          </p>
        )}

        {/* the board */}
        <div className="mt-2 flex-1 overflow-y-auto px-6 pb-8 sm:px-10">
          {rooms.length === 0 ? (
            <Dead onCreate={onCreate} />
          ) : shown.length === 0 ? (
            <NoSignal query={query} onClear={() => setQuery("")} />
          ) : (
            <ul data-board-item className="border-t hairline" role="list">
              {shown.map((room, i) => (
                <RoomRow key={room.id} room={room} index={i} onJoin={onJoin} />
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t hairline px-6 py-3 sm:px-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-fog-dim">
            rooms vanish when the last voice leaves · nothing is recorded
          </p>
        </footer>
      </div>
    </div>
  )
}

/** one frequency on the board */
function RoomRow({
  room,
  index,
  onJoin,
}: {
  room: PublicRoomInfo
  index: number
  onJoin: (roomId: string) => void
}) {
  const full = room.count >= room.capacity
  return (
    <li
      className="room-in border-b hairline"
      style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}
    >
      <button
        type="button"
        onClick={() => onJoin(room.id)}
        disabled={full}
        className="group flex w-full cursor-pointer items-center gap-4 py-5 text-left transition-colors duration-500 outline-none hover:bg-smoke-2/60 focus-visible:bg-smoke-2/60 disabled:cursor-default disabled:hover:bg-transparent sm:gap-5 sm:px-4"
      >
        {/* signal meter: one bar per seat, lit while occupied */}
        <span aria-hidden="true" className="flex h-4 shrink-0 items-end gap-[3px]">
          {Array.from({ length: room.capacity }, (_, j) => (
            <span
              key={j}
              className={`w-[3px] rounded-full transition-colors duration-500 ${
                j < room.count ? "h-4 bg-signal/80" : "h-2 bg-fog/20"
              }`}
            />
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate font-display text-lg font-medium ${
              full ? "text-fog-dim" : "text-breath"
            }`}
          >
            {room.title}
          </span>
          <span className="mt-0.5 block font-mono text-[11px] text-fog-dim">
            {room.count} {room.count === 1 ? "voice" : "voices"} ·{" "}
            {freshness(room.createdAt)} on air
          </span>
        </span>
        <span
          className={`shrink-0 font-mono text-xs transition-colors duration-500 ${
            full ? "text-fog-dim" : "text-fog group-hover:text-signal"
          }`}
        >
          {full ? `full · ${room.count}/${room.capacity}` : "join →"}
        </span>
      </button>
    </li>
  )
}

/** empty board: dead air, stated plainly, with the obvious next move */
function Dead({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      data-board-item
      className="flex h-full flex-col items-center justify-center pb-10 text-center"
    >
      <IdleDial />
      <p className="mt-8 font-display text-2xl font-medium text-breath">
        <span className="ghost-word">Dead air.</span>
      </p>
      <p className="mt-3 max-w-xs text-sm leading-relaxed text-fog">
        No rooms are broadcasting right now. Open one — it appears here the
        moment it exists.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-7 cursor-pointer rounded-sm border border-fog/25 px-5 py-2.5 font-mono text-xs uppercase tracking-[0.2em] text-fog transition-colors duration-300 outline-none hover:border-signal/50 hover:text-signal focus-visible:ring-2 focus-visible:ring-signal/40"
      >
        create a room →
      </button>
    </div>
  )
}

/** the tuner found nothing at that frequency — not an error, just static */
function NoSignal({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center pb-10 text-center">
      <IdleDial />
      <p role="status" className="mt-8 font-display text-xl font-medium text-breath">
        Nothing at &ldquo;{query.trim()}&rdquo;
      </p>
      <p className="mt-3 max-w-xs text-sm leading-relaxed text-fog">
        No room on the board matches that. It might have vaporized, or it
        hasn&rsquo;t formed yet.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-6 cursor-pointer font-mono text-xs text-fog-dim underline decoration-fog/30 underline-offset-4 transition-colors duration-300 hover:text-signal"
      >
        show every frequency
      </button>
    </div>
  )
}

/** a quiet static line — the dial with nothing to lock onto */
function IdleDial() {
  return (
    <span aria-hidden="true" className="flex h-4 items-center gap-1">
      {Array.from({ length: 24 }, (_, i) => (
        <span
          key={i}
          className="inline-block w-px bg-fog/25"
          style={{ height: `${4 + ((i * 7919) % 9)}px` }}
        />
      ))}
    </span>
  )
}
