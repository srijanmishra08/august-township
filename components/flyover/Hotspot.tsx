'use client'

import styles from './Flyover.module.css'

interface HotspotProps {
  /** Normalized plan coordinates (0-1). */
  x: number
  y: number
  /** Cover-box size in CSS px — hotspots live in plan space, not screen space. */
  width: number
  height: number
  active: boolean
}

/**
 * A marker pinned to a point on the plan.
 *
 * Constant on-screen size is handled by the `--hs-counter` custom property,
 * which CameraController writes once per frame on the hotspot group. Passing
 * the zoom down as a prop would re-render every marker on every frame.
 */
export default function Hotspot({ x, y, width, height, active }: HotspotProps) {
  return (
    <div
      className={styles.hotspot}
      style={{
        left: x * width,
        top: y * height,
        opacity: active ? 1 : 0,
        transition: 'opacity 0.55s ease',
      }}
    >
      <div className={styles.hotspotInner}>
        <span className={styles.hotspotCore} />
        <span className={styles.hotspotRing} />
        <span className={styles.hotspotRing} />
      </div>
    </div>
  )
}
