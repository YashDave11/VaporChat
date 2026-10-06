import { useEffect, useRef } from "react"

interface AudioWaveformProps {
  isSpeaking: boolean
  isMuted?: boolean
  volume?: number // 0.0 to 1.0 real-time amplitude
  variant?: "equalizer" | "wave"
  className?: string
}

/**
 * Organic Sound-Reactive Audio Visualizer.
 * Supports:
 * - "equalizer": Multi-bar dynamic audio equalizer with harmonic bounce and signal-mint glow.
 * - "wave": Continuous organic sine-wave whisper visualizer.
 * Both react directly to real-time amplitude `volume` (0..1) with lerped physics.
 * Pure canvas, zero storage, optimized 60fps with low CPU footprint.
 */
export function AudioWaveform({
  isSpeaking,
  isMuted = false,
  volume = 0,
  variant = "equalizer",
  className = "",
}: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animRef = useRef<number | null>(null)
  const phaseRef = useRef(0)
  const smoothedVolRef = useRef(0)

  // Keep volume and speaking refs up-to-date for animation loop
  const volRef = useRef(volume)
  volRef.current = volume
  const speakingRef = useRef(isSpeaking)
  speakingRef.current = isSpeaking
  const mutedRef = useRef(isMuted)
  mutedRef.current = isMuted

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let prefersReducedMotion = false
    if (typeof window !== "undefined") {
      prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    }

    const BAR_COUNT = 5
    const barMultipliers = [0.55, 0.85, 1.0, 0.8, 0.5]

    const render = () => {
      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)

      const muted = mutedRef.current
      const speaking = speakingRef.current
      const targetVol = muted ? 0 : speaking ? Math.max(volRef.current, 0.25) : 0.06

      // Lerp smoothed volume for liquid-smooth physics (0.2 factor)
      smoothedVolRef.current += (targetVol - smoothedVolRef.current) * 0.2
      const smVol = smoothedVolRef.current

      if (muted) {
        // Flat dim indicators when muted
        if (variant === "equalizer") {
          const barWidth = 3
          const gap = 3
          const totalWidth = BAR_COUNT * barWidth + (BAR_COUNT - 1) * gap
          const startX = (width - totalWidth) / 2
          ctx.fillStyle = "rgba(135, 142, 154, 0.25)"
          for (let i = 0; i < BAR_COUNT; i++) {
            const x = startX + i * (barWidth + gap)
            ctx.fillRect(x, height / 2 - 1, barWidth, 2)
          }
        } else {
          ctx.strokeStyle = "rgba(135, 142, 154, 0.25)"
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(0, height / 2)
          ctx.lineTo(width, height / 2)
          ctx.stroke()
        }
        return
      }

      if (prefersReducedMotion) {
        // Calm level indicator without continuous oscillation
        const barWidth = 3
        const gap = 3
        const totalWidth = BAR_COUNT * barWidth + (BAR_COUNT - 1) * gap
        const startX = (width - totalWidth) / 2
        ctx.fillStyle = speaking ? "rgba(169, 232, 220, 0.9)" : "rgba(169, 232, 220, 0.3)"
        for (let i = 0; i < BAR_COUNT; i++) {
          const barHeight = speaking ? Math.max(3, height * 0.7 * barMultipliers[i]) : 3
          const x = startX + i * (barWidth + gap)
          const y = (height - barHeight) / 2
          ctx.fillRect(x, y, barWidth, barHeight)
        }
        return
      }

      phaseRef.current += speaking ? 0.16 : 0.05
      const phase = phaseRef.current

      if (variant === "equalizer") {
        // EQUALIZER BARS
        const barWidth = 3
        const gap = 3
        const totalWidth = BAR_COUNT * barWidth + (BAR_COUNT - 1) * gap
        const startX = (width - totalWidth) / 2

        const glow = speaking ? "rgba(169, 232, 220, 0.5)" : "rgba(169, 232, 220, 0.15)"
        ctx.save()
        ctx.shadowColor = glow
        ctx.shadowBlur = speaking ? 8 : 2

        for (let i = 0; i < BAR_COUNT; i++) {
          const harmonic = Math.sin(phase * 1.5 + i * 1.1) * 0.2
          const amp = Math.min(1, Math.max(0.1, smVol * barMultipliers[i] + harmonic * smVol))
          const barHeight = Math.max(2, amp * (height * 0.85))

          const x = startX + i * (barWidth + gap)
          const y = (height - barHeight) / 2

          // Gradient for neon signal aesthetic
          const grad = ctx.createLinearGradient(0, y, 0, y + barHeight)
          if (speaking) {
            grad.addColorStop(0, "rgba(220, 252, 245, 1)")
            grad.addColorStop(1, "rgba(169, 232, 220, 0.85)")
          } else {
            grad.addColorStop(0, "rgba(169, 232, 220, 0.5)")
            grad.addColorStop(1, "rgba(169, 232, 220, 0.25)")
          }

          ctx.fillStyle = grad
          // Rounded bar
          ctx.beginPath()
          const radius = 1.5
          ctx.roundRect ? ctx.roundRect(x, y, barWidth, barHeight, radius) : ctx.rect(x, y, barWidth, barHeight)
          ctx.fill()
        }
        ctx.restore()
      } else {
        // SINE WAVE
        const baseAmplitude = height * (0.08 + smVol * 0.42)
        const strokeColor = speaking ? "rgba(169, 232, 220, 0.95)" : "rgba(169, 232, 220, 0.4)"
        const glowColor = speaking ? "rgba(169, 232, 220, 0.45)" : "rgba(169, 232, 220, 0.1)"

        ctx.save()
        ctx.shadowColor = glowColor
        ctx.shadowBlur = speaking ? 8 : 3
        ctx.strokeStyle = strokeColor
        ctx.lineWidth = speaking ? 2 : 1.2
        ctx.lineCap = "round"
        ctx.beginPath()

        const step = 2
        for (let x = 0; x <= width; x += step) {
          const normX = x / width
          const envelope = Math.sin(normX * Math.PI)
          const wave1 = Math.sin(normX * 12 + phase) * baseAmplitude
          const wave2 = Math.sin(normX * 6 - phase * 0.7) * (baseAmplitude * 0.5)
          const y = height / 2 + (wave1 + wave2) * envelope

          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
        ctx.restore()
      }

      animRef.current = requestAnimationFrame(render)
    }

    render()

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [variant])

  const defaultWidth = variant === "equalizer" ? 36 : 100
  const defaultHeight = 22

  return (
    <canvas
      ref={canvasRef}
      width={defaultWidth}
      height={defaultHeight}
      className={`shrink-0 transition-opacity duration-300 ${className}`}
    />
  )
}
