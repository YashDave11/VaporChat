/**
 * Loading placeholders. The chat chunk (socket.io-client + the room UI) is a
 * lazy import — these stand in for the beat between entering and its arrival,
 * so the screen is never blank. Each shape echoes the actual first screen for
 * that entry point: the gate, an invite doorstep, or a resumed room. Pure CSS
 * pulse, stilled under reduce-motion.
 */

/** one shimmering block — the primitive the layouts below are built from */
export function Skeleton({
  className = "",
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      style={style}
      className={`animate-pulse rounded-sm bg-fog/10 motion-reduce:animate-none ${className}`}
    />
  )
}

/** the vapor wordmark + toggles bar, sized per the view it fronts */
function SkeletonHeader({ wide = false }: { wide?: boolean }) {
  return (
    <div
      className={`mx-auto flex w-full items-center justify-between ${
        wide
          ? "max-w-5xl px-4 py-3 sm:px-6 sm:py-4 xl:max-w-6xl"
          : "max-w-2xl px-6 py-6"
      }`}
    >
      <Skeleton className="h-5 w-20" />
      <div className="flex items-center gap-4">
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-4 w-10" />
      </div>
    </div>
  )
}

/** rough of the gate: title · name field · four channel rows */
export function GateSkeleton() {
  return (
    <div className="relative flex min-h-svh flex-col" aria-hidden="true">
      <SkeletonHeader />
      <div className="flex flex-1 flex-col justify-center pb-10">
        <div className="mx-auto w-full max-w-2xl px-6">
          <Skeleton className="h-11 w-72 max-w-full" />
          <Skeleton className="mt-4 h-4 w-80 max-w-full" />

          {/* name field */}
          <div className="mt-8">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="mt-2 h-12 w-full" />
          </div>

          {/* four channel rows: freq column + name + description */}
          <div className="mt-10 border-t hairline">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="grid grid-cols-[72px_1fr] items-baseline gap-4 border-b hairline py-6 sm:grid-cols-[110px_1fr] sm:px-4"
              >
                <Skeleton className="h-3 w-12" />
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-5 w-44 max-w-full" />
                  <Skeleton className="h-3.5 w-full max-w-md" />
                </div>
              </div>
            ))}
          </div>

          <Skeleton className="mt-8 h-3 w-64 max-w-full" />
        </div>
      </div>
    </div>
  )
}

/** rough of the invite doorstep: eyebrow · room title · one name field */
export function InviteSkeleton() {
  return (
    <div className="relative flex min-h-svh flex-col" aria-hidden="true">
      <SkeletonHeader />
      <div className="flex flex-1 flex-col justify-center pb-10">
        <div className="mx-auto w-full max-w-md px-6">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-3 h-11 w-64 max-w-full" />
          <Skeleton className="mt-3 h-3 w-48" />

          <div className="mt-10">
            <Skeleton className="h-3 w-28" />
            <div className="mt-2 flex gap-3">
              <Skeleton className="h-12 flex-1" />
              <Skeleton className="h-12 w-24" />
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between gap-4">
            <Skeleton className="h-3 w-56 max-w-[60%]" />
            <Skeleton className="h-3 w-14" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** rough of the room: context bar · transcript · composer */
export function RoomSkeleton() {
  return (
    <div className="relative flex min-h-svh flex-col" aria-hidden="true">
      <SkeletonHeader wide />
      <div className="mx-auto flex h-[calc(100dvh-4.25rem)] w-full max-w-5xl flex-col px-3 sm:px-6 xl:max-w-6xl">
        {/* transcript: a handful of message-shaped rows */}
        <div className="flex flex-1 flex-col justify-end gap-5 py-6">
          {[72, 56, 84, 48, 64].map((w, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>

        {/* composer bar */}
        <div className="mb-4 flex items-center gap-3">
          <Skeleton className="h-12 flex-1" />
          <Skeleton className="h-12 w-20" />
        </div>
      </div>
    </div>
  )
}

/**
 * Picks the placeholder that matches the screen the chat chunk will land on.
 * A live resume token means a refresh drops straight back into a room; an
 * invite hash means the doorstep; everything else is the gate. The key mirrors
 * RESUME_KEY in useChatSession, read raw so this stays out of the chat chunk.
 */
export function ChatSkeleton({ hash = "" }: { hash?: string }) {
  if (
    typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem("vapor:resume")
  ) {
    return <RoomSkeleton />
  }
  if (hash.startsWith("#/join/")) return <InviteSkeleton />
  return <GateSkeleton />
}
