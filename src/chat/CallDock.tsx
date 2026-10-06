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
    }
  }, [localStream, videoEnabled])

  // Count active video streams to decide whether to render the video grid
  const hasAnyVideo =
    videoEnabled ||
    callState.members.some((m) => m.peerId !== selfId && m.videoEnabled)

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
            className="h-6 px-2 text-[11px] font-mono"
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
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {/* Local user video card if camera is on */}
          {videoEnabled && (
            <div
              className={`relative aspect-video overflow-hidden rounded border bg-void/80 transition-all ${
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
              <div className="absolute bottom-1 left-1.5 flex items-center gap-1 rounded bg-void/70 px-1.5 py-0.5 font-mono text-[9px] text-breath backdrop-blur-xs">
                <span>{selfName} (you)</span>
                {isMuted && <span className="text-ember">· muted</span>}
              </div>
            </div>
          )}

          {/* Remote peers video cards */}
          {callState.members
            .filter((m) => m.peerId !== selfId && m.videoEnabled)
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
      <div className="mt-3 flex items-center justify-between pt-2 border-t hairline">
        <div className="flex items-center gap-2">
          {/* Mute button */}
          <button
            type="button"
            onClick={toggleMute}
            className={`flex cursor-pointer items-center gap-1.5 rounded-sm border px-2.5 py-1 font-mono text-[11px] transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-signal/40 ${
              isMuted
                ? "border-ember/40 bg-ember/10 text-ember hover:border-ember hover:bg-ember/20"
                : "border-fog/25 bg-smoke text-breath hover:border-signal/40 hover:text-signal"
            }`}
            title={isMuted ? "Unmute microphone" : "Mute microphone"}
          >
            <span aria-hidden="true">{isMuted ? "✕" : "●"}</span>
            <span>{isMuted ? "Unmute" : "Mute"}</span>
          </button>

          {/* Video toggle button */}
          <button
            type="button"
            onClick={toggleVideo}
            className={`flex cursor-pointer items-center gap-1.5 rounded-sm border px-2.5 py-1 font-mono text-[11px] transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-signal/40 ${
              videoEnabled
                ? "border-signal/50 bg-signal/15 text-signal hover:bg-signal/25"
                : "border-fog/25 bg-smoke text-breath hover:border-fog/60 hover:text-signal"
            }`}
            title={videoEnabled ? "Turn off camera" : "Turn on camera"}
          >
            <span aria-hidden="true">{videoEnabled ? "■" : "▲"}</span>
            <span>{videoEnabled ? "Video on" : "Video off"}</span>
          </button>
        </div>

        <span className="font-mono text-[10px] text-fog-dim hidden xs:inline">
          {callState.members.length} {callState.members.length === 1 ? "voice" : "voices"} in call
        </span>
      </div>
    </div>
  )
}

function RemoteVideoCard({
  member,
  stream,
  isSpeaking,
}: {
  member: { peerId: string; name: string; muted: boolean }
  stream?: MediaStream
  isSpeaking: boolean
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <div
      className={`relative aspect-video overflow-hidden rounded border bg-void/80 transition-all ${
        isSpeaking
          ? "border-signal shadow-[0_0_12px_rgba(169,232,220,0.25)]"
          : "border-fog/20"
      }`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="h-full w-full object-cover"
      />
      <div className="absolute bottom-1 left-1.5 flex items-center gap-1 rounded bg-void/70 px-1.5 py-0.5 font-mono text-[9px] text-breath backdrop-blur-xs">
        <span>{member.name}</span>
        {member.muted && <span className="text-ember">· muted</span>}
      </div>
    </div>
  )
}
