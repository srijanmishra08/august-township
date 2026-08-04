'use client'

import { useEffect, useRef } from 'react'

interface VideoHeroSceneProps {
  src: string
  projectName: string
  tagline?: string
}

function rangeLerp(progress: number, start: number, end: number): number {
  return Math.max(0, Math.min(1, (progress - start) / (end - start)))
}

export default function VideoHeroScene({ src, projectName, tagline }: VideoHeroSceneProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const glassRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const scrollHintRef = useRef<HTMLDivElement>(null)
  const cap1Ref = useRef<HTMLDivElement>(null)
  const cap2Ref = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const section = sectionRef.current
    const video = videoRef.current
    if (!section || !video) return

    const container = section.closest('[data-scroll-container]') as HTMLElement | null
    if (!container) return

    function tick() {
      rafRef.current = null
      const sectionTop = section!.offsetTop
      const sectionH = section!.offsetHeight
      const viewH = container!.clientHeight
      const scrollTop = container!.scrollTop
      const p = Math.max(0, Math.min(1, (scrollTop - sectionTop) / (sectionH - viewH)))

      // Scrub — clamp 100ms from end so last frame never goes black
      if (video!.duration) {
        video!.currentTime = Math.min(p * video!.duration, video!.duration - 0.1)
      }

      if (glassRef.current) {
        glassRef.current.style.opacity = String(1 - rangeLerp(p, 0.08, 0.28))
      }
      if (heroRef.current) {
        const t = rangeLerp(p, 0.05, 0.22)
        heroRef.current.style.opacity = String(1 - t)
        heroRef.current.style.transform = `translateY(${-32 * t}px)`
      }
      if (scrollHintRef.current) {
        scrollHintRef.current.style.opacity = String(1 - rangeLerp(p, 0, 0.06))
      }
      applyCaptionStyle(cap1Ref.current, p, 0.32, 0.62)
      applyCaptionStyle(cap2Ref.current, p, 0.72, 1.0)
    }

    function onScroll() {
      if (!rafRef.current) rafRef.current = requestAnimationFrame(tick)
    }

    // Re-tick the moment the video has a decodable frame —
    // critical on iOS where data arrives after scroll events already fired
    const onLoaded = () => {
      if (!rafRef.current) rafRef.current = requestAnimationFrame(tick)
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    video.addEventListener('loadeddata', onLoaded)

    return () => {
      container.removeEventListener('scroll', onScroll)
      video.removeEventListener('loadeddata', onLoaded)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div ref={sectionRef} style={{ height: '300vh' }} className="relative">
      <div className="sticky top-0 w-full h-screen overflow-hidden bg-black">

        {/* autoPlay forces iOS to buffer; onPlay pauses immediately so we own currentTime */}
        <video
          ref={videoRef}
          src={src}
          autoPlay
          muted
          playsInline
          preload="auto"
          onPlay={e => e.currentTarget.pause()}
          className="absolute inset-0 w-full h-full object-cover"
        />

        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/10 to-black/60 pointer-events-none" />

        <div
          ref={glassRef}
          className="absolute inset-0 pointer-events-none"
          style={{
            backdropFilter: 'blur(22px) saturate(0.7)',
            WebkitBackdropFilter: 'blur(22px) saturate(0.7)',
            backgroundColor: 'rgba(10, 10, 10, 0.30)',
          }}
        />

        <div
          ref={heroRef}
          className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none"
          style={{ willChange: 'opacity, transform' }}
        >
          <p className="text-brand-primary text-[10px] uppercase tracking-[0.45em] mb-6">
            August Presents
          </p>
          <h1 className="text-5xl sm:text-7xl font-semibold text-white tracking-tight leading-[1.05]">
            {projectName}
          </h1>
          {tagline && (
            <p className="mt-5 text-base sm:text-xl text-white/55 max-w-2xl leading-relaxed font-light">
              {tagline}
            </p>
          )}
        </div>

        <div
          ref={cap1Ref}
          className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none"
          style={{ opacity: 0, transform: 'translateY(28px)', willChange: 'opacity, transform' }}
        >
          <h2 className="text-4xl sm:text-6xl font-semibold text-white leading-[1.05] tracking-tight max-w-3xl">
            Built for the way you live
          </h2>
          <p className="mt-5 text-base sm:text-lg text-white/55 max-w-xl leading-relaxed font-light">
            Generous spaces. Considered details. Crafted to endure.
          </p>
        </div>

        <div
          ref={cap2Ref}
          className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none"
          style={{ opacity: 0, transform: 'translateY(28px)', willChange: 'opacity, transform' }}
        >
          <p className="text-brand-primary text-[10px] uppercase tracking-[0.45em] mb-5">
            August Township
          </p>
          <h2 className="text-4xl sm:text-6xl font-semibold text-white leading-[1.05] tracking-tight max-w-3xl">
            {tagline ?? 'Where Legacy Meets Living'}
          </h2>
        </div>

        <div
          ref={scrollHintRef}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none"
        >
          <span className="text-[10px] text-white/40 uppercase tracking-[0.3em]">Scroll to Discover</span>
          <svg className="w-4 h-4 animate-bounce text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </div>
    </div>
  )
}

function applyCaptionStyle(el: HTMLDivElement | null, p: number, from: number, to: number) {
  if (!el) return
  const FADE = 0.055
  let opacity = 0
  let y = 28
  if (p >= from && p <= to) {
    const fadeInEnd = from + FADE
    const fadeOutStart = to - FADE
    if (p < fadeInEnd) {
      const t = (p - from) / FADE
      opacity = t; y = 28 * (1 - t)
    } else if (p > fadeOutStart) {
      const t = (p - fadeOutStart) / FADE
      opacity = 1 - t; y = -14 * t
    } else {
      opacity = 1; y = 0
    }
  }
  el.style.opacity = String(opacity)
  el.style.transform = `translateY(${y}px)`
}
