import { useEffect, useRef, useState } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import type { CallState } from "@shared/protocol"
import { Button } from "@/components/ui/button"
import { AudioWaveform } from "./AudioWaveform"
import type { WebRTCController } from "./useWebRTC"

interface CallDockProps {
  rtc: WebRTCController
  callState: CallState
  selfName: string
  selfId: string
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
}

/**
 * Discord-style voice participant tile: a monogram avatar wrapped in a
 * sound-reactive mint ring (the signature element) that tightens and glows
 * with live amplitude, a mute badge, and a name label with an equalizer.
 */
function VoiceTile({ name, isSelf, isSpeaking, isMuted, volume }: VoiceTileProps) {
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
          className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-smoke-2 to-void font-mono text-base font-semibold text-breath transition-all duration-150"
          style={{
            boxShadow: `0 0 0 2px rgba(169, 232, 220, ${ringAlpha})${
              glow > 0 ? `, 0 0 ${glow}px rgba(169, 232, 220, ${0.3 + volume * 0.4})` : ""
            }`,
          }}
        >
          {initials(name)}
        </div>

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
}: CallDockProps) {
  const dockRef = useRef<HTMLDivElement>(null)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [pttHeld, setPttHeld] = useState(false)

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
    leaveCall,
    toggleMute,
    togglePtt,
    setPttPressed,
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

  // Find who is currently speaking among remote members (for the collapsed bar)
  const activeRemoteSpeaker = remoteMembers.find((m) => speakingPeers.has(m.peerId))

  return (
    <>
      {isCollapsed ? (
        /* FLOATING COMPACT CALL BAR */
        <div
          ref={dockRef}
          data-call-dock
          className="sticky top-2 z-30 mb-3 flex items-center justify-between gap-3 rounded-full border hairline bg-smoke/95 px-3 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all duration-300"
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
          className="relative mb-3 overflow-hidden rounded-md border hairline bg-smoke/90 p-3 shadow-[var(--shadow-panel)] backdrop-blur-md transition-all duration-300"
        >
          {/* Top bar: title · timer · zero-storage badge · Collapse · Leave Call */}
          <div className="flex items-center justify-between pb-2.5 border-b hairline">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-signal" />
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-fog-dim font-medium">
                Ephemeral Voice Call
              </span>
              <span className="font-mono text-xs text-signal font-semibold">
                {formatDuration(callDuration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] tracking-wider text-fog-dim hidden sm:inline uppercase">
                P2P · ZERO-STORAGE
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

              <Button
                variant="danger"
                size="sm"
                onClick={leaveCall}
                className="h-6 px-2 text-[11px] font-mono cursor-pointer"
                title="Leave call and stay in chat"
              >
                Leave call ↗
              </Button>
            </div>
          </div>

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
                <span>You are speaking while muted</span>
              </div>
              <button
                type="button"
                onClick={toggleMute}
                className="ml-3 rounded bg-ember/30 px-2 py-0.5 text-[10px] font-medium text-breath hover:bg-ember/50 cursor-pointer transition-colors"
              >
                Click to Unmute
              </button>
            </div>
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
                />
              </div>
            ))}
          </div>

          {/* In-Call Action Bar: Mic toggle · Push-to-Talk · Voice count */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t hairline">
            <div className="flex flex-wrap items-center gap-2">
              {/* Mic Mute / Unmute Button */}
              <button
                type="button"
                onClick={toggleMute}
                className={`flex cursor-pointer items-center gap-1.5 rounded-sm border px-2.5 py-1.5 font-mono text-[11px] transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-signal/40 ${
                  isMuted
                    ? "border-ember/40 bg-ember/10 text-ember hover:border-ember hover:bg-ember/20"
                    : "border-fog/25 bg-smoke text-breath hover:border-signal/40 hover:text-signal"
                }`}
                title={isMuted ? "Unmute microphone" : "Mute microphone"}
              >
                {isMuted ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                )}
                <span>{isMuted ? "Unmute" : "Mute"}</span>
              </button>

              {/* Push-to-Talk Mode Toggle */}
              <button
                type="button"
                onClick={togglePtt}
                className={`flex cursor-pointer items-center gap-1.5 rounded-sm border px-2.5 py-1.5 font-mono text-[11px] transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-signal/40 ${
                  pttEnabled
                    ? "border-signal/50 bg-signal/15 text-signal"
                    : "border-fog/20 bg-smoke text-fog hover:border-fog/40 hover:text-breath"
                }`}
                title="Toggle Push-to-Talk (hold Spacebar to talk)"
              >
                <span>PTT [Space]:</span>
                <span className="font-semibold">{pttEnabled ? "ON" : "OFF"}</span>
              </button>

              {/* Push-to-Talk Hold Button (Useful for mobile & touch or clicking) */}
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
                  className={`flex cursor-pointer select-none items-center gap-1.5 rounded-sm border px-3 py-1.5 font-mono text-[11px] transition-all duration-150 ${
                    pttHeld
                      ? "border-signal bg-signal/30 text-breath shadow-[0_0_12px_rgba(169,232,220,0.4)]"
                      : "border-fog/30 bg-smoke text-fog hover:border-signal/40 hover:text-breath"
                  }`}
                  title="Press and hold Space or click and hold here to talk"
                >
                  <span className={`h-2 w-2 rounded-full ${pttHeld ? "bg-signal animate-ping" : "bg-fog-dim"}`} />
                  <span>{pttHeld ? "Transmitting..." : "Hold to Talk"}</span>
                </button>
              )}
            </div>

            <span className="font-mono text-[10px] text-fog-dim hidden xs:inline">
              {callState.members.length} {callState.members.length === 1 ? "voice" : "voices"} in call
            </span>
          </div>
        </div>
      )}
    </>
  )
}
