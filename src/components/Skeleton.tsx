/**
 * Loading placeholders. The chat chunk (socket.io-client + the room UI) is a
 * lazy import — this stands in for the beat between entering and its arrival,
 * so the screen is never blank. Shapes echo the room shell: a header strip, a
 * few message rows, a composer bar. Pure CSS pulse, stilled under reduce-motion.
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

/** rough of the room: context bar · transcript · composer */
export function ChatSkeleton() {
  return (
    <div className="relative flex min-h-svh flex-col" aria-hidden="true">
      {/* top bar, matching ChatApp's header rhythm */}
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4 xl:max-w-6xl">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-28" />
      </div>

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
