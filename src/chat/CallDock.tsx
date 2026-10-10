import { useEffect, useRef, useState } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import type { CallState, PeerInfo } from "@shared/protocol"
import { LIMITS } from "@shared/protocol"
import { Button } from "@/components/ui/button"
import { AudioWaveform } from "./AudioWaveform"
import type { WebRTCController } from "./useWebRTC"

interface CallDockProps {
  rtc: WebRTCController
  callState: CallState
  selfName: string
  selfId: string
  /** everyone else in the room (seat presence) — the ring targets */
  peers: PeerInfo[]
  /** ring a room member (by seat id) to join the call */
  onRing: (memberId: string) => void
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

function isInputActive(): boolean {
  if (typeof document === "undefined") return false
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  if (tag === "input" || tag === "textarea") return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

// Two-letter monogram from a display name (Discord-style avatar fallback).
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

interface VoiceTileProps {
  name: string
  isSelf?: boolean
  isSpeaking: boolean
  isMuted: boolean
  volume: number
  sharing?: boolean
}

/** Binds a MediaStream to a <video> and shows the live screen share. */
function ScreenStage({
  stream,
  label,
}: {
  stream: MediaStream | null
  label: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = videoRef.current
    if (v && v.srcObject !== stream) v.srcObject = stream
  }, [stream])

  if (!stream) return null

  return (
    <div className="relative mt-3 overflow-hidden rounded-md border border-signal/30 bg-black">
      {/* muted: a remote presenter's audio rides the peer's audio element, and
          muting avoids hearing your own share back as an echo */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="max-h-[38vh] w-full bg-black object-contain"
      />
      <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-void/70 px-2 py-0.5 font-mono text-[10px] text-breath backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full bg-signal" />
        {label}
      </div>
      <button
        type="button"
        onClick={() => videoRef.current?.requestFullscreen().catch(() => {})}
        title="Fullscreen"
        className="absolute right-2 top-2 cursor-pointer rounded-sm border border-fog/30 bg-void/70 px-2 py-1 font-mono text-[10px] text-fog backdrop-blur transition-colors hover:text-breath hover:border-signal/50"
      >
        Fullscreen ⤢
      </button>
    </div>
  )
}

/**
 * Discord-style voice participant tile: a monogram avatar wrapped in a
 * sound-reactive mint ring (the signature element) that tightens and glows
 * with live amplitude, a mute badge, and a name label with an equalizer.
 */
function VoiceTile({ name, isSelf, isSpeaking, isMuted, volume, sharing }: VoiceTileProps) {
  // Ring intensity tracks live amplitude when speaking; muted stays dark.
  const ringAlpha = isMuted ? 0 : isSpeaking ? 0.5 + volume * 0.5 : 0.15
  const glow = isMuted ? 0 : isSpeaking ? 10 + volume * 26 : 0

  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-md border px-3 py-3 transition-colors duration-200 ${
        isSpeaking && !isMuted
          ? "border-signal/40 bg-signal/5"
          : "border-fog/15 bg-void/40"
      }`}
    >
      <div className="relative">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-smoke-2 to-void font-mono text-base font-semibold text-breath"
          style={{
            boxShadow: `0 0 0 2px rgba(169, 232, 220, ${ringAlpha})${
              glow > 0 ? `, 0 0 ${glow}px rgba(169, 232, 220, ${0.3 + volume * 0.4})` : ""
            }`,
          }}
        >
          {initials(name)}
        </div>

        {/* Sharing badge, top-left of avatar */}
        {sharing && (
          <span className="absolute -left-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-void bg-signal text-void">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
          </span>
        )}

        {/* Mute badge, bottom-right of avatar */}
        {isMuted && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-void bg-ember/90 text-void">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" />
            </svg>
          </span>
        )}
      </div>

      <div className="flex max-w-[7rem] items-center gap-1.5">
        <span className="truncate font-mono text-[11px] font-medium text-breath">
          {name}
        </span>
        {isSelf && <span className="shrink-0 font-mono text-[10px] text-fog-dim">(you)</span>}
      </div>

      <AudioWaveform
        isSpeaking={isSpeaking}
        isMuted={isMuted}
        volume={volume}
        variant="equalizer"
        className="h-3.5 w-10"
      />
    </div>
  )
}

export function CallDock({
  rtc,
  callState,
  selfName,
  selfId,
  peers,
  onRing,
}: CallDockProps) {
  const dockRef = useRef<HTMLDivElement>(null)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [pttHeld, setPttHeld] = useState(false)
  // seat ids we've rung recently — disables the button through the cooldown
  // so the UI never lets you spam a ring the server would drop anyway
  const [cooling, setCooling] = useState<Set<string>>(new Set())

  const ringPeer = (memberId: string) => {
    if (cooling.has(memberId)) return
    onRing(memberId)
    setCooling((prev) => new Set(prev).add(memberId))
    setTimeout(() => {
      setCooling((prev) => {
        const next = new Set(prev)
        next.delete(memberId)
        return next
      })
    }, LIMITS.CALL_RING_COOLDOWN_MS)
  }

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(dockRef.current, {
          opacity: 0,
          y: -10,
          filter: "blur(6px)",
          duration: 0.45,
          ease: "power2.out",
        })
        gsap.from("[data-voice-tile]", {
          opacity: 0,
          scale: 0.85,
          duration: 0.35,
          stagger: 0.05,
          ease: "back.out(1.6)",
          delay: 0.1,
        })
      })
    },
    { scope: dockRef }
  )

  const {
    isMuted,
    speakingWhileMuted,
    pttEnabled,
    speakingPeers,
    peerVolumes,
    callDuration,
    error,
    isSharing,
    shareSupported,
    localScreenStream,
    remoteScreens,
    leaveCall,
    toggleMute,
    togglePtt,
    setPttPressed,
    startShare,
    stopShare,
    clearError,
  } = rtc

  // Push-to-Talk Global Spacebar Handler (Only when not focused in input/textarea/editor)
  useEffect(() => {
    if (!pttEnabled) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !isInputActive()) {
        e.preventDefault()
        setPttHeld(true)
        setPttPressed(true)
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isInputActive()) {
        e.preventDefault()
        setPttHeld(false)
        setPttPressed(false)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [pttEnabled, setPttPressed])

  const localVol = peerVolumes.get("local") ?? 0
  const isLocalSpeaking = speakingPeers.has("local")

  const remoteMembers = callState.members.filter((m) => m.peerId !== selfId)

  // One presenter at a time (server-enforced). Resolve who it is and which
  // stream to paint — our own local capture if it's us, else their feed.
  const presenter = callState.members.find((m) => m.sharing)
  const presenterIsSelf = presenter?.peerId === selfId
  const presenterStream = presenter
    ? presenterIsSelf
      ? localScreenStream
      : remoteScreens.get(presenter.peerId) ?? null
    : null
  const someoneElseSharing = !!presenter && !presenterIsSelf

  // room members not yet in the call — the people we can ring in. Correlated
  // by seat id (CallMember.memberId) so a shared display name never confuses
  // who is already on the line. Away seats can't be rung (no live socket).
  const inCallSeats = new Set(callState.members.map((m) => m.memberId))
  const ringable = peers.filter(
    (p) => p.status === "active" && !inCallSeats.has(p.id)
  )

  // Find who is currently speaking among remote members (for the collapsed bar)
  const activeRemoteSpeaker = remoteMembers.find((m) => speakingPeers.has(m.peerId))

  return (
    <>
      {isCollapsed ? (
        /* FLOATING COMPACT CALL BAR */
        <div
          ref={dockRef}
          data-call-dock
          className="sticky top-2 z-30 mb-3 flex items-center justify-between gap-3 rounded-full border hairline bg-smoke/95 px-3 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-md"
        >
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-signal" />
            </span>
            <span className="font-mono text-xs text-signal font-semibold">
              {formatDuration(callDuration)}
            </span>
            <span className="font-mono text-[10px] text-fog-dim hidden sm:inline">·</span>
            {activeRemoteSpeaker ? (
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-breath">
                <span className="truncate max-w-[100px] text-signal font-medium">
                  {activeRemoteSpeaker.name}
                </span>
                <AudioWaveform
                  isSpeaking={true}
                  volume={peerVolumes.get(activeRemoteSpeaker.peerId) ?? 0}
                  variant="equalizer"
                  className="w-8 h-3.5"
                />
              </div>
            ) : isLocalSpeaking ? (
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-breath">
                <span className="text-signal font-medium">You</span>
                <AudioWaveform
                  isSpeaking={true}
                  volume={localVol}
                  variant="equalizer"
                  className="w-8 h-3.5"
                />
              </div>
            ) : (
              <span className="font-mono text-[10px] text-fog-dim">
                {callState.members.length} {callState.members.length === 1 ? "voice" : "voices"}
              </span>
            )}
            {presenter && (
              <button
                type="button"
                onClick={() => setIsCollapsed(false)}
                title="Open the shared screen"
                className="flex cursor-pointer items-center gap-1 rounded-full border border-signal/40 bg-signal/10 px-2 py-0.5 font-mono text-[10px] text-signal hover:bg-signal/20"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                </svg>
                <span className="max-w-[90px] truncate">
                  {presenterIsSelf ? "you're" : presenter.name} sharing
                </span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Mute button */}
            <button
              type="button"
              onClick={toggleMute}
              className={`flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 font-mono text-[10px] transition-all duration-200 ${
                isMuted
                  ? "bg-ember/15 text-ember hover:bg-ember/25 border border-ember/30"
                  : "bg-signal/15 text-signal hover:bg-signal/25 border border-signal/30"
              }`}
              title={isMuted ? "Unmute mic" : "Mute mic"}
            >
              {isMuted ? "Unmute" : "Mute"}
            </button>

            {/* Expand button */}
            <button
              type="button"
              onClick={() => setIsCollapsed(false)}
              className="flex cursor-pointer items-center gap-1 rounded-full border hairline bg-void/60 px-2 py-1 font-mono text-[10px] text-fog hover:text-breath hover:border-signal/40 transition-colors"
              title="Expand call dock"
            >
              Expand ⤢
            </button>

            {/* Leave button */}
            <Button
              variant="danger"
              size="sm"
              onClick={leaveCall}
              className="h-6 px-2 text-[10px] font-mono cursor-pointer rounded-full"
              title="Leave call"
            >
              Leave ↗
            </Button>
          </div>
        </div>
      ) : (
        /* EXPANDED FULL CALL DOCK */
        <div
          ref={dockRef}
          data-call-dock
          className="relative mb-3 flex max-h-[64vh] flex-col overflow-hidden rounded-md border hairline bg-smoke/90 p-3 shadow-[var(--shadow-panel)] backdrop-blur-md"
        >
          {/* Top bar: title · timer · zero-storage badge · Collapse · Leave Call */}
          <div className="flex shrink-0 items-center justify-between pb-2.5 border-b hairline">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-signal" />
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-fog-dim font-medium">
                on the line
              </span>
              <span className="font-mono text-xs text-signal font-semibold">
                {formatDuration(callDuration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] tracking-wider text-fog-dim hidden sm:inline uppercase">
                nothing recorded
              </span>

              {/* Collapse into floating bar */}
              <button
                type="button"
                onClick={() => setIsCollapsed(true)}
                className="flex cursor-pointer items-center gap-1 rounded-sm border border-fog/20 bg-smoke px-2 py-1 font-mono text-[10px] text-fog hover:text-breath hover:border-signal/40 transition-colors"
                title="Collapse call dock to floating bar"
              >
                Collapse ─
              </button>
            </div>
          </div>

          {/* Scrollable body: screen + tiles + ring. Flex-1 so the top bar and
              controls stay pinned and visible even when a shared screen makes
              the dock taller than the viewport. */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {/* Error alert if device access failed */}
          {error && (
            <div className="mt-2 flex items-center justify-between rounded bg-ember/10 border border-ember/20 px-2.5 py-1.5 font-mono text-[11px] text-ember">
              <span>{error}</span>
              <button
                type="button"
                onClick={clearError}
                className="ml-2 text-ember/80 hover:text-ember cursor-pointer"
              >
                ×
              </button>
            </div>
          )}

          {/* Speaking While Muted QoL Alert */}
          {speakingWhileMuted && (
            <div className="mt-2.5 flex items-center justify-between rounded-sm border border-ember/40 bg-ember/15 px-3 py-1.5 font-mono text-[11px] text-breath shadow-[0_0_16px_rgba(255,107,107,0.25)] animate-pulse">
              <div className="flex items-center gap-2">
                <span className="text-ember font-bold">⚠️</span>
                <span>You&rsquo;re speaking while muted</span>
              </div>
              <button
                type="button"
                onClick={toggleMute}
                className="ml-3 rounded bg-ember/30 px-2 py-0.5 text-[10px] font-medium text-breath hover:bg-ember/50 cursor-pointer transition-colors"
              >
                Click to unmute
              </button>
            </div>
          )}

          {/* Shared screen, when someone is presenting */}
          {presenter && presenterStream && (
            <ScreenStage
              stream={presenterStream}
              label={presenterIsSelf ? "you're sharing" : `${presenter.name} is sharing`}
            />
          )}

          {/* Participant grid: Discord-style sound-reactive avatar tiles */}
          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2.5">
            {/* Local user */}
            <div data-voice-tile>
              <VoiceTile
                name={selfName}
                isSelf
                isSpeaking={isLocalSpeaking}
                isMuted={isMuted}
                volume={localVol}
                sharing={isSharing}
              />
            </div>

            {/* Remote members */}
            {remoteMembers.map((m) => (
              <div data-voice-tile key={m.peerId}>
                <VoiceTile
                  name={m.name}
                  isSpeaking={speakingPeers.has(m.peerId)}
                  isMuted={m.muted}
                  volume={peerVolumes.get(m.peerId) ?? 0}
                  sharing={m.sharing}
                />
              </div>
            ))}
          </div>

          {/* Ring others in: room members not on the line yet. One chime per
              person per cooldown — the button locks after you ring them. */}
          {ringable.length > 0 && (
            <div className="mt-3 rounded-sm border hairline bg-void/30 p-2.5">
              <div className="mb-1.5 flex items-center gap-1.5">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-fog-dim">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-fog-dim font-medium">
                  Ring to join
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ringable.map((p) => {
                  const isCooling = cooling.has(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => ringPeer(p.id)}
                      disabled={isCooling}
                      title={isCooling ? `Already ringing ${p.name}` : `Ring ${p.name} to join the call`}
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors duration-200 ${
                        isCooling
                          ? "cursor-default border-fog/15 bg-void/40 text-fog-dim"
                          : "cursor-pointer border-signal/40 bg-signal/10 text-signal hover:bg-signal/20 hover:border-signal/70"
                      }`}
                    >
                      <span className="truncate max-w-[8rem]">{p.name}</span>
                      <span className="text-[10px]">{isCooling ? "rung ✓" : "ring ↗"}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          </div>

          {/* In-Call Controls: centered round buttons, Discord-style, with a
              red hang-up as the clear primary exit. */}
          <div className="mt-3 shrink-0 flex flex-col items-center gap-2 pt-3 border-t hairline">
            <div className="flex items-center gap-3">
              {/* Mic Mute / Unmute */}
              <button
                type="button"
                onClick={toggleMute}
                className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-signal/40 ${
                  isMuted
                    ? "border-ember/40 bg-ember/15 text-ember hover:bg-ember/25"
                    : "border-fog/25 bg-void/60 text-breath hover:border-signal/40 hover:text-signal"
                }`}
                title={isMuted ? "Unmute microphone" : "Mute microphone"}
                aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
              >
                {isMuted ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                )}
              </button>

              {/* Push-to-Talk mode toggle */}
              <button
                type="button"
                onClick={togglePtt}
                className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-signal/40 ${
                  pttEnabled
                    ? "border-signal/50 bg-signal/15 text-signal"
                    : "border-fog/25 bg-void/60 text-fog hover:border-fog/50 hover:text-breath"
                }`}
                title={pttEnabled ? "Push-to-Talk on — hold Space to talk" : "Enable Push-to-Talk"}
                aria-label="Toggle Push-to-Talk"
                aria-pressed={pttEnabled}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                  <path d="M5 11a7 7 0 0 0 14 0" />
                  <line x1="12" y1="18" x2="12" y2="22" />
                </svg>
              </button>

