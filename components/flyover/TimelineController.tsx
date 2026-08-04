'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { CameraState, FlyoverConfig } from '@/lib/types/flyover'
import type { CameraHandle } from './CameraController'

interface TimelineOptions {
  config: FlyoverConfig
  containerRef: React.RefObject<HTMLDivElement | null>
  cameraRef: React.RefObject<CameraHandle | null>
  /** Called with 0-1 master progress on every scrub tick. */
  onProgress: (progress: number) => void
  /** Re-init when the viewport changes, since scroll length is height-derived. */
  viewportKey: string
  enabled: boolean
}

/**
 * Builds the master GSAP timeline and binds it to scroll.
 *
 * The timeline mutates a single plain camera object; CameraController turns
 * that into transforms. Keeping the tween target free of React state is what
 * lets the whole stack scrub at frame rate.
 */
export default function useTimelineController({
  config,
  containerRef,
  cameraRef,
  onProgress,
  viewportKey,
  enabled,
}: TimelineOptions) {
  // Held in a ref so changing the callback never rebuilds the timeline.
  const progressRef = useRef(onProgress)
  progressRef.current = onProgress

  useEffect(() => {
    if (!enabled) return
    const container = containerRef.current
    if (!container) return
    const waypoints = config.waypoints
    if (waypoints.length === 0) return

    gsap.registerPlugin(ScrollTrigger)

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const first = waypoints[0]
    const cam: CameraState = {
      x: first.x,
      y: first.y,
      zoom: first.zoom,
      rotation: first.rotation,
    }

    function pushFrame(this: gsap.core.Timeline) {
      cameraRef.current?.apply(cam)
      progressRef.current(this.progress())
    }

    const tl = gsap.timeline({ paused: true, onUpdate: pushFrame })

    waypoints.forEach((wp, i) => {
      if (i > 0) {
        tl.to(cam, {
          x: wp.x,
          y: wp.y,
          zoom: wp.zoom,
          rotation: wp.rotation,
          duration: wp.duration || 0.001,
          ease: wp.ease || 'power3.inOut',
        })
      }
      // An empty tween holds the playhead — the camera sits still while the
      // user keeps scrolling, which is what gives each stop room to be read.
      if (wp.hold) tl.to(cam, { duration: wp.hold })
    })

    // Paint the opening frame before any scrolling happens.
    cameraRef.current?.apply(cam)
    progressRef.current(0)

    const trigger = ScrollTrigger.create({
      trigger: container,
      start: 'top top',
      end: 'bottom bottom',
      scrub: reduce ? true : 0.85,
      animation: tl,
      invalidateOnRefresh: true,
    })

    // Lenis smooths the wheel input feeding ScrollTrigger. Skipped under
    // reduced-motion, where inertia is exactly what the user opted out of.
    let lenis: { raf: (t: number) => void; destroy: () => void } | null = null
    let tickerFn: ((time: number) => void) | null = null

    if (!reduce) {
      // Imported lazily so the smooth-scroll bundle never lands on a
      // reduced-motion or SSR path.
      void import('lenis').then(({ default: Lenis }) => {
        const instance = new Lenis({
          duration: 1.15,
          smoothWheel: true,
          wheelMultiplier: 0.9,
          touchMultiplier: 1.4,
        })
        lenis = instance
        instance.on('scroll', ScrollTrigger.update)
        tickerFn = (time: number) => instance.raf(time * 1000)
        gsap.ticker.add(tickerFn)
        gsap.ticker.lagSmoothing(0)
      })
    }

    ScrollTrigger.refresh()

    return () => {
      trigger.kill()
      tl.kill()
      if (tickerFn) gsap.ticker.remove(tickerFn)
      gsap.ticker.lagSmoothing(500, 33)
      lenis?.destroy()
    }
    // viewportKey forces a rebuild on resize: scroll length is derived from
    // viewport height, so stale triggers would end at the wrong scroll offset.
  }, [config, containerRef, cameraRef, viewportKey, enabled])
}
