'use client'

import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import type { CameraState, FlyoverConfig, FlyoverWaypoint } from '@/lib/types/flyover'
import { clampCamera, coverBox, layerTransform, type Viewport } from '@/lib/flyover'
import AmbientLayer from './AmbientLayer'
import Hotspot from './Hotspot'
import styles from './Flyover.module.css'

export interface CameraHandle {
  /** Write a camera state straight to the DOM. Called from the GSAP ticker. */
  apply: (cam: CameraState) => void
  /** Last clamped camera. Used by the ?wp coordinate picker. */
  getCam: () => CameraState | null
}

interface CameraControllerProps {
  config: FlyoverConfig
  viewport: Viewport
  planUrl: string
  planSources?: { avif?: string; webp?: string }
  hotspots: FlyoverWaypoint[]
  activeHotspotId: string | null
}

/**
 * Renders the parallax layer stack and applies the virtual camera to it.
 *
 * Every per-frame write happens here, imperatively. React state is never
 * touched during a scrub — at 120 Hz a setState per frame would drop frames
 * long before the transforms did.
 */
const CameraController = forwardRef<CameraHandle, CameraControllerProps>(
  function CameraController(
    { config, viewport, planUrl, planSources, hotspots, activeHotspotId },
    ref,
  ) {
    const layerRefs = useRef<Array<HTMLDivElement | null>>([])
    const hotspotGroupRef = useRef<HTMLDivElement>(null)
    const lastCamRef = useRef<CameraState | null>(null)

    const box = useMemo(
      () => coverBox(viewport, config.planPixelSize),
      [viewport, config.planPixelSize],
    )

    useImperativeHandle(
      ref,
      () => ({
        getCam: () => lastCamRef.current,
        apply(raw: CameraState) {
          const cam = clampCamera(raw, viewport, box, config.maxUpscale)
          lastCamRef.current = cam

          config.layers.forEach((layer, i) => {
            const node = layerRefs.current[i]
            if (!node || layer.depth === 0) return
            node.style.transform = layerTransform(cam, layer.depth, viewport, box)
          })

          const group = hotspotGroupRef.current
          if (group) {
            group.style.transform = layerTransform(cam, 1, viewport, box)
            // Cancel the zoom so markers hold their on-screen size.
            group.style.setProperty('--hs-counter', String(1 / Math.max(cam.zoom, 0.001)))
          }
        },
      }),
      [config.layers, config.maxUpscale, viewport, box],
    )

    return (
      <>
        {config.layers.map((layer, i) => {
          // Depth 0 means "locked to the viewport" — no camera transform, and
          // it fills the screen rather than the (larger) plan cover box.
          if (layer.depth === 0) {
            return (
              <div key={layer.id} className={styles.fixedLayer}>
                <AmbientLayer
                  layer={layer}
                  width={viewport.width}
                  height={viewport.height}
                  planUrl={planUrl}
                  planSources={planSources}
                />
              </div>
            )
          }

          return (
            <div
              key={layer.id}
              ref={(el) => {
                layerRefs.current[i] = el
              }}
              className={styles.layer}
              style={{ width: box.width, height: box.height }}
            >
              <AmbientLayer
                layer={layer}
                width={box.width}
                height={box.height}
                planUrl={planUrl}
                planSources={planSources}
              />
            </div>
          )
        })}

        {/* Hotspots ride the plan exactly, so they sit in their own depth-1 group. */}
        <div
          ref={hotspotGroupRef}
          className={styles.layer}
          style={{ width: box.width, height: box.height, zIndex: 15 }}
        >
          {hotspots.map((wp) => (
            <Hotspot
              key={wp.id}
              x={wp.x}
              y={wp.y}
              width={box.width}
              height={box.height}
              active={activeHotspotId === wp.id}
            />
          ))}
        </div>

        {/* Grain sits above the plan but below the UI — it masks the softness a
            low-resolution plan shows once the camera pushes past ~2×. */}
        <div className={styles.grain} />
      </>
    )
  },
)

export default CameraController
