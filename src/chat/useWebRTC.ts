import { useState, useRef, useEffect, useCallback } from "react"
import type { CallState, CallSignal } from "@shared/protocol"
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
  pendingCandidates: RTCIceCandidateInit[]
}

export interface WebRTCController {
  inCall: boolean
  isStarting: boolean
  isMuted: boolean
  remoteStreams: Map<string, MediaStream>
  speakingPeers: Set<string>
  callDuration: number
  error: string | null
  startCall: () => Promise<void>
  leaveCall: () => void
  toggleMute: () => void
  clearError: () => void
}

export function useWebRTC(callState: CallState, roomOpen: boolean): WebRTCController {
  const [inCall, setInCall] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
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
      if (!isMutedRef.current && localAnalyserRef.current) {
        localAnalyserRef.current.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
        const avg = sum / dataArray.length
        if (avg > 14) speaking.add("local")
      }

      // Check remote users
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
    if (remoteAnalysersRef.current.has(peerId)) return
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

    // Attach local audio track or add audio transceiver
    const audioTrack = localStreamRef.current?.getAudioTracks()[0]
    if (audioTrack) {
      pc.addTrack(audioTrack, localStreamRef.current!)
    } else {
      pc.addTransceiver("audio", { direction: "sendrecv" })
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && event.candidate.candidate) {
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
      if (event.track) {
        if (!remoteStream.getTracks().some((t) => t.id === event.track.id)) {
          remoteStream.addTrack(event.track)
        }
      }
      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach((track) => {
          if (!remoteStream.getTracks().some((t) => t.id === track.id)) {
            remoteStream.addTrack(track)
          }
        })
      }

      pc.getReceivers().forEach((receiver) => {
        if (receiver.track && !remoteStream.getTracks().some((t) => t.id === receiver.track.id)) {
          remoteStream.addTrack(receiver.track)
        }
      })

      attachRemoteAnalyser(peerId, remoteStream)

      setRemoteStreams((prev) => {
        const updated = new Map(prev)
        updated.set(peerId, remoteStream)
        return updated
      })
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        remoteAnalysersRef.current.delete(peerId)
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
      bundle.pc.close()
    })
    peersRef.current.clear()

    remoteAnalysersRef.current.clear()
    localAnalyserRef.current = null

    // Stop local hardware tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
    }

    setRemoteStreams(new Map())
    setSpeakingPeers(new Set())
    setInCall(false)
    setIsStarting(false)
    setIsMuted(false)

    playCue("call_leave")
    getSocket().emit("call:leave")
  }, [])

  // Start / join call (voice only)
  const startCall = useCallback(async () => {
    setIsStarting(true)
    setError(null)
    try {
      ensureAudioContext()
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CONSTRAINTS,
        video: false,
      })

      localStreamRef.current = stream
      setIsMuted(false)
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
      getSocket().emit("call:join")
      startVolumeDetection()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Media device access denied"
      setError(
        message.includes("Permission") || message.includes("denied")
          ? "Microphone access was denied. Please allow audio access in your browser."
          : "Could not connect to microphone."
      )
    } finally {
      setIsStarting(false)
    }
  }, [ensureAudioContext, startVolumeDetection])

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
    })
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
          while (bundle.pendingCandidates.length > 0) {
            const cand = bundle.pendingCandidates.shift()
            if (cand) {
              try {
                await pc.addIceCandidate(cand)
              } catch {
                // ignore
              }
            }
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
            if (cand) {
              try {
                await pc.addIceCandidate(cand)
              } catch {
                // ignore
              }
            }
          }
        } catch {
          // ignore
        }
      } else if (signal.type === "candidate") {
        if (signal.candidate && signal.candidate.candidate) {
          try {
            if (pc.remoteDescription) {
              await pc.addIceCandidate(signal.candidate as RTCIceCandidateInit)
            } else {
              bundle.pendingCandidates.push(signal.candidate as RTCIceCandidateInit)
            }
          } catch {
            // ignore
          }
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

    // Sync any newly available audio tracks from receivers
    peersRef.current.forEach((bundle, peerId) => {
      let changed = false
      bundle.pc.getReceivers().forEach((receiver) => {
        if (receiver.track && !bundle.remoteStream.getTracks().some((t) => t.id === receiver.track.id)) {
          bundle.remoteStream.addTrack(receiver.track)
          changed = true
        }
      })
      if (changed) {
        setRemoteStreams((prev) => {
          const next = new Map(prev)
          next.set(peerId, bundle.remoteStream)
          return next
        })
      }
    })

    // Clean up peers who left the call
    peersRef.current.forEach((bundle, peerId) => {
      if (!memberIds.has(peerId)) {
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
    remoteStreams,
    speakingPeers,
    callDuration,
    error,
    startCall,
    leaveCall,
    toggleMute,
    clearError,
  }
}
