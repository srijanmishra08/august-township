'use client'

import { useEffect, useRef, useState } from 'react'

const RADIUS = 22
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const MIN_DURATION_MS = 2000
const COMPLETE_MS = 280
const FADE_MS = 450

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

interface BootOverlayProps {
  mapReady: boolean
}

export default function BootOverlay({ mapReady }: BootOverlayProps) {
  const [progress, setProgress] = useState(0)
  const [fading, setFading] = useState(false)
  const [hidden, setHidden] = useState(false)
  const startRef = useRef<number>(performance.now())
  const completeStartRef = useRef<number | null>(null)

  useEffect(() => {
    let raf = 0

    function tick(now: number) {
      const elapsed = now - startRef.current
      const rampPhase = Math.min(1, elapsed / MIN_DURATION_MS)
      const baseProgress = easeOutCubic(rampPhase) * 99

      const canComplete = mapReady && elapsed >= MIN_DURATION_MS
      if (canComplete && completeStartRef.current === null) {
        completeStartRef.current = now
      }

      let next = baseProgress
      if (completeStartRef.current !== null) {
        const cElapsed = now - completeStartRef.current
        const cT = Math.min(1, cElapsed / COMPLETE_MS)
        next = 99 + cT * 1
        if (cT >= 1) {
          setProgress(100)
          setFading(true)
          window.setTimeout(() => setHidden(true), FADE_MS)
          return
        }
      }

      setProgress(next)
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mapReady])

  if (hidden) return null

  const offset = CIRCUMFERENCE * (1 - progress / 100)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-dark transition-opacity"
      style={{
        opacity: fading ? 0 : 1,
        transitionDuration: `${FADE_MS}ms`,
        pointerEvents: fading ? 'none' : 'auto',
      }}
      aria-hidden={fading || undefined}
    >
      <svg
        className="h-20 w-20 -rotate-90"
        viewBox="0 0 50 50"
        fill="none"
        role="status"
        aria-label="Loading"
      >
        <circle
          cx="25"
          cy="25"
          r={RADIUS}
          stroke="var(--color-brand-primary)"
          strokeOpacity="0.12"
          strokeWidth="1.5"
        />
        <circle
          cx="25"
          cy="25"
          r={RADIUS}
          stroke="var(--color-brand-primary)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 80ms linear' }}
        />
      </svg>
    </div>
  )
}
