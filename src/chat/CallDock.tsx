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
    videoEnabled,
    localStream,
    remoteStreams,
    speakingPeers,
    callDuration,
    error,
    leaveCall,
    toggleMute,
    toggleVideo,
    clearError,
  } = rtc

  // Video element refs for rendering active video streams
  const localVideoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
      void localVideoRef.current.play().catch(() => {})
    }
  }, [localStream, videoEnabled])

  // Count active video streams to decide whether to render the video grid
  const hasAnyVideo =
    videoEnabled ||
    callState.members.some(
      (m) =>
        m.peerId !== selfId &&
        (m.videoEnabled ||
          (remoteStreams.get(m.peerId)?.getVideoTracks().length ?? 0) > 0)
    )

  return (
    <div
      ref={dockRef}
      data-call-dock
      className="relative mb-3 overflow-hidden rounded-md border hairline bg-smoke/90 p-3 shadow-[var(--shadow-panel)] backdrop-blur-md transition-all duration-300"
    >
      {/* Top bar: title · timer · zero-storage badge */}
      <div className="flex items-center justify-between pb-2.5 border-b hairline">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-signal" />
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-fog-dim">
            Ephemeral Call
          </span>
          <span className="font-mono text-xs text-signal">
            {formatDuration(callDuration)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] tracking-wider text-fog-dim hidden sm:inline">
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

      {/* Video Grid (shown when at least one participant has camera enabled) */}
      {hasAnyVideo && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Local user video card if camera is on */}
          {videoEnabled && (
            <div
              className={`relative aspect-video overflow-hidden rounded border bg-void/90 transition-all ${
                speakingPeers.has("local")
                  ? "border-signal shadow-[0_0_12px_rgba(169,232,220,0.25)]"
                  : "border-fog/20"
              }`}
            >
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover -scale-x-100"
              />
              <div className="absolute bottom-1.5 left-2 flex items-center gap-1.5 rounded bg-void/80 px-2 py-0.5 font-mono text-[10px] text-breath backdrop-blur-xs">
                <span>{selfName} (you)</span>
                {isMuted && <span className="text-ember">· muted</span>}
              </div>
            </div>
          )}

          {/* Remote peers video cards */}
          {callState.members
            .filter(
              (m) =>
                m.peerId !== selfId &&
                (m.videoEnabled ||
                  (remoteStreams.get(m.peerId)?.getVideoTracks().length ?? 0) > 0)
            )
            .map((member) => (
              <RemoteVideoCard
                key={member.peerId}
                member={member}
                stream={remoteStreams.get(member.peerId)}
                isSpeaking={speakingPeers.has(member.peerId)}
              />
            ))}
        </div>
      )}

      {/* Audio Members & Waveforms */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Local user pill */}
        <div
          className={`flex items-center gap-2 rounded-sm border px-2.5 py-1 font-mono text-[11px] transition-colors ${
            speakingPeers.has("local")
              ? "border-signal/50 bg-signal/5 text-breath shadow-[0_0_10px_rgba(169,232,220,0.15)]"
              : "border-fog/20 bg-smoke text-fog"
          }`}
        >
          <span className="font-medium text-breath">{selfName}</span>
          <span className="text-fog-dim text-[10px]">(you)</span>
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
                className={`flex items-center gap-2 rounded-sm border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                  isSpeaking
                    ? "border-signal/50 bg-signal/5 text-breath shadow-[0_0_10px_rgba(169,232,220,0.15)]"
                    : "border-fog/20 bg-smoke text-fog"
                }`}
              >
                <span className="text-breath">{m.name}</span>
                <AudioWaveform
                  isSpeaking={isSpeaking}
                  isMuted={m.muted}
                  className="w-16 h-4"
                />
              </div>
            )
          })}
      </div>

      {/* In-Call Action Bar: Mic toggle · Camera toggle */}
      <div className="mt-3 flex items-center justify-between pt-2.5 border-t hairline">
        <div className="flex items-center gap-2">
          {/* Mute button */}
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

          {/* Video toggle button */}
          <button
            type="button"
            onClick={toggleVideo}
            className={`flex cursor-pointer items-center gap-1.5 rounded-sm border px-2.5 py-1.5 font-mono text-[11px] transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-signal/40 ${
              videoEnabled
                ? "border-signal/50 bg-signal/15 text-signal hover:bg-signal/25"
                : "border-fog/25 bg-smoke text-breath hover:border-fog/60 hover:text-signal"
            }`}
            title={videoEnabled ? "Turn off camera" : "Turn on camera"}
          >
            {videoEnabled ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m4 0h5a2 2 0 0 1 2 2v3l7-5v11l-3-2.14" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
            <span>{videoEnabled ? "Video on" : "Video off"}</span>
          </button>
        </div>

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
        // Autoplay may be restricted until user gesture
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

function RemoteVideoCard({
  member,
  stream,
  isSpeaking,
}: {
  member: { peerId: string; name: string; muted: boolean; videoEnabled?: boolean }
  stream?: MediaStream
  isSpeaking: boolean
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) {
      setIsPlaying(false)
      return
    }

    video.srcObject = stream

    const tryPlay = () => {
      const vTracks = stream.getVideoTracks()
      if (vTracks.length > 0 && vTracks.some((t) => t.readyState !== "ended")) {
        video
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {})
      }
    }

    tryPlay()

    const onPlaying = () => setIsPlaying(true)
    const onLoadedMetadata = () => {
      tryPlay()
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setIsPlaying(true)
      }
    }

    video.addEventListener("loadedmetadata", onLoadedMetadata)
    video.addEventListener("loadeddata", onLoadedMetadata)
    video.addEventListener("canplay", tryPlay)
    video.addEventListener("playing", onPlaying)
    video.addEventListener("resize", onLoadedMetadata)

    const onTrackChange = () => {
      tryPlay()
    }
    stream.addEventListener("addtrack", onTrackChange)
    stream.addEventListener("removetrack", onTrackChange)
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener("unmute", tryPlay)
    })

    if (stream.getVideoTracks().some((t) => t.readyState === "live" && t.enabled)) {
      setIsPlaying(true)
    }

    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata)
      video.removeEventListener("loadeddata", onLoadedMetadata)
      video.removeEventListener("canplay", tryPlay)
      video.removeEventListener("playing", onPlaying)
      video.removeEventListener("resize", onLoadedMetadata)
      stream.removeEventListener("addtrack", onTrackChange)
      stream.removeEventListener("removetrack", onTrackChange)
      stream.getVideoTracks().forEach((track) => {
        track.removeEventListener("unmute", tryPlay)
      })
    }
  }, [stream])

  return (
    <div
      className={`relative aspect-video overflow-hidden rounded border bg-void/90 transition-all ${
        isSpeaking
          ? "border-signal shadow-[0_0_12px_rgba(169,232,220,0.25)]"
          : "border-fog/20"
      }`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`h-full w-full object-cover transition-opacity duration-300 ${
          isPlaying ? "opacity-100" : "opacity-0"
        }`}
      />
      {!isPlaying && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-void/80 p-2 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-fog/20 bg-smoke font-mono text-xs text-breath">
            {member.name.slice(0, 2).toUpperCase()}
          </span>
          <span className="font-mono text-[10px] text-fog-dim animate-pulse">
            connecting camera...
          </span>
        </div>
      )}
      <div className="absolute bottom-1.5 left-2 flex items-center gap-1.5 rounded bg-void/80 px-2 py-0.5 font-mono text-[10px] text-breath backdrop-blur-xs">
        <span>{member.name}</span>
        {member.muted && <span className="text-ember">· muted</span>}
      </div>
    </div>
  )
}
