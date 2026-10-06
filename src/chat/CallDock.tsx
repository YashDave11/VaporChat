import { useEffect, useRef } from "react"
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

export function CallDock({
  rtc,
  callState,
  selfName,
  selfId,
}: CallDockProps) {
  const dockRef = useRef<HTMLDivElement>(null)

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
      })
    },
    { scope: dockRef }
  )

  const {
    isMuted,
    remoteStreams,
    speakingPeers,
    callDuration,
    error,
    leaveCall,
    toggleMute,
    clearError,
  } = rtc

  return (
    <div
      ref={dockRef}
      data-call-dock
      className="relative mb-3 overflow-hidden rounded-md border hairline bg-smoke/90 p-3 shadow-[var(--shadow-panel)] backdrop-blur-md transition-all duration-300"
    >
      {/* Top bar: title · timer · zero-storage badge · Leave Call */}
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

      {/* Audio Members & Waveforms */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Local user pill */}
        <div
          className={`flex items-center gap-2 rounded-sm border px-2.5 py-1.5 font-mono text-[11px] transition-colors ${
            speakingPeers.has("local")
              ? "border-signal/50 bg-signal/5 text-breath shadow-[0_0_10px_rgba(169,232,220,0.15)]"
              : "border-fog/20 bg-smoke text-fog"
          }`}
        >
          <span className="font-medium text-breath">{selfName}</span>
          <span className="text-fog-dim text-[10px]">(you)</span>
          {isMuted && <span className="text-[10px] text-ember font-medium">· muted</span>}
          <AudioWaveform
            isSpeaking={speakingPeers.has("local")}
            isMuted={isMuted}
            className="w-16 h-4"
          />
        </div>

        {/* Remote members pills */}
        {callState.members
          .filter((m) => m.peerId !== selfId)
          .map((m) => {
            const isSpeaking = speakingPeers.has(m.peerId)
            return (
              <div
                key={m.peerId}
                className={`flex items-center gap-2 rounded-sm border px-2.5 py-1.5 font-mono text-[11px] transition-colors ${
                  isSpeaking
                    ? "border-signal/50 bg-signal/5 text-breath shadow-[0_0_10px_rgba(169,232,220,0.15)]"
                    : "border-fog/20 bg-smoke text-fog"
                }`}
              >
                <span className="text-breath font-medium">{m.name}</span>
                {m.muted && <span className="text-[10px] text-ember font-medium">· muted</span>}
                <AudioWaveform
                  isSpeaking={isSpeaking}
                  isMuted={m.muted}
                  className="w-16 h-4"
                />
              </div>
            )
          })}
      </div>

      {/* In-Call Action Bar: Mic toggle · Voice count */}
      <div className="mt-3 flex items-center justify-between pt-2.5 border-t hairline">
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

        <span className="font-mono text-[10px] text-fog-dim hidden xs:inline">
          {callState.members.length} {callState.members.length === 1 ? "voice" : "voices"} in call
        </span>
      </div>

      {/* Invisible DOM-mounted audio receivers for crystal-clear remote audio in all browsers */}
      {Array.from(remoteStreams.entries()).map(([peerId, stream]) => (
        <RemoteAudioTrack key={peerId} stream={stream} />
      ))}
    </div>
  )
}

function RemoteAudioTrack({ stream }: { stream: MediaStream }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !stream) return

    audio.srcObject = stream
    audio.volume = 1.0

    const playAudio = () => {
      audio.play().catch((err) => {
        console.warn("[VaporCall] Audio playback waiting for gesture:", err)
      })
    }

    playAudio()

    // Unlock on any user gesture in case browser restricted autoplay
    const unlock = () => {
      if (audio.paused) {
        void audio.play().catch(() => {})
      }
    }

    window.addEventListener("click", unlock, { passive: true })
    window.addEventListener("touchstart", unlock, { passive: true })
    window.addEventListener("keydown", unlock, { passive: true })

    const onAddTrack = () => playAudio()
    stream.addEventListener("addtrack", onAddTrack)

    return () => {
      window.removeEventListener("click", unlock)
      window.removeEventListener("touchstart", unlock)
      window.removeEventListener("keydown", unlock)
      stream.removeEventListener("addtrack", onAddTrack)
    }
  }, [stream])

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
      controls={false}
      className="hidden"
      aria-hidden="true"
    />
  )
}
