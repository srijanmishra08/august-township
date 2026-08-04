'use client'

import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import type { AmenityDef } from '@/lib/types/project'
import type { WaypointRange } from '@/lib/types/flyover'
import { assetUrl } from '@/lib/flyover'
import AmenityVideo from './AmenityVideo'
import styles from './Flyover.module.css'

export interface WaypointHandle {
  /** Called every scrub tick with how far through the active hold we are. */
  update: (holdProgress: number, settled: boolean) => void
}

interface WaypointManagerProps {
  ranges: WaypointRange[]
  activeIndex: number
  amenities: Record<string, AmenityDef>
  projectSlug: string
  onExit: () => void
}

/** Smooth 0→1 ramp between two thresholds. */
function ramp(v: number, from: number, to: number): number {
  if (to <= from) return v >= to ? 1 : 0
  const t = Math.min(Math.max((v - from) / (to - from), 0), 1)
  return t * t * (3 - 2 * t)
}

/**
 * Owns everything overlaid on the camera: the copy panel, the amenity video,
 * the progress rail and the exit handoff.
 *
 * Continuous values (opacity, offset) are written straight to the DOM through
 * `update`. Only things that genuinely change identity — which waypoint is
 * active, whether a clip should be playing — go through React state.
 */
const WaypointManager = forwardRef<WaypointHandle, WaypointManagerProps>(
  function WaypointManager({ ranges, activeIndex, amenities, projectSlug, onExit }, ref) {
    const panelRef = useRef<HTMLDivElement>(null)
    const videoRef = useRef<HTMLDivElement>(null)
    const exitRef = useRef<HTMLButtonElement>(null)
    const cueRef = useRef<HTMLDivElement>(null)
    const [playing, setPlaying] = useState(false)

    const active = ranges[activeIndex]?.waypoint
    const amenity = active?.amenityId ? amenities[active.amenityId] : undefined

    const title = active?.title ?? amenity?.name ?? ''
    const description = active?.description ?? amenity?.description ?? ''

    const videoSrc =
      active?.showVideo && amenity?.videoPath
        ? assetUrl(projectSlug, amenity.videoPath)
        : null

    useImperativeHandle(
      ref,
      () => ({
        update(holdProgress: number, settled: boolean) {
          const settleAmount = settled ? holdProgress : 0

          // Copy fades in as the camera arrives and out as it prepares to leave.
          // The exit stop keeps its copy up, since nothing follows it.
          const isExit = Boolean(active?.isExit)
          const copyIn = ramp(settleAmount, 0, 0.2)
          const copyOut = isExit ? 0 : ramp(settleAmount, 0.86, 1)
          const copyOpacity = Math.max(0, copyIn - copyOut)

          if (panelRef.current) {
            panelRef.current.style.opacity = String(copyOpacity)
            panelRef.current.style.transform = `translateY(${((1 - copyIn) * 18).toFixed(2)}px)`
          }

          // Video trails the copy slightly so the two don't arrive together.
          const vIn = ramp(settleAmount, 0.1, 0.36)
          const vOut = ramp(settleAmount, 0.9, 1)
          const vOpacity = Math.max(0, vIn - vOut)

          if (videoRef.current) {
            const hidden = vOpacity <= 0.01
            videoRef.current.style.opacity = String(vOpacity)
            videoRef.current.style.visibility = hidden ? 'hidden' : 'visible'
            videoRef.current.style.transform =
              `translateY(-50%) scale(${(0.962 + 0.038 * vOpacity).toFixed(4)})`
          }

          // React bails out when the value is unchanged, so this is effectively
          // free on the frames where nothing crosses the threshold.
          setPlaying(vOpacity > 0.25)

          if (exitRef.current) {
            const e = isExit ? ramp(settleAmount, 0.15, 0.55) : 0
            exitRef.current.style.opacity = String(e)
            exitRef.current.style.pointerEvents = e > 0.6 ? 'auto' : 'none'
          }

          if (cueRef.current) {
            // Only on the opening stop, and only until the user starts moving.
            const c = activeIndex === 0 ? 1 - ramp(settleAmount, 0.1, 0.5) : 0
            cueRef.current.style.opacity = String(c)
          }
        },
      }),
      [active?.isExit, activeIndex],
    )

    return (
      <>
        <div className={styles.rail} aria-hidden>
          {ranges.map((r, i) => (
            <div
              key={r.waypoint.id}
              className={`${styles.railItem} ${i === activeIndex ? styles.railItemActive : ''}`}
            >
              <span className={styles.railDot} />
              <span className={styles.railLabel}>{r.waypoint.label}</span>
            </div>
          ))}
        </div>

        <div ref={panelRef} className={styles.panel} style={{ opacity: 0 }}>
          <p className={styles.panelIndex}>
            {String(activeIndex + 1).padStart(2, '0')} / {String(ranges.length).padStart(2, '0')}
          </p>
          <div className={styles.panelRule} />
          <h2 className={styles.panelTitle}>{title}</h2>
          {description && <p className={styles.panelBody}>{description}</p>}
        </div>

        {videoSrc && (
          <AmenityVideo
            ref={videoRef}
            /* Keying on the waypoint forces a fresh element per stop, so a
               clip never inherits the previous one's buffered position. */
            key={active?.id}
            src={videoSrc}
            label={amenity?.name ?? title}
            playing={playing}
          />
        )}

        <div ref={cueRef} className={styles.cue} aria-hidden>
          Scroll to explore
        </div>

        <button
          ref={exitRef}
          type="button"
          className={styles.exitButton}
          style={{ opacity: 0, pointerEvents: 'none' }}
          onClick={onExit}
        >
          Enter the 3D Township
        </button>
      </>
    )
  },
)

export default WaypointManager
