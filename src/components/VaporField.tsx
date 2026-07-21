import { memo } from "react"

/**
 * How strongly the atmosphere leans into the frame:
 *
 *   cinematic  — gate / ended: full presence in the empty flanks
 *   heightened — matching: same presence, but the edges breathe
 *   quiet      — rooms: the field recedes so the conversation owns the screen
 */
export type VaporIntensity = "cinematic" | "heightened" | "quiet"

/**
 * VaporField — the product's ambient layer, distinct from the landing hero's
 * FogBackground. Three planes deep:
 *
 *   far  — two blurred columns of blue haze leaning in from the frame edges,
 *          each with a signal-tinted wisp drifting inside
 *   mid  — vapor sheets: thin, slightly rotated translucent strips with a
 *          faceted crease and a hairline signal seam — folded paper-thin
 *          light, dissolving into air at both ends
 *   near — filaments: 1px signal threads adrift by the flanks
 *
 * All motion is CSS keyframes on transform/opacity (see index.css, "vapor
 * field" / "vapor sheets"), so React never drives a frame: changing
 * `intensity` flips one data attribute and every layer crossfades on its own.
 */
export const VaporField = memo(function VaporField({
  intensity,
}: {
  intensity: VaporIntensity
}) {
  return (
    <div aria-hidden="true" className="vapor-field" data-vapor={intensity}>
      <div className="vapor-base" />
      <div className="vapor-edge vapor-edge-l" />
      <div className="vapor-edge vapor-edge-r" />
      <div className="vapor-wisp vapor-wisp-l" />
      <div className="vapor-wisp vapor-wisp-r" />
      <div className="vapor-sheet vapor-sheet-l1" />
      <div className="vapor-sheet vapor-sheet-l2" />
      <div className="vapor-sheet vapor-sheet-r1" />
      <div className="vapor-sheet vapor-sheet-r2" />
      <div className="vapor-filament vapor-filament-l" />
      <div className="vapor-filament vapor-filament-r" />
    </div>
  )
})
