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

const hasTurn = turnUrls.length > 0

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
  /** perfect-negotiation glare flag: set when we drop an incoming offer */
  ignoreOffer: boolean
  /** senders carrying our screen-share tracks, so stopShare can remove them */
  screenSenders: RTCRtpSender[]
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
  /** live screen-share video streams, keyed by presenter peerId */
  remoteScreens: Map<string, MediaStream>
  /** your own screen-share stream while presenting (local preview), else null */
  localScreenStream: MediaStream | null
  /** true while you are the presenter */
  isSharing: boolean
  /** whether this browser can capture a screen at all (desktop only) */
  shareSupported: boolean
  speakingPeers: Set<string>
  peerVolumes: Map<string, number>
  callDuration: number
  error: string | null
  startCall: () => Promise<void>
  leaveCall: () => void
  toggleMute: () => void
  togglePtt: () => void
  setPttPressed: (pressed: boolean) => void
  startShare: () => Promise<void>
  stopShare: () => void
  clearError: () => void
}

export function useWebRTC(callState: CallState, roomOpen: boolean): WebRTCController {
  const [inCall, setInCall] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [speakingWhileMuted, setSpeakingWhileMuted] = useState(false)
  const [pttEnabled, setPttEnabled] = useState(false)
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [remoteScreens, setRemoteScreens] = useState<Map<string, MediaStream>>(new Map())
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(new Set())
  const [peerVolumes, setPeerVolumes] = useState<Map<string, number>>(new Map())
  const [callDuration, setCallDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const localStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
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
      ignoreOffer: false,
      screenSenders: [],
    }

    // Perfect-negotiation: any track change (mic at join, screen later) fires
    // this. We let setLocalDescription() implicitly make the right offer; glare
    // is resolved on the inbound side via the polite/impolite rule.
    pc.onnegotiationneeded = async () => {
      if (!inCallRef.current) return
      // Only offer from a settled connection. This skips the race where a
      // freshly-created polite peer would fire an offer while it's about to
      // answer the initiator's incoming one. ponytail: deliberate — screen
      // share is a user action on an already-stable call, so nothing to add
      // mid-negotiation gets stranded in practice.
      if (pc.signalingState !== "stable") return
      try {
        bundle.makingOffer = true
        await pc.setLocalDescription()
        if (!pc.localDescription) return
        getSocket().emit("call:signal", {
          to: peerId,
          signal: {
            type: pc.localDescription.type as "offer" | "answer",
            sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
          },
        })
      } catch (err) {
        console.error("[VaporCall] negotiationneeded error:", err)
      } finally {
        bundle.makingOffer = false
      }
    }

    // Attach local audio track if ready, or register transceiver
    const audioTrack = localStreamRef.current?.getAudioTracks()[0]
    if (audioTrack) {
      pc.addTrack(audioTrack, localStreamRef.current!)
    } else {
      pc.addTransceiver("audio", { direction: "sendrecv" })
    }

    // If we're already presenting when this peer connects, send them the
    // screen too so a late joiner isn't staring at nothing.
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => {
        bundle.screenSenders.push(pc.addTrack(t, screenStreamRef.current!))
      })
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

    // Handle incoming remote media tracks: video is a screen share, audio is
    // voice (or a shared tab's audio, which just rides the same element).
    pc.ontrack = (event) => {
      const track = event.track
      console.log(`[VaporCall] ontrack from ${peerId}:`, track.kind)

      if (track.kind === "video") {
        const screenStream = event.streams[0] || new MediaStream([track])
        setRemoteScreens((prev) => {
          const next = new Map(prev)
          next.set(peerId, screenStream)
          return next
        })
        track.onended = () => {
          setRemoteScreens((prev) => {
            const next = new Map(prev)
            next.delete(peerId)
            return next
          })
        }
        return
      }

      // Audio: add every inbound audio track to one stable per-peer stream so
      // a presenter's tab audio can't knock the mic off the element.
      bundle.remoteStream.addTrack(track)
      if (bundle.audioElement.srcObject !== bundle.remoteStream) {
        bundle.audioElement.srcObject = bundle.remoteStream
      }

      const playAudio = () => {
        bundle.audioElement.play().catch((err) => {
          console.warn(`[VaporCall] Audio play waiting for user gesture (${peerId}):`, err)
        })
      }

      playAudio()
      track.onunmute = () => {
        console.log(`[VaporCall] Track unmuted from ${peerId}`)
        playAudio()
      }

      // Clone the first (mic) track for the Web Audio analyser so Chrome
      // doesn't intercept or mute primary playback. attachRemoteAnalyser
      // no-ops if we've already wired this peer, so tab audio won't double it.
      try {
        const clone = track.clone()
        attachRemoteAnalyser(peerId, new MediaStream([clone]))
      } catch (err) {
        console.warn("[VaporCall] Error attaching remote analyser:", err)
      }

      setRemoteStreams((prev) => {
        const updated = new Map(prev)
        updated.set(peerId, bundle.remoteStream)
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
      // A direct path never formed (common across different networks / strict
      // NATs). restartIce() above gets one retry; if it still fails, the only
      // fix is a TURN relay — tell the user instead of leaving them in silence.
      if (pc.connectionState === "failed") {
        setError(
          hasTurn
            ? "Lost the connection to someone in the call. Trying to reconnect…"
            : "Couldn't connect to someone on a different network. A TURN relay is needed for restricted networks — see VITE_TURN_URL in the README."
        )
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
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop())
      screenStreamRef.current = null
    }
    if (analyserTrackRef.current) {
      analyserTrackRef.current.stop()
      analyserTrackRef.current = null
    }

    setRemoteStreams(new Map())
    setRemoteScreens(new Map())
    setLocalScreenStream(null)
    setIsSharing(false)
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

  // ---- screen share ----

  const stopShare = useCallback(() => {
    peersRef.current.forEach((bundle) => {
      bundle.screenSenders.forEach((sender) => {
        try {
          bundle.pc.removeTrack(sender) // fires onnegotiationneeded → renegotiate
        } catch {
          // sender already gone (peer closed) — ignore
        }
      })
      bundle.screenSenders = []
    })
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop())
      screenStreamRef.current = null
    }
    setLocalScreenStream(null)
    setIsSharing(false)
    getSocket().emit("call:state_update", { sharing: false })
  }, [])

  const startShare = useCallback(async () => {
    if (!inCallRef.current) return
    const md = navigator.mediaDevices
    if (!md?.getDisplayMedia) {
      setError("Screen sharing isn't supported on this browser.")
      return
    }
    try {
      const stream = await md.getDisplayMedia({ video: true, audio: true })
      screenStreamRef.current = stream
      setLocalScreenStream(stream)
      setIsSharing(true)

      // Browser's own "Stop sharing" bar ends the track — mirror it to our UI
      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack) videoTrack.onended = () => stopShare()

      // Push the screen onto every existing connection; each addTrack triggers
      // onnegotiationneeded, so the renegotiation offers go out on their own.
      peersRef.current.forEach((bundle) => {
        stream.getTracks().forEach((t) => {
          bundle.screenSenders.push(bundle.pc.addTrack(t, stream))
        })
      })

      getSocket().emit("call:state_update", { sharing: true })
    } catch (err) {
      // Cancelling the OS picker throws NotAllowedError — that's not a failure
      screenStreamRef.current = null
      setLocalScreenStream(null)
      setIsSharing(false)
      if ((err as Error)?.name !== "NotAllowedError") {
        setError("Couldn't start screen sharing.")
      }
    }
  }, [stopShare])

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
      // Impolite peer (the deterministic initiator, lower id) wins glare;
      // the polite peer rolls back. setRemoteDescription(offer) in have-local-
      // offer state triggers the implicit rollback for us.
      const myId = socket.id ?? ""
      const polite = myId > from

      try {
        if (signal.type === "offer" || signal.type === "answer") {
          const desc = signal.sdp as RTCSessionDescriptionInit
          const offerCollision =
            signal.type === "offer" &&
            (bundle.makingOffer || pc.signalingState !== "stable")

          bundle.ignoreOffer = !polite && offerCollision
          if (bundle.ignoreOffer) return

          await pc.setRemoteDescription(new RTCSessionDescription(desc))

          // Flush any candidates that arrived before we had a remote description
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

          if (signal.type === "offer") {
            await pc.setLocalDescription()
            if (pc.localDescription) {
              socket.emit("call:signal", {
                to: from,
                signal: {
                  type: "answer",
                  sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
                },
              })
            }
          }
        } else if (signal.type === "candidate") {
          const cand = signal.candidate as RTCIceCandidateInit
          if (!cand || !cand.candidate) return
          if (pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand))
            } catch (err) {
              if (!bundle.ignoreOffer) console.warn("[VaporCall] Candidate error:", err)
            }
          } else {
            bundle.pendingCandidates.push(cand)
          }
        }
      } catch (err) {
        console.error("[VaporCall] Error handling signal:", err)
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

    // Create a connection to any new member we're the initiator for (lower id).
    // Adding our mic track fires onnegotiationneeded, which sends the offer —
    // the higher-id peer creates its side lazily when that offer arrives.
    callState.members.forEach((member) => {
      if (member.peerId === myId) return
      if (!peersRef.current.has(member.peerId) && myId < member.peerId) {
        console.log(`[VaporCall] Initiating connection to ${member.peerId}`)
        createPeerConnection(member.peerId)
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
        setRemoteScreens((prev) => {
          if (!prev.has(peerId)) return prev
          const next = new Map(prev)
          next.delete(peerId)
          return next
        })
      }
    })
  }, [callState.members, inCall, createPeerConnection])

  // If someone else won the presenter slot while we were also trying to share,
  // the server silently denied our claim — roll our local share back so we
  // don't keep a dead screen feed flowing on the mesh.
  useEffect(() => {
    if (!isSharing) return
    const myId = getSocket().id
    const presenter = callState.members.find((m) => m.sharing)
    if (presenter && presenter.peerId !== myId) stopShare()
  }, [callState.members, isSharing, stopShare])

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
    remoteScreens,
    localScreenStream,
    isSharing,
    shareSupported:
      typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia,
    speakingPeers,
    peerVolumes,
    callDuration,
    error,
    startCall,
    leaveCall,
    toggleMute,
    togglePtt,
    setPttPressed,
    startShare,
    stopShare,
    clearError,
  }
}
