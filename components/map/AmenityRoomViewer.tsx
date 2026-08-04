'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Amenity3D } from '@/lib/types/plot3d'
import s from './AmenityRoomViewer.module.css'

/**
 * Seconds of footage traversed per pixel of horizontal drag. The walkthrough
 * clips run ~7s, so this puts a full 360 of the room at roughly 780px of drag —
 * one comfortable sweep across the frame.
 */
const SECONDS_PER_PIXEL = 0.009
/** Per-frame velocity decay once the pointer is released. */
const FRICTION = 0.88
/** A frame at 60fps, used to normalise pointer deltas into per-frame velocity. */
const FRAME_MS = 1000 / 60
/**
 * Hard cap on glide speed. Total coast distance is velocity/(1-FRICTION), so
 * this bounds a flick to roughly half a second of footage no matter how fast
 * the user throws it.
 */
const MAX_VELOCITY = 0.06
/** Below this (seconds/frame) the glide is imperceptible, so stop advancing. */
const MIN_VELOCITY = 0.0004
/** Don't re-seek for sub-frame differences. */
const SEEK_EPSILON = 0.001
/**
 * If the pointer sat still longer than this before release, the user is
 * placing the view rather than flicking it — release with no glide.
 */
const STALE_FLICK_MS = 90

interface AmenityRoomViewerProps {
  amenity: Amenity3D
  videoSrc: string
  onClose: () => void
}

/**
 * Turns a linear walkthrough clip into a scrubbable "room" — horizontal drag
 * maps to playback position, wrapping at both ends so the space feels like a
 * continuous 360 rather than a video with a start and an end.
 *
 * Position is driven by one persistent rAF loop rather than by seek events.
 * The media spec lets a `currentTime` assignment complete without ever firing
 * `seeked` (empty seekable range, readyState drop, aborted seek), so any
 * latch waiting on that event can wedge permanently. Polling the element's own
 * `video.seeking` flag instead is self-healing: it always clears itself.
 */
