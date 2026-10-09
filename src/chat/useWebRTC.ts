import { useState, useRef, useEffect, useCallback } from "react"
import type { CallState, CallSignal } from "@shared/protocol"
import { getSocket } from "./socket"
import { playCue } from "@/lib/sound"

/**
 * STUN gets most peers connected directly. TURN (relay) is the fallback for
 * symmetric-NAT / locked-down networks where a direct path never forms —
 * without it, those users hear silence. The public openrelay creds that used
 * to live here are defunct, so TURN is now injected from env
 * (VITE_TURN_URL / VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL). Drop in a
 * working TURN server there and relay-only networks start working with no
 * code change. VITE_TURN_URL may be a comma-separated list of urls.
 */
const env = import.meta.env
const turnUrls = (env.VITE_TURN_URL ?? "")
  .split(",")
  .map((u: string) => u.trim())
  .filter(Boolean)

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  ...(turnUrls.length
    ? [
        {
          urls: turnUrls,
          username: env.VITE_TURN_USERNAME,
          credential: env.VITE_TURN_CREDENTIAL,
        } as RTCIceServer,
      ]
    : []),
]

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}

interface PeerConnectionBundle {
  pc: RTCPeerConnection
  audioElement: HTMLAudioElement
  remoteStream: MediaStream
  pendingCandidates: RTCIceCandidateInit[]
  makingOffer: boolean
}

export interface WebRTCController {
  inCall: boolean
  isStarting: boolean
  /** our own call identity — the socket id the server keys callMembers by */
  selfId: string
  isMuted: boolean
  speakingWhileMuted: boolean
  pttEnabled: boolean
  remoteStreams: Map<string, MediaStream>
  speakingPeers: Set<string>
  peerVolumes: Map<string, number>
  callDuration: number
  error: string | null
  startCall: () => Promise<void>
  leaveCall: () => void
  toggleMute: () => void
  togglePtt: () => void
  setPttPressed: (pressed: boolean) => void
  clearError: () => void
}

