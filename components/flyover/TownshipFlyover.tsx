'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AmenityDef } from '@/lib/types/project'
import type { FlyoverConfig } from '@/lib/types/flyover'
import {
  activeAt,
  assetUrl,
  buildRanges,
  coverBox,
  maxZoom,
  timelineScrollLength,
  type Viewport,
} from '@/lib/flyover'
import CameraController, { type CameraHandle } from './CameraController'
import WaypointManager, { type WaypointHandle } from './WaypointManager'
import useTimelineController from './TimelineController'
import styles from './Flyover.module.css'

interface TownshipFlyoverProps {
  config: FlyoverConfig
  amenities: AmenityDef[]
  projectSlug: string
  /** Handoff into the interactive 3D plot explorer. */
  onExit: () => void
}

export default function TownshipFlyover({
  config,
  amenities,
  projectSlug,
  onExit,
}: TownshipFlyoverProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const cameraRef = useRef<CameraHandle>(null)
  const waypointRef = useRef<WaypointHandle>(null)

  const [viewport, setViewport] = useState<Viewport | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    function measure() {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [])

  const ranges = useMemo(() => buildRanges(config.waypoints), [config.waypoints])

  const amenityMap = useMemo(
    () => Object.fromEntries(amenities.map((a) => [a.id, a])) as Record<string, AmenityDef>,
    [amenities],
  )

  const hotspots = useMemo(
    () => config.waypoints.filter((w) => w.hotspot),
    [config.waypoints],
  )

  const scrollHeight = viewport
    ? timelineScrollLength(config.waypoints, viewport.height, config.scrollPerUnit) +
      viewport.height
    : 0

  // Kept in a ref because it is read on every tick but must not trigger renders.
  const activeIndexRef = useRef(0)

  const handleProgress = useCallback(
    (progress: number) => {
      const { range, holdProgress, settled } = activeAt(ranges, progress)
      if (range.index !== activeIndexRef.current) {
        activeIndexRef.current = range.index
        setActiveIndex(range.index)
      }
      waypointRef.current?.update(holdProgress, settled)
    },
    [ranges],
  )

  useTimelineController({
    config,
    containerRef,
    cameraRef,
    onProgress: handleProgress,
    viewportKey: viewport ? `${viewport.width}x${viewport.height}` : 'unmeasured',
    enabled: Boolean(viewport),
  })

  // Warn once when the configured zooms exceed what the source can resolve.
  useEffect(() => {
    if (!viewport || process.env.NODE_ENV === 'production') return
    const box = coverBox(viewport, config.planPixelSize)
    const cap = maxZoom(box, config.maxUpscale)
    const over = config.waypoints.filter((w) => w.zoom > cap + 0.001)
    if (over.length > 0) {
      console.warn(
        `[flyover] ${over.length} waypoint(s) request more zoom than the ${config.planPixelSize.width}×` +
          `${config.planPixelSize.height} plan can resolve at this viewport — clamped to ${cap.toFixed(2)}: ` +
          over.map((w) => `${w.id} (${w.zoom})`).join(', ') +
          '. Supply a higher-resolution masterplan to lift the ceiling.',
      )
    }
  }, [viewport, config])

  // ?wp — click anywhere to read off normalized plan coordinates for tuning.
  useEffect(() => {
    if (!viewport) return
    if (!new URLSearchParams(window.location.search).has('wp')) return
    const stage = stageRef.current
    if (!stage) return

    const box = coverBox(viewport, config.planPixelSize)

    function onClick(e: MouseEvent) {
      const cam = cameraRef.current?.getCam()
      if (!cam) return
      const dx = e.clientX - viewport!.width / 2
      const dy = e.clientY - viewport!.height / 2
      const rad = (-cam.rotation * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      const ux = (dx * cos - dy * sin) / cam.zoom
      const uy = (dx * sin + dy * cos) / cam.zoom
      const nx = (cam.x * box.width + ux) / box.width
      const ny = (cam.y * box.height + uy) / box.height
      const text = `"x": ${nx.toFixed(3)}, "y": ${ny.toFixed(3)}`
      navigator.clipboard?.writeText(text).catch(() => {})
      console.info(`[flyover:wp] ${text}  (copied)`)
    }

    stage.addEventListener('click', onClick)
    return () => stage.removeEventListener('click', onClick)
  }, [viewport, config.planPixelSize])

  const planUrl = assetUrl(projectSlug, config.planImage)
  const planSources = useMemo(
    () => ({
      avif: config.planSources?.avif ? assetUrl(projectSlug, config.planSources.avif) : undefined,
      webp: config.planSources?.webp ? assetUrl(projectSlug, config.planSources.webp) : undefined,
    }),
    [config.planSources, projectSlug],
  )

  return (
    <div ref={containerRef} className={styles.root} style={{ height: scrollHeight || '100svh' }}>
      <div ref={stageRef} className={styles.viewport}>
        {viewport && (
          <>
            <CameraController
              ref={cameraRef}
              config={config}
              viewport={viewport}
              planUrl={planUrl}
              planSources={planSources}
              hotspots={hotspots}
              activeHotspotId={ranges[activeIndex]?.waypoint.id ?? null}
            />
            <WaypointManager
              ref={waypointRef}
              ranges={ranges}
              activeIndex={activeIndex}
              amenities={amenityMap}
              projectSlug={projectSlug}
              onExit={onExit}
            />
          </>
        )}

        <button type="button" className={styles.skip} onClick={onExit}>
          Skip to 3D
        </button>
      </div>
    </div>
  )
}