export default function AmenityRoomViewer({ amenity, videoSrc, onClose }: AmenityRoomViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)

  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [hinted, setHinted] = useState(false)

  // Scrub state lives in refs — it updates per frame and must not re-render.
  const targetTime = useRef(0)
  const velocity = useRef(0)
  const lastX = useRef(0)
  const pointerId = useRef<number | null>(null)
  const draggingRef = useRef(false)
  const lastMoveAt = useRef(0)

  /**
   * Wrap into [0, duration). When duration is not yet known the position is
   * passed through untouched — collapsing to 0 here would silently pin the
   * room to its first frame with no visible failure.
   */
  const wrap = useCallback((t: number) => {
    const d = videoRef.current?.duration
    if (!d || !isFinite(d) || d <= 0) return t
    return ((t % d) + d) % d
  }, [])

  // One loop for the lifetime of the viewer: decays inertia, then reconciles
  // the element toward the target whenever it is idle enough to accept a seek.
  useEffect(() => {
    let frame = 0
    const step = () => {
      frame = requestAnimationFrame(step)
      const video = videoRef.current
      if (!video) return

      if (!draggingRef.current && Math.abs(velocity.current) >= MIN_VELOCITY) {
        targetTime.current = wrap(targetTime.current + velocity.current)
        velocity.current *= FRICTION
      } else if (!draggingRef.current) {
        velocity.current = 0
      }

      // HAVE_METADATA or better, and no seek already in flight. Coalescing on
      // the element's own flag keeps scrubbing smooth without a manual latch.
      if (video.readyState < 1 || video.seeking) return
      const next = targetTime.current
      if (!isFinite(next)) return
      if (Math.abs(video.currentTime - next) < SEEK_EPSILON) return
      try {
        video.currentTime = next
      } catch {
        // Restricted-double rejection; the next frame retries harmlessly.
      }
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [wrap])

  function releasePointer(id: number) {
    const surface = surfaceRef.current
    if (surface?.hasPointerCapture?.(id)) surface.releasePointerCapture(id)
  }

  function handlePointerDown(e: React.PointerEvent) {
    // Ignore additional pointers — a second touch would otherwise steal the
    // drag and strand the first finger with no way to scrub.
    if (!ready || failed || pointerId.current !== null) return
    velocity.current = 0
    pointerId.current = e.pointerId
    lastX.current = e.clientX
    lastMoveAt.current = performance.now()
    draggingRef.current = true
    surfaceRef.current?.setPointerCapture(e.pointerId)
    setDragging(true)
    setHinted(true)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (pointerId.current !== e.pointerId) return
    const dx = e.clientX - lastX.current
    if (dx === 0) return
    lastX.current = e.clientX
    // Drag right advances the clip, drag left rewinds it.
    const delta = dx * SECONDS_PER_PIXEL
    // Scrubbing is 1:1 with the pointer; only the post-release glide uses
    // velocity, which must be per-frame rather than per-event or a slow drag
    // coasts far past where the user let go.
    const now = performance.now()
    const dt = Math.max(now - lastMoveAt.current, 1)
    const perFrame = (delta * FRAME_MS) / dt
    velocity.current = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, perFrame))
    lastMoveAt.current = now
    targetTime.current = wrap(targetTime.current + delta)
  }

  function endDrag(e: React.PointerEvent) {
    if (pointerId.current !== e.pointerId) return
    pointerId.current = null
    draggingRef.current = false
    // Releasing after a pause should settle, not fling.
    if (performance.now() - lastMoveAt.current > STALE_FLICK_MS) velocity.current = 0
    releasePointer(e.pointerId)
    setDragging(false)
  }

  // Keydown only — the rAF loop above owns its own cleanup, so an unstable
  // onClose identity from the parent can never abort an in-flight glide.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleError() {
    // Stop advertising a draggable surface the moment the media dies.
    setFailed(true)
    setReady(false)
    velocity.current = 0
    draggingRef.current = false
    setDragging(false)
    if (pointerId.current !== null) {
      releasePointer(pointerId.current)
      pointerId.current = null
    }
  }

  const interactive = ready && !failed

  return (
    <div className={s.backdrop} role="dialog" aria-modal="true" aria-label={`${amenity.name} walkthrough`}>
      <button className={s.dismiss} onClick={onClose} aria-label="Close walkthrough">✕</button>

      <div className={s.stage}>
        {/* The frame reads as a viewport cut into the room rather than a video player. */}
        <div
          ref={surfaceRef}
          className={`${s.surface} ${dragging ? s.surfaceDragging : ''} ${
            interactive ? '' : s.surfaceInert
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <video
            ref={videoRef}
            className={s.video}
            src={videoSrc}
            muted
            playsInline
            preload="auto"
            // Never autoplays: position is driven entirely by the drag.
            onLoadedMetadata={(e) => {
              e.currentTarget.pause()
              targetTime.current = 0
              setReady(true)
            }}
            onError={handleError}
          />

          <div className={s.vignette} />

          {!ready && !failed && (
            <div className={s.status}>
              <div className={s.ring} />
              <span>Loading room…</span>
            </div>
          )}
          {failed && (
            <div className={s.status}>
              <span>Walkthrough unavailable for this amenity.</span>
            </div>
          )}

          {interactive && !hinted && (
            <div className={s.hint}>
              <span className={s.hintArrow}>←</span>
              <span>Drag to look around</span>
              <span className={s.hintArrow}>→</span>
            </div>
          )}
        </div>

        <div className={s.caption}>
          <div className={s.eyebrow}>Amenity Walkthrough</div>
          <h2 className={s.title}>{amenity.name}</h2>
          {amenity.description && <p className={s.body}>{amenity.description}</p>}
        </div>
      </div>
    </div>
  )
}
