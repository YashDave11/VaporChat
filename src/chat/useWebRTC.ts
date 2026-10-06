import { useState, useRef, useEffect, useCallback } from "react"
import type { CallMode, CallState, CallSignal } from "@shared/protocol"
import { getSocket } from "./socket"
import { playCue } from "@/lib/sound"

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
]

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: { ideal: 48000 },
}

interface PeerConnectionBundle {
  pc: RTCPeerConnection
  remoteStream: MediaStream
  audioEl?: HTMLAudioElement
  pendingCandidates: RTCIceCandidateInit[]
}

export interface WebRTCController {
  inCall: boolean
  isStarting: boolean
  isMuted: boolean
  videoEnabled: boolean
  mode: CallMode
  localStream: MediaStream | null
  remoteStreams: Map<string, MediaStream>
  speakingPeers: Set<string>
  callDuration: number
  error: string | null
  startCall: (mode: CallMode) => Promise<void>
  leaveCall: () => void
  toggleMute: () => void
  toggleVideo: () => Promise<void>
  clearError: () => void
}

export function useWebRTC(callState: CallState, roomOpen: boolean): WebRTCController {
  const [inCall, setInCall] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [videoEnabled, setVideoEnabled] = useState(false)
  const [mode, setMode] = useState<CallMode>("audio")
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(new Set())
  const [callDuration, setCallDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const localStreamRef = useRef<MediaStream | null>(null)
  const peersRef = useRef<Map<string, PeerConnectionBundle>>(new Map())
  const inCallRef = useRef(false)
  inCallRef.current = inCall

  const isMutedRef = useRef(false)
  isMutedRef.current = isMuted

  const videoEnabledRef = useRef(false)
  videoEnabledRef.current = videoEnabled

  // Web Audio analyzer for speaking detection
  const audioCtxRef = useRef<AudioContext | null>(null)
  const localAnalyserRef = useRef<AnalyserNode | null>(null)
  const remoteAnalysersRef = useRef<Map<string, AnalyserNode>>(new Map())
  const animFrameRef = useRef<number | null>(null)

  // Call timer
  useEffect(() => {
    if (!inCall) {
      setCallDuration(0)
      return
    }
    const interval = setInterval(() => {
      setCallDuration((d) => d + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [inCall])

  const ensureAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx()
      }
    }
    if (audioCtxRef.current?.state === "suspended") {
      void audioCtxRef.current.resume().catch(() => {})
    }
    return audioCtxRef.current
  }, [])

  // Hook up audio level detection loop
  const startVolumeDetection = useCallback(() => {
    const actx = ensureAudioContext()
    if (!actx) return

    const dataArray = new Uint8Array(64)
    const checkVolumes = () => {
      const speaking = new Set<string>()

      // Check local user (if not muted)
      if (localAnalyserRef.current && !isMutedRef.current) {
        localAnalyserRef.current.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
        const avg = sum / dataArray.length
        if (avg > 14) speaking.add("local")
      }

      // Check remote peers
      remoteAnalysersRef.current.forEach((analyser, peerId) => {
        analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
        const avg = sum / dataArray.length
        if (avg > 14) speaking.add(peerId)
      })

      setSpeakingPeers((prev) => {
        if (prev.size === speaking.size && [...prev].every((x) => speaking.has(x))) {
          return prev
        }
        return speaking
      })

      animFrameRef.current = requestAnimationFrame(checkVolumes)
    }

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    animFrameRef.current = requestAnimationFrame(checkVolumes)
  }, [ensureAudioContext])

  const attachRemoteAnalyser = useCallback((peerId: string, stream: MediaStream) => {
    const actx = ensureAudioContext()
    if (!actx) return
    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0) return

    try {
      const source = actx.createMediaStreamSource(stream)
      const analyser = actx.createAnalyser()
      analyser.fftSize = 64
      analyser.smoothingTimeConstant = 0.4
      source.connect(analyser)
      remoteAnalysersRef.current.set(peerId, analyser)
    } catch {
      // ignore
    }
  }, [ensureAudioContext])

  const createPeerConnection = useCallback((peerId: string): PeerConnectionBundle => {
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 2,
    })

    const remoteStream = new MediaStream()
    const bundle: PeerConnectionBundle = {
      pc,
      remoteStream,
      pendingCandidates: [],
    }

    // Attach local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!)
      })
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        getSocket().emit("call:signal", {
          to: peerId,
          signal: {
            type: "candidate",
            candidate: {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              usernameFragment: event.candidate.usernameFragment,
            },
          },
        })
      }
    }

    // Handle incoming remote media tracks
    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        if (!remoteStream.getTracks().some((t) => t.id === track.id)) {
          remoteStream.addTrack(track)
        }
      })

      // Audio playback element for ultra-low latency playback
      if (!bundle.audioEl) {
        const audio = new Audio()
        audio.srcObject = remoteStream
        audio.autoplay = true
        void audio.play().catch(() => {})
        bundle.audioEl = audio
      }

      attachRemoteAnalyser(peerId, remoteStream)

      setRemoteStreams((prev) => {
        const updated = new Map(prev)
        updated.set(peerId, remoteStream)
        return updated
      })
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        bundle.audioEl?.pause()
        if (bundle.audioEl) bundle.audioEl.srcObject = null
      }
    }

    peersRef.current.set(peerId, bundle)
    return bundle
  }, [attachRemoteAnalyser])

  // Leave call and clean up
  const leaveCall = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }

    // Stop and clean up all peer connections
    peersRef.current.forEach((bundle) => {
      bundle.audioEl?.pause()
      if (bundle.audioEl) bundle.audioEl.srcObject = null
      bundle.pc.close()
    })
    peersRef.current.clear()

    remoteAnalysersRef.current.clear()
    localAnalyserRef.current = null

    // Stop local hardware tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
      setLocalStream(null)
    }

    setRemoteStreams(new Map())
    setSpeakingPeers(new Set())
    setInCall(false)
    setIsStarting(false)
    setIsMuted(false)
    setVideoEnabled(false)

    playCue("call_leave")
    getSocket().emit("call:leave")
  }, [])

  // Start / join call
  const startCall = useCallback(
    async (callMode: CallMode) => {
      setIsStarting(true)
      setError(null)
      try {
        ensureAudioContext()
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: AUDIO_CONSTRAINTS,
          video: callMode === "video" ? { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } } : false,
        })

        localStreamRef.current = stream
        setLocalStream(stream)
        setMode(callMode)
        setIsMuted(false)
        setVideoEnabled(callMode === "video")
        setInCall(true)

        // Connect local audio analyser
        const actx = ensureAudioContext()
        if (actx) {
          const source = actx.createMediaStreamSource(stream)
          const analyser = actx.createAnalyser()
          analyser.fftSize = 64
          analyser.smoothingTimeConstant = 0.4
          source.connect(analyser)
          localAnalyserRef.current = analyser
        }

        playCue("call_join")
        getSocket().emit("call:join", { mode: callMode })
        startVolumeDetection()
      } catch (err) {
        const message = err instanceof Error ? err.message : "Media device access denied"
        setError(message.includes("Permission") || message.includes("denied") ? "Microphone access was denied. Please allow audio access in your browser." : "Could not connect to microphone/camera.")
      } finally {
        setIsStarting(false)
      }
    },
    [ensureAudioContext, startVolumeDetection]
  )

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return
    const next = !isMutedRef.current
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !next
    })
    setIsMuted(next)
    getSocket().emit("call:state_update", {
      muted: next,
      videoEnabled: videoEnabledRef.current,
    })
  }, [])

  // Toggle video
  const toggleVideo = useCallback(async () => {
    if (!localStreamRef.current) return
    const next = !videoEnabledRef.current

    if (next) {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
        })
        const newTrack = videoStream.getVideoTracks()[0]
        if (newTrack) {
          localStreamRef.current.addTrack(newTrack)
          // Add to all active peer connections
          peersRef.current.forEach(({ pc }) => {
            pc.addTrack(newTrack, localStreamRef.current!)
          })
          setVideoEnabled(true)
          setMode("video")
          getSocket().emit("call:state_update", {
            muted: isMutedRef.current,
            videoEnabled: true,
          })
        }
      } catch {
        setError("Camera permission denied or camera unavailable.")
      }
    } else {
      // Turn video off
      const videoTracks = localStreamRef.current.getVideoTracks()
      videoTracks.forEach((track) => {
        track.stop()
        localStreamRef.current?.removeTrack(track)
        peersRef.current.forEach(({ pc }) => {
          const senders = pc.getSenders()
          const sender = senders.find((s) => s.track === track)
          if (sender) pc.removeTrack(sender)
        })
      })
      setVideoEnabled(false)
      getSocket().emit("call:state_update", {
        muted: isMutedRef.current,
        videoEnabled: false,
      })
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])

  // Handle incoming signals from the server
  useEffect(() => {
    const socket = getSocket()

    const onCallSignal = async ({ from, signal }: { from: string; signal: CallSignal }) => {
      if (!inCallRef.current) return

      let bundle = peersRef.current.get(from)
      if (!bundle) {
        bundle = createPeerConnection(from)
      }
      const { pc } = bundle

      if (signal.type === "offer") {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp as RTCSessionDescriptionInit))
          // Flush pending candidates
          while (bundle.pendingCandidates.length > 0) {
            const cand = bundle.pendingCandidates.shift()
            if (cand) await pc.addIceCandidate(new RTCIceCandidate(cand))
          }
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          socket.emit("call:signal", {
            to: from,
            signal: {
              type: "answer",
              sdp: { type: answer.type, sdp: answer.sdp },
            },
          })
        } catch {
          // ignore negotiation error
        }
      } else if (signal.type === "answer") {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp as RTCSessionDescriptionInit))
          while (bundle.pendingCandidates.length > 0) {
            const cand = bundle.pendingCandidates.shift()
            if (cand) await pc.addIceCandidate(new RTCIceCandidate(cand))
          }
        } catch {
          // ignore
        }
      } else if (signal.type === "candidate") {
        try {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate as RTCIceCandidateInit))
          } else {
            bundle.pendingCandidates.push(signal.candidate as RTCIceCandidateInit)
          }
        } catch {
          // ignore
        }
      }
    }

    socket.on("call:signal", onCallSignal)
    return () => {
      socket.off("call:signal", onCallSignal)
    }
  }, [createPeerConnection])

  // Mesh peer reconciliation when callState members change
  useEffect(() => {
    if (!inCall) return
    const socket = getSocket()
    const myId = socket.id
    if (!myId) return

    const memberIds = new Set(callState.members.map((m) => m.peerId))

    // Initiate offer to any other member if we are deterministic initiator (myId < otherId)
    callState.members.forEach(async (member) => {
      if (member.peerId === myId) return
      if (!peersRef.current.has(member.peerId)) {
        if (myId < member.peerId) {
          const bundle = createPeerConnection(member.peerId)
          try {
            const offer = await bundle.pc.createOffer()
            await bundle.pc.setLocalDescription(offer)
            socket.emit("call:signal", {
              to: member.peerId,
              signal: {
                type: "offer",
                sdp: { type: offer.type, sdp: offer.sdp },
              },
            })
          } catch {
            // ignore
          }
        }
      }
    })

    // Clean up peers who left the call
    peersRef.current.forEach((bundle, peerId) => {
      if (!memberIds.has(peerId)) {
        bundle.audioEl?.pause()
        if (bundle.audioEl) bundle.audioEl.srcObject = null
        bundle.pc.close()
        peersRef.current.delete(peerId)
        remoteAnalysersRef.current.delete(peerId)
        setRemoteStreams((prev) => {
          const next = new Map(prev)
          next.delete(peerId)
          return next
        })
      }
    })
  }, [callState.members, inCall, createPeerConnection])

  // Clean up if room closes or unmounts
  useEffect(() => {
    if (!roomOpen && inCallRef.current) {
      leaveCall()
    }
  }, [roomOpen, leaveCall])

  useEffect(() => {
    return () => {
      if (inCallRef.current) leaveCall()
    }
  }, [leaveCall])

  return {
    inCall,
    isStarting,
    isMuted,
    videoEnabled,
    mode,
    localStream,
    remoteStreams,
    speakingPeers,
    callDuration,
    error,
    startCall,
    leaveCall,
    toggleMute,
    toggleVideo,
    clearError,
  }
}