export function useWebRTC(callState: CallState, roomOpen: boolean): WebRTCController {
  const [inCall, setInCall] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [speakingWhileMuted, setSpeakingWhileMuted] = useState(false)
  const [pttEnabled, setPttEnabled] = useState(false)
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(new Set())
  const [peerVolumes, setPeerVolumes] = useState<Map<string, number>>(new Map())
  const [callDuration, setCallDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const localStreamRef = useRef<MediaStream | null>(null)
  const analyserTrackRef = useRef<MediaStreamTrack | null>(null)
  const peersRef = useRef<Map<string, PeerConnectionBundle>>(new Map())
  const inCallRef = useRef(false)
  inCallRef.current = inCall

  const isMutedRef = useRef(false)
  isMutedRef.current = isMuted

  const pttEnabledRef = useRef(false)
  pttEnabledRef.current = pttEnabled

  // Web Audio analyzer for speaking & amplitude detection
  const audioCtxRef = useRef<AudioContext | null>(null)
  const localAnalyserRef = useRef<AnalyserNode | null>(null)
  const remoteAnalysersRef = useRef<Map<string, AnalyserNode>>(new Map())
  const animFrameRef = useRef<number | null>(null)
  const mutedSpeechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Call duration timer
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

  // Hook up audio level & amplitude detection loop
  const startVolumeDetection = useCallback(() => {
    const actx = ensureAudioContext()
    if (!actx) return

    const dataArray = new Uint8Array(64)
    let lastVolumeUpdate = 0

    const checkVolumes = (now: number) => {
      const speaking = new Set<string>()
      const currentVolumes = new Map<string, number>()

      // Check local user (via dedicated unmuted analyser track)
      if (localAnalyserRef.current) {
        localAnalyserRef.current.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
        const avg = sum / dataArray.length
        const normalized = Math.min(1, avg / 45)
        currentVolumes.set("local", normalized)

        if (!isMutedRef.current) {
          if (avg > 12) speaking.add("local")
        } else {
          // Detect speech while muted
          if (avg > 16) {
            setSpeakingWhileMuted(true)
            if (mutedSpeechTimerRef.current) clearTimeout(mutedSpeechTimerRef.current)
            mutedSpeechTimerRef.current = setTimeout(() => {
              setSpeakingWhileMuted(false)
            }, 1800)
          }
        }
      }

      // Check remote users
      remoteAnalysersRef.current.forEach((analyser, peerId) => {
        analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
        const avg = sum / dataArray.length
        const normalized = Math.min(1, avg / 45)
        currentVolumes.set(peerId, normalized)
        if (avg > 12) speaking.add(peerId)
      })

      // Update speaking peer badges
      setSpeakingPeers((prev) => {
        if (prev.size === speaking.size && [...prev].every((x) => speaking.has(x))) {
          return prev
        }
        return speaking
      })

      // Throttle state update of volume maps (approx 30fps for buttery UI without React overload)
      if (now - lastVolumeUpdate > 33) {
        lastVolumeUpdate = now
        setPeerVolumes(currentVolumes)
      }

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
    const existing = peersRef.current.get(peerId)
    if (existing && existing.pc.signalingState !== "closed") {
      return existing
    }

    console.log(`[VaporCall] Creating peer connection for: ${peerId}`)
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 2,
    })

    // Dedicated HTMLAudioElement mounted in DOM to prevent GC and mobile power-saving throttling
    const audioElement = new Audio()
    audioElement.autoplay = true
    audioElement.setAttribute("playsinline", "true")
    audioElement.volume = 1.0
    audioElement.muted = false
    audioElement.style.position = "fixed"
    audioElement.style.opacity = "0"
    audioElement.style.pointerEvents = "none"
    audioElement.style.width = "1px"
    audioElement.style.height = "1px"
    audioElement.style.bottom = "0"
    audioElement.style.left = "0"
    if (typeof document !== "undefined" && document.body) {
      document.body.appendChild(audioElement)
    }

    const remoteStream = new MediaStream()
    const bundle: PeerConnectionBundle = {
      pc,
      audioElement,
      remoteStream,
      pendingCandidates: [],
      makingOffer: false,
    }

    // Attach local audio track if ready, or register transceiver
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

    // Handle incoming remote media tracks directly on the audio element
    pc.ontrack = (event) => {
      console.log(`[VaporCall] ontrack from ${peerId}:`, event.track.kind)
      const incomingStream = event.streams[0] || new MediaStream([event.track])
      bundle.remoteStream = incomingStream
      bundle.audioElement.srcObject = incomingStream

      const playAudio = () => {
        bundle.audioElement.play().catch((err) => {
          console.warn(`[VaporCall] Audio play waiting for user gesture (${peerId}):`, err)
        })
      }

      playAudio()
      event.track.onunmute = () => {
        console.log(`[VaporCall] Track unmuted from ${peerId}`)
        playAudio()
      }

      // Clone track for Web Audio analyser so Chrome doesn't intercept or mute primary playback!
      try {
        const clone = event.track.clone()
        attachRemoteAnalyser(peerId, new MediaStream([clone]))
      } catch (err) {
        console.warn("[VaporCall] Error attaching remote analyser:", err)
      }

      setRemoteStreams((prev) => {
        const updated = new Map(prev)
        updated.set(peerId, incomingStream)
        return updated
      })
    }

    pc.oniceconnectionstatechange = () => {
      console.log(`[VaporCall] ICE connection state with ${peerId}:`, pc.iceConnectionState)
      if (pc.iceConnectionState === "failed") {
        void pc.restartIce()
      }
    }

    pc.onconnectionstatechange = () => {
      console.log(`[VaporCall] Peer connection state with ${peerId}:`, pc.connectionState)
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        remoteAnalysersRef.current.delete(peerId)
      }
    }

    peersRef.current.set(peerId, bundle)
    return bundle
  }, [attachRemoteAnalyser])

  // Leave call and clean up
  const leaveCall = useCallback(() => {
    inCallRef.current = false
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }

    if (mutedSpeechTimerRef.current) {
      clearTimeout(mutedSpeechTimerRef.current)
      mutedSpeechTimerRef.current = null
    }

    // Stop and clean up all peer connections & audio elements
    peersRef.current.forEach((bundle) => {
      bundle.audioElement.pause()
      bundle.audioElement.srcObject = null
      if (bundle.audioElement.parentNode) {
        bundle.audioElement.parentNode.removeChild(bundle.audioElement)
      }
      bundle.pc.close()
    })
    peersRef.current.clear()

    remoteAnalysersRef.current.clear()
    localAnalyserRef.current = null

    // Stop local hardware tracks and clone analyser track
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
    }
    if (analyserTrackRef.current) {
      analyserTrackRef.current.stop()
      analyserTrackRef.current = null
    }

    setRemoteStreams(new Map())
    setSpeakingPeers(new Set())
    setPeerVolumes(new Map())
    setInCall(false)
    setIsStarting(false)
    setIsMuted(false)
    setSpeakingWhileMuted(false)

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
      inCallRef.current = true
      setIsMuted(false)
      setSpeakingWhileMuted(false)
      setInCall(true)

      // Ensure local tracks are attached or updated on any existing peer connections
      const primaryTrack = stream.getAudioTracks()[0]
      if (primaryTrack) {
        peersRef.current.forEach((bundle) => {
          const senders = bundle.pc.getSenders()
          const audioSender = senders.find((s) => !s.track || s.track.kind === "audio")
          if (audioSender) {
            void audioSender.replaceTrack(primaryTrack).catch(() => {})
          } else {
            bundle.pc.addTrack(primaryTrack, stream)
          }
        })
      }

      // Connect local audio analyser using a cloned track so it still hears volume when muted
      const actx = ensureAudioContext()
      if (actx && primaryTrack) {
        const cloneTrack = primaryTrack.clone()
        analyserTrackRef.current = cloneTrack
        const analyserStream = new MediaStream([cloneTrack])
        const source = actx.createMediaStreamSource(analyserStream)
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
      inCallRef.current = false
      setInCall(false)
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
    if (!next) setSpeakingWhileMuted(false)
    getSocket().emit("call:state_update", {
      muted: next,
    })
  }, [])

  // Push-to-Talk controls
  const togglePtt = useCallback(() => {
    const next = !pttEnabledRef.current
    setPttEnabled(next)
    if (next) {
      // Enabling PTT defaults to muted state
      if (!isMutedRef.current) {
        toggleMute()
      }
    }
  }, [toggleMute])

  const setPttPressed = useCallback(
    (pressed: boolean) => {
      if (!localStreamRef.current || !pttEnabledRef.current) return
      // When pressed, mic is unmuted; when released, mic is muted
      const shouldMute = !pressed
      if (isMutedRef.current !== shouldMute) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = pressed
        })
        setIsMuted(shouldMute)
        if (pressed) setSpeakingWhileMuted(false)
        getSocket().emit("call:state_update", {
          muted: shouldMute,
        })
      }
    },
    []
  )

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
          console.log(`[VaporCall] Processing offer from ${from}`)
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp as RTCSessionDescriptionInit))

          while (bundle.pendingCandidates.length > 0) {
            const cand = bundle.pendingCandidates.shift()
            if (cand) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand))
              } catch (e) {
                console.warn("[VaporCall] Add queued candidate failed:", e)
              }
            }
          }

          // Ensure local audio track is attached before answering
          const audioTrack = localStreamRef.current?.getAudioTracks()[0]
          if (audioTrack) {
            const senders = pc.getSenders()
            const audioSender = senders.find((s) => !s.track || s.track.kind === "audio")
            if (audioSender) {
              void audioSender.replaceTrack(audioTrack).catch(() => {})
            } else {
              pc.addTrack(audioTrack, localStreamRef.current!)
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
        } catch (err) {
          console.error("[VaporCall] Error handling offer:", err)
        }
      } else if (signal.type === "answer") {
        try {
          console.log(`[VaporCall] Processing answer from ${from}`)
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp as RTCSessionDescriptionInit))

          while (bundle.pendingCandidates.length > 0) {
            const cand = bundle.pendingCandidates.shift()
            if (cand) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand))
              } catch (e) {
                console.warn("[VaporCall] Add queued candidate failed:", e)
              }
            }
          }
        } catch (err) {
          console.error("[VaporCall] Error handling answer:", err)
        }
      } else if (signal.type === "candidate") {
        if (signal.candidate && signal.candidate.candidate) {
          try {
            if (pc.remoteDescription && pc.remoteDescription.type) {
              await pc.addIceCandidate(new RTCIceCandidate(signal.candidate as RTCIceCandidateInit))
            } else {
              bundle.pendingCandidates.push(signal.candidate as RTCIceCandidateInit)
            }
          } catch (err) {
            console.warn("[VaporCall] Candidate handling error:", err)
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
          console.log(`[VaporCall] Initiating offer to ${member.peerId}`)
          const bundle = createPeerConnection(member.peerId)
          try {
            bundle.makingOffer = true
            const offer = await bundle.pc.createOffer()
            await bundle.pc.setLocalDescription(offer)
            socket.emit("call:signal", {
              to: member.peerId,
              signal: {
                type: "offer",
                sdp: { type: offer.type, sdp: offer.sdp },
              },
            })
          } catch (err) {
            console.error(`[VaporCall] Failed to create offer for ${member.peerId}:`, err)
          } finally {
            bundle.makingOffer = false
          }
        }
      }
    })

    // Clean up peers who left the call
    peersRef.current.forEach((bundle, peerId) => {
      if (!memberIds.has(peerId)) {
        bundle.audioElement.pause()
        bundle.audioElement.srcObject = null
        if (bundle.audioElement.parentNode) {
          bundle.audioElement.parentNode.removeChild(bundle.audioElement)
        }
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

  // Global user gesture listener to unlock audio playback in restricted browsers
  useEffect(() => {
    const unlock = () => {
      if (audioCtxRef.current?.state === "suspended") {
        void audioCtxRef.current.resume().catch(() => {})
      }
      peersRef.current.forEach((bundle) => {
        if (bundle.audioElement.srcObject && bundle.audioElement.paused) {
          void bundle.audioElement.play().catch(() => {})
        }
      })
    }

    window.addEventListener("click", unlock, { passive: true })
    window.addEventListener("touchstart", unlock, { passive: true })
    window.addEventListener("keydown", unlock, { passive: true })

    return () => {
      window.removeEventListener("click", unlock)
      window.removeEventListener("touchstart", unlock)
      window.removeEventListener("keydown", unlock)
    }
  }, [])

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
    selfId: getSocket().id ?? "",
    isMuted,
    speakingWhileMuted,
    pttEnabled,
    remoteStreams,
    speakingPeers,
    peerVolumes,
    callDuration,
    error,
    startCall,
    leaveCall,
    toggleMute,
    togglePtt,
    setPttPressed,
    clearError,
  }
}