              {/* Screen share — one presenter at a time, so this locks out
                  while someone else is already sharing */}
              {(shareSupported || isSharing) && (
                <button
                  type="button"
                  onClick={() => (isSharing ? stopShare() : startShare())}
                  disabled={someoneElseSharing}
                  className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-signal/40 ${
                    someoneElseSharing
                      ? "cursor-not-allowed border-fog/15 bg-void/40 text-fog-dim"
                      : isSharing
                        ? "border-signal/50 bg-signal/15 text-signal hover:bg-signal/25"
                        : "border-fog/25 bg-void/60 text-fog hover:border-signal/40 hover:text-signal"
                  }`}
                  title={
                    someoneElseSharing
                      ? `${presenter?.name ?? "Someone"} is already sharing`
                      : isSharing
                        ? "Stop sharing your screen"
                        : "Share your screen"
                  }
                  aria-label={isSharing ? "Stop sharing your screen" : "Share your screen"}
                  aria-pressed={isSharing}
                >
                  {isSharing ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <path d="M8 21h8M12 17v4" />
                      <line x1="2" y1="2" x2="22" y2="22" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <path d="M8 21h8M12 17v4" />
                    </svg>
                  )}
                </button>
              )}

              {/* Red hang-up — the clear way out */}
              <button
                type="button"
                onClick={leaveCall}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-ember/50 bg-ember/90 text-void shadow-[0_0_16px_rgba(232,169,169,0.35)] transition-colors duration-200 outline-none hover:bg-ember focus-visible:ring-2 focus-visible:ring-ember/50"
                title="Leave call"
                aria-label="Leave call"
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.996.996 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-1.78 1.78c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28a11.27 11.27 0 0 0-2.66-1.85.998.998 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
                </svg>
              </button>
            </div>

            {/* Hold-to-Talk pad only when PTT is on (handy on touch) */}
            {pttEnabled && (
              <button
                type="button"
                onMouseDown={() => {
                  setPttHeld(true)
                  setPttPressed(true)
                }}
                onMouseUp={() => {
                  setPttHeld(false)
                  setPttPressed(false)
                }}
                onTouchStart={(e) => {
                  e.preventDefault()
                  setPttHeld(true)
                  setPttPressed(true)
                }}
                onTouchEnd={(e) => {
                  e.preventDefault()
                  setPttHeld(false)
                  setPttPressed(false)
                }}
                className={`flex cursor-pointer select-none items-center gap-1.5 rounded-full border px-4 py-1.5 font-mono text-[11px] transition-colors duration-150 ${
                  pttHeld
                    ? "border-signal bg-signal/30 text-breath shadow-[0_0_12px_rgba(169,232,220,0.4)]"
                    : "border-fog/30 bg-smoke text-fog hover:border-signal/40 hover:text-breath"
                }`}
                title="Hold Space or press and hold here to talk"
              >
                <span className={`h-2 w-2 rounded-full ${pttHeld ? "bg-signal animate-ping" : "bg-fog-dim"}`} />
                <span>{pttHeld ? "Transmitting…" : "Hold to talk — or press Space"}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
