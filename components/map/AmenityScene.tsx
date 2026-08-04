'use client'

import { useEffect, useRef } from 'react'
import type { AmenityDef } from '@/lib/types/project'

interface AmenitySceneProps {
  amenity: AmenityDef
  projectSlug: string
  index: number
  total: number
}

function rangeLerp(p: number, start: number, end: number): number {
  return Math.max(0, Math.min(1, (p - start) / (end - start)))
}

export default function AmenityScene({ amenity, projectSlug, index, total }: AmenitySceneProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const counterRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)

  const alignRight = index % 2 === 1
  // Scrubbing needs the all-intra encode; the inter-frame master seeks back to
  // frame 0 on every currentTime write, which is what causes the stutter.
  const scrubPath = amenity.scrubVideoPath ?? amenity.videoPath
  const videoSrc = scrubPath
    ? `/data/projects/${projectSlug}/${scrubPath}`
    : null
  const num = String(index + 1).padStart(2, '0')
  const tot = String(total).padStart(2, '0')

  useEffect(() => {
    const section = sectionRef.current
    const video = videoRef.current
    if (!section || !video) return

    const container = section.closest('[data-scroll-container]') as HTMLElement | null
    if (!container) return

    // Re-tick when video has frame data — critical on iOS where preload is ignored
    const onLoaded = () => {
      if (!rafRef.current) rafRef.current = requestAnimationFrame(tick)
    }
    video.addEventListener('loadeddata', onLoaded)

    // Coalesce seeks. Writing currentTime while a seek is still in flight makes
    // the decoder drop the in-progress frame, which reads as tearing/freezing.
    // We keep only the newest target and issue it once the element goes idle.
    let pendingTime: number | null = null

    function flushSeek() {
      const v = video!
      if (pendingTime === null || v.seeking || !v.duration) return
      const target = pendingTime
      pendingTime = null
      // Sub-frame deltas aren't visible; skipping them avoids pointless decodes.
      if (Math.abs(v.currentTime - target) < 1 / 48) return
      v.currentTime = target
    }

    video.addEventListener('seeked', flushSeek)

    function tick() {
      rafRef.current = null
      const sectionTop = section!.offsetTop
      const sectionH = section!.offsetHeight
      const viewH = container!.clientHeight
      const scrollTop = container!.scrollTop
      const p = Math.max(0, Math.min(1, (scrollTop - sectionTop) / (sectionH - viewH)))

      // Scrub video — clamp off last 100ms to avoid black end-frame
      if (video!.duration) {
        pendingTime = Math.min(p * video!.duration, video!.duration - 0.1)
        flushSeek()
      }

      // Card: slides in from edge at entry, fades out at exit
      const inT = rangeLerp(p, 0.06, 0.22)
      const outT = rangeLerp(p, 0.80, 0.94)
      const cardOpacity = Math.max(0, Math.min(inT, 1 - outT))
      // Only slide during entry; exit is fade-only so rewind feels natural
      const slideX = outT > 0 ? 0 : (alignRight ? (1 - inT) * 64 : -(1 - inT) * 64)
      if (cardRef.current) {
        cardRef.current.style.opacity = String(cardOpacity)
        cardRef.current.style.transform = `translateY(-50%) translateX(${slideX}px)`
      }

      // Counter
      const cOpacity = Math.max(0, Math.min(rangeLerp(p, 0.12, 0.24), 1 - rangeLerp(p, 0.84, 0.95)))
      if (counterRef.current) {
        counterRef.current.style.opacity = String(cOpacity * 0.5)
      }
    }

    function onScroll() {
      if (!rafRef.current) rafRef.current = requestAnimationFrame(tick)
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', onScroll)
      video.removeEventListener('loadeddata', onLoaded)
      video.removeEventListener('seeked', flushSeek)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [alignRight])

  return (
    <div ref={sectionRef} style={{ height: '200vh' }} className="relative">
      <div className="sticky top-0 w-full h-screen overflow-hidden bg-black">

        {/* autoPlay forces iOS to buffer; onPlay pauses immediately so we own currentTime */}
        {videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            autoPlay
            muted
            playsInline
            preload="auto"
            onPlay={e => e.currentTarget.pause()}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-surface-overlay via-surface-card to-surface-dark" />
        )}

        {/* Minimal vignette — just enough for counter readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/28 pointer-events-none" />

        {/* Card — flush to screen edge, driven by scroll progress */}
        <div
          ref={cardRef}
          className="absolute top-1/2 z-10 w-[300px] sm:w-[340px]"
          style={{
            [alignRight ? 'right' : 'left']: 0,
            opacity: 0,
            transform: `translateY(-50%) translateX(${alignRight ? '64px' : '-64px'})`,
            willChange: 'opacity, transform',
          }}
        >
          <div
            className={`relative p-7 sm:p-9 ${alignRight ? 'rounded-l-2xl' : 'rounded-r-2xl'}`}
            style={{
              background: 'rgba(8, 8, 8, 0.90)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: alignRight
                ? '-20px 0 60px rgba(0,0,0,0.5)'
                : '20px 0 60px rgba(0,0,0,0.5)',
            }}
          >
            {/* Brand accent rail on inner (video-facing) edge */}
            <div
              className={`absolute top-6 bottom-6 ${alignRight ? 'left-0' : 'right-0'} w-[2px] rounded-full`}
              style={{
                background: 'linear-gradient(to bottom, transparent, var(--color-brand-primary, #c9a96e) 25%, var(--color-brand-primary, #c9a96e) 75%, transparent)',
              }}
            />

            <p className="text-brand-primary text-[10px] uppercase tracking-[0.5em] mb-3 font-medium">
              {num}
            </p>
            <div className="w-7 h-px mb-5 bg-brand-primary/35" />
            <h2 className="text-[1.6rem] sm:text-[1.85rem] font-semibold text-white leading-tight tracking-tight mb-4">
              {amenity.name}
            </h2>
            <p className="text-[13px] sm:text-sm text-white/55 leading-relaxed">
              {amenity.description}
            </p>
          </div>
        </div>

        {/* Section counter */}
        <div
          ref={counterRef}
          className="absolute bottom-7 left-1/2 -translate-x-1/2 z-10 pointer-events-none"
          style={{ opacity: 0 }}
        >
          <span className="text-[9px] text-white uppercase tracking-[0.45em]">{num} / {tot}</span>
        </div>
      </div>
    </div>
  )
}
