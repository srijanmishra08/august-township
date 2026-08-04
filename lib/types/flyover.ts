/**
 * Types for the scroll-driven masterplan flyover.
 *
 * Everything the camera does is described by data in `flyover.json` — no
 * coordinates or timings live in component code, so the experience can be
 * retuned without a rebuild.
 */

/** A GSAP ease string, e.g. "power3.inOut". */
export type EaseName = string

export interface FlyoverWaypoint {
  id: string
  /** Short label for the progress rail. */
  label: string
  /**
   * Camera target in normalized plan-image space: 0-1 on each axis with the
   * origin at the image's top-left. Normalized (rather than pixel) coords are
   * what keep the same waypoint framing correct across aspect ratios.
   */
  x: number
  y: number
  /** 1 = plan exactly covers the viewport. Clamped to source resolution. */
  zoom: number
  /** Degrees. Deliberately tiny — beyond ~2.5 it reads as a tilted photo. */
  rotation: number
  /** Relative length of the travel leg *into* this waypoint. Unitless. */
  duration: number
  ease: EaseName
  /** Extra scroll held at this waypoint with the camera still. */
  hold?: number
  /** Links to an entry in amenities.json for copy + video. */
  amenityId?: string
  /** Used when there is no matching amenity (or to override its copy). */
  title?: string
  description?: string
  /** Render a pulsing marker pinned to this point on the plan. */
  hotspot?: boolean
  /** Fade in and autoplay the amenity video during this waypoint's hold. */
  showVideo?: boolean
  /** Terminal waypoint — reaching it offers the handoff into the 3D explorer. */
  isExit?: boolean
}

export type LayerKind = 'image' | 'clouds' | 'particles' | 'water' | 'grade'

export interface FlyoverLayer {
  id: string
  kind: LayerKind
  /** Only for kind: 'image'. Path relative to the project asset root. */
  src?: string
  /**
   * Parallax depth. 1 = moves exactly with the plan. <1 lags behind (reads as
   * further away), >1 leads (reads as closer to the viewer than the plan).
   */
  depth: number
  opacity?: number
  blendMode?: string
  /** Layer-specific knobs (particle count, drift speed, tint…). */
  options?: Record<string, number | string>
}

export interface FlyoverConfig {
  /** Fallback plan image, relative to the project asset root. */
  planImage: string
  /** Modern encodes offered ahead of planImage via <picture>. */
  planSources?: { avif?: string; webp?: string }
  /**
   * Native pixel dimensions of the plan. Used to clamp zoom so the camera
   * never pushes past what the source can actually resolve.
   */
  planPixelSize: { width: number; height: number }
  /**
   * How far the plan may be upscaled past 1 source pixel per CSS pixel before
   * zoom is capped. 2 keeps line-work acceptably crisp on a CAD-style plan.
   */
  maxUpscale?: number
  /** Scroll distance, in viewport heights, per unit of waypoint duration. */
  scrollPerUnit?: number
  waypoints: FlyoverWaypoint[]
  layers: FlyoverLayer[]
}

/** Live camera state, mutated in place by the GSAP timeline. */
export interface CameraState {
  x: number
  y: number
  zoom: number
  rotation: number
}

/** Scroll-progress window a waypoint occupies on the master timeline. */
export interface WaypointRange {
  waypoint: FlyoverWaypoint
  index: number
  /** Progress at which travel toward this waypoint begins. */
  travelStart: number
  /** Progress at which the camera arrives (and any hold begins). */
  arrive: number
  /** Progress at which the hold ends and the next leg starts. */
  depart: number
}
