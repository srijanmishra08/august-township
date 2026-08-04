import type {
  CameraState,
  FlyoverConfig,
  FlyoverWaypoint,
  WaypointRange,
} from '@/lib/types/flyover'

export interface Viewport {
  width: number
  height: number
}

/**
 * The plan is laid out as a "cover box" — the rendered size at which the image
 * exactly covers the viewport at zoom 1. Normalized waypoint coordinates are
 * multiplied by this box, which is what makes a waypoint frame the same part
 * of the plan on any aspect ratio.
 */
export interface CoverBox {
  width: number
  height: number
  /** Rendered px per source px at zoom 1. */
  scale: number
}

export function coverBox(vp: Viewport, plan: { width: number; height: number }): CoverBox {
  const scale = Math.max(vp.width / plan.width, vp.height / plan.height)
  return { width: plan.width * scale, height: plan.height * scale, scale }
}

/**
 * Highest zoom the source can carry before it visibly falls apart.
 *
 * At zoom `s` the plan is drawn at `coverScale * s` rendered pixels per source
 * pixel. Past `maxUpscale` there is simply no more information in the file, so
 * we stop rather than serve mush.
 */
export function maxZoom(box: CoverBox, maxUpscale = 2.6): number {
  return Math.max(1, maxUpscale / box.scale)
}

/**
 * Keep the plan covering the viewport.
 *
 * A rotated viewport needs a larger axis-aligned footprint than an upright one,
 * so the half-extents are computed from the rotated rectangle's bounding box —
 * otherwise a 2° tilt lets the background show through at the corners.
 */
export function clampCamera(
  cam: CameraState,
  vp: Viewport,
  box: CoverBox,
  maxUpscale = 2.6,
): CameraState {
  const zoom = Math.min(Math.max(cam.zoom, 1), maxZoom(box, maxUpscale))
  const rad = (cam.rotation * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))

  const halfW = (vp.width * cos + vp.height * sin) / 2 / zoom
  const halfH = (vp.width * sin + vp.height * cos) / 2 / zoom

  const marginX = halfW / box.width
  const marginY = halfH / box.height

  // When the viewport is wider than the scaled plan there is no valid range —
  // centring is the only non-gapping answer.
  const x = marginX * 2 >= 1 ? 0.5 : Math.min(Math.max(cam.x, marginX), 1 - marginX)
  const y = marginY * 2 >= 1 ? 0.5 : Math.min(Math.max(cam.y, marginY), 1 - marginY)

  return { x, y, zoom, rotation: cam.rotation }
}

/**
 * CSS transform placing normalized plan point (cam.x, cam.y) at the viewport
 * centre, at the given zoom and rotation.
 *
 * `depth` is the parallax weight: 1 tracks the plan exactly, below 1 lags
 * behind (further away), above 1 leads (nearer the viewer). Applied to offset,
 * zoom and rotation together so a layer reads as a coherent plane rather than
 * a sliding sprite.
 *
 * Assumes `transform-origin: 0 0` on the target element.
 */
export function layerTransform(
  cam: CameraState,
  depth: number,
  vp: Viewport,
  box: CoverBox,
): string {
  const x = 0.5 + (cam.x - 0.5) * depth
  const y = 0.5 + (cam.y - 0.5) * depth
  const zoom = 1 + (cam.zoom - 1) * depth
  const rotation = cam.rotation * depth

  const px = (x * box.width).toFixed(3)
  const py = (y * box.height).toFixed(3)

  return (
    `translate3d(${(vp.width / 2).toFixed(3)}px, ${(vp.height / 2).toFixed(3)}px, 0) ` +
    `rotate(${rotation.toFixed(4)}deg) ` +
    `scale(${zoom.toFixed(5)}) ` +
    `translate3d(${-Number(px)}px, ${-Number(py)}px, 0)`
  )
}

/**
 * Lay the waypoints out on a single 0-1 timeline.
 *
 * Each waypoint owns a travel leg (`duration`) and an optional stationary
 * `hold`. Holds are what let the camera settle so a video can play without the
 * plan sliding underneath it.
 */
export function buildRanges(waypoints: FlyoverWaypoint[]): WaypointRange[] {
  const total = waypoints.reduce((sum, w) => sum + (w.duration || 0) + (w.hold || 0), 0)
  if (total <= 0) {
    return waypoints.map((waypoint, index) => ({
      waypoint,
      index,
      travelStart: 0,
      arrive: 0,
      depart: 1,
    }))
  }

  let cursor = 0
  return waypoints.map((waypoint, index) => {
    const travelStart = cursor / total
    cursor += waypoint.duration || 0
    const arrive = cursor / total
    cursor += waypoint.hold || 0
    const depart = cursor / total
    return { waypoint, index, travelStart, arrive, depart }
  })
}

/** Total scroll distance in pixels for the whole timeline. */
export function timelineScrollLength(
  waypoints: FlyoverWaypoint[],
  viewportHeight: number,
  scrollPerUnit = 0.9,
): number {
  const units = waypoints.reduce((sum, w) => sum + (w.duration || 0) + (w.hold || 0), 0)
  return Math.max(viewportHeight, units * viewportHeight * scrollPerUnit)
}

/**
 * Which waypoint the playhead is in, and how far through its hold we are.
 * `holdProgress` drives panel and video reveals; it is 0 while travelling.
 */
export function activeAt(ranges: WaypointRange[], progress: number) {
  let active = ranges[0]
  for (const r of ranges) {
    if (progress >= r.travelStart) active = r
    else break
  }
  const holdSpan = active.depart - active.arrive
  const holdProgress =
    holdSpan <= 0 ? (progress >= active.arrive ? 1 : 0)
      : Math.min(Math.max((progress - active.arrive) / holdSpan, 0), 1)
  return { range: active, holdProgress, settled: progress >= active.arrive }
}

/** Resolve a project-relative asset path to a public URL. */
export function assetUrl(projectSlug: string, relative: string): string {
  return `/data/projects/${projectSlug}/${relative.replace(/^\/+/, '')}`
}

export function parseRects(spec: unknown): Array<[number, number, number, number]> {
  if (typeof spec !== 'string' || !spec.trim()) return []
  return spec
    .split(';')
    .map((chunk) => chunk.split(',').map(Number))
    .filter((n) => n.length === 4 && n.every((v) => Number.isFinite(v)))
    .map((n) => [n[0], n[1], n[2], n[3]] as [number, number, number, number])
}

export type { FlyoverConfig }
