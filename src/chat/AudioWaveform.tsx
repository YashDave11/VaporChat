import { useEffect, useRef } from "react"

interface AudioWaveformProps {
  isSpeaking: boolean
  isMuted?: boolean
  className?: string
}

/**
 * Organic "Whisper Wave" audio visualizer.
 * Renders a soothing, breathing waveform in signal-mint that dynamically
 * reacts when the speaker talks, falling back to a subtle ambient drift.
 * Pure canvas, zero storage, high performance 60fps with low CPU load.
 */
export function AudioWaveform({
  isSpeaking,
  isMuted = false,
  className = "",
}: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animRef = useRef<number | null>(null)
  const phaseRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let prefersReducedMotion = false
    if (typeof window !== "undefined") {
      prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    }

    const render = () => {
      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)

      if (isMuted) {
        // Flat dim line when muted
        ctx.strokeStyle = "rgba(135, 142, 154, 0.3)" // fog dim
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(0, height / 2)
        ctx.lineTo(width, height / 2)
        ctx.stroke()
        return
      }

      if (prefersReducedMotion) {
        // Calm level indicator without oscillation
        ctx.strokeStyle = isSpeaking ? "rgba(169, 232, 220, 0.9)" : "rgba(169, 232, 220, 0.35)"
        ctx.lineWidth = isSpeaking ? 2 : 1
        ctx.beginPath()
        ctx.moveTo(0, height / 2)
        ctx.lineTo(width, height / 2)
        ctx.stroke()
        return
      }

      phaseRef.current += isSpeaking ? 0.15 : 0.04
      const phase = phaseRef.current

      const baseAmplitude = isSpeaking ? height * 0.38 : height * 0.12
      const strokeColor = isSpeaking ? "rgba(169, 232, 220, 0.95)" : "rgba(169, 232, 220, 0.45)"
      const glowColor = isSpeaking ? "rgba(169, 232, 220, 0.4)" : "rgba(169, 232, 220, 0.1)"

      // Outer soft glow pass
      ctx.save()
      ctx.shadowColor = glowColor
      ctx.shadowBlur = isSpeaking ? 8 : 3
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = isSpeaking ? 2 : 1.2
      ctx.lineCap = "round"
      ctx.beginPath()

      const step = 2
      for (let x = 0; x <= width; x += step) {
        const normX = x / width
        // Envelope: taper at edges (sin window 0 -> 1 -> 0)
        const envelope = Math.sin(normX * Math.PI)
        const wave1 = Math.sin(normX * 12 + phase) * baseAmplitude
        const wave2 = Math.sin(normX * 6 - phase * 0.7) * (baseAmplitude * 0.5)
        const y = height / 2 + (wave1 + wave2) * envelope

        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.restore()

      animRef.current = requestAnimationFrame(render)
    }

    render()

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [isSpeaking, isMuted])

  return (
    <canvas
      ref={canvasRef}
      width={120}
      height={24}
      className={`h-5 w-24 shrink-0 transition-opacity duration-300 ${className}`}
    />
  )
}
