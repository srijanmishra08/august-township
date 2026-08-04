'use client'

import { useEffect, useRef, type CSSProperties } from 'react'
import type { FlyoverLayer } from '@/lib/types/flyover'
import { parseRects } from '@/lib/flyover'
import styles from './Flyover.module.css'

interface AmbientLayerProps {
  layer: FlyoverLayer
  /** Size of the plan cover box, in CSS px. */
  width: number
  height: number
  planUrl: string
  planSources?: { avif?: string; webp?: string }
}

function num(options: FlyoverLayer['options'], key: string, fallback: number): number {
  const v = options?.[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function str(options: FlyoverLayer['options'], key: string, fallback: string): string {
  const v = options?.[key]
  return typeof v === 'string' ? v : fallback
}

/** Drifting soft-edged blobs standing in for cloud shadows crossing the site. */
function CloudShadows({ layer, width, height }: AmbientLayerProps) {
  const scale = num(layer.options, 'scale', 1.8)
  const speed = num(layer.options, 'speed', 0.02)
  const tile = Math.round(420 * scale)
  // Period in seconds — slow enough to read as weather, not animation.
  const period = Math.max(30, 1 / Math.max(speed, 0.001))

  return (
    <div
      className={styles.clouds}
      style={{
        width,
        height,
        opacity: layer.opacity ?? 0.16,
        mixBlendMode: (layer.blendMode as CSSProperties['mixBlendMode']) ?? 'multiply',
        animationDuration: `${period}s`,
        animationDirection: 'alternate',
        backgroundSize: `${tile}px ${Math.round(tile * 0.72)}px`,
        backgroundImage: [
          'radial-gradient(ellipse 38% 26% at 22% 30%, rgba(0,0,0,0.55), transparent 68%)',
          'radial-gradient(ellipse 30% 20% at 68% 62%, rgba(0,0,0,0.45), transparent 70%)',
          'radial-gradient(ellipse 22% 32% at 45% 82%, rgba(0,0,0,0.4), transparent 72%)',
        ].join(','),
      }}
    />
  )
}

/**
 * Water shimmer, confined to rectangles given in normalized plan coordinates
 * ("x,y,w,h" groups separated by ";"). Without a per-feature mask from the
 * source drawing this is the honest way to target only the pool and lakes.
 */
function Water({ layer, width, height }: AmbientLayerProps) {
  const rects = parseRects(layer.options?.rects)
  const speed = num(layer.options, 'speed', 0.35)
  const tint = str(layer.options, 'tint', '#4aa3c7')
  const period = Math.max(2.5, 6 / Math.max(speed, 0.05))

  if (rects.length === 0) return null

  return (
    <>
      {rects.map(([x, y, w, h], i) => (
        <div
          key={i}
          className={styles.water}
          style={{
            left: x * width,
            top: y * height,
            width: Math.max(2, w * width),
            height: Math.max(2, h * height),
            opacity: layer.opacity ?? 0.55,
            animationDuration: `${period}s`,
            animationDelay: `${i * 0.7}s`,
            backgroundSize: '220% 100%',
            backgroundImage:
              `linear-gradient(105deg, transparent 12%, ${tint}88 34%, #ffffffaa 50%, ${tint}88 66%, transparent 88%)`,
          }}
        />
      ))}
    </>
  )
}

/** Slow floating motes. Canvas keeps this to one composited layer. */
function Particles({ layer, width, height }: AmbientLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const count = Math.round(num(layer.options, 'count', 46))
  const speed = num(layer.options, 'speed', 0.16)
  const tint = str(layer.options, 'tint', '#ffffff')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width <= 0 || height <= 0) return

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    // Deterministic placement — a re-mount shouldn't reshuffle the sky.
    let seed = 20260803
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }

    const motes = Array.from({ length: count }, () => ({
      x: rand() * width,
      y: rand() * height,
      r: 0.7 + rand() * 1.9,
      vx: (rand() - 0.5) * speed,
      vy: -(0.25 + rand() * 0.75) * speed,
      a: 0.18 + rand() * 0.5,
      phase: rand() * Math.PI * 2,
    }))

    let raf = 0
    let t = 0

    function frame() {
      if (!ctx) return
      t += 1
      ctx.clearRect(0, 0, width, height)
      for (const m of motes) {
        m.x += m.vx
        m.y += m.vy
        if (m.y < -8) {
          m.y = height + 8
          m.x = rand() * width
        }
        if (m.x < -8) m.x = width + 8
        if (m.x > width + 8) m.x = -8

        const twinkle = 0.72 + 0.28 * Math.sin(t * 0.012 + m.phase)
        ctx.globalAlpha = m.a * twinkle
        ctx.fillStyle = tint
        ctx.beginPath()
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(frame)
    }

    if (reduce) {
      // Draw one static field rather than nothing, so the layer still reads.
      t = 0
      ctx.clearRect(0, 0, width, height)
      for (const m of motes) {
        ctx.globalAlpha = m.a
        ctx.fillStyle = tint
        ctx.beginPath()
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    } else {
      raf = requestAnimationFrame(frame)
    }

    return () => cancelAnimationFrame(raf)
  }, [width, height, count, speed, tint])

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, opacity: layer.opacity ?? 0.5, display: 'block' }}
    />
  )
}

/** Flat colour wash or vignette. Used for the backdrop and the final grade. */
function Grade({ layer, width, height }: AmbientLayerProps) {
  const vignette = num(layer.options, 'vignette', 0)
  const warm = num(layer.options, 'warm', 0)
  const from = str(layer.options, 'from', '')
  const to = str(layer.options, 'to', '')

  const backgrounds: string[] = []
  if (vignette > 0) {
    backgrounds.push(
      `radial-gradient(ellipse at 50% 50%, transparent 42%, rgba(0,0,0,${vignette}) 100%)`,
    )
  }
  if (warm > 0) {
    backgrounds.push(`linear-gradient(to bottom, rgba(255,196,128,${warm}), rgba(80,130,190,${warm * 0.7}))`)
  }
  if (from && to) {
    backgrounds.push(`linear-gradient(160deg, ${from}, ${to})`)
  }

  return (
    <div
      className={styles.grade}
      style={{
        width: width || '100%',
        height: height || '100%',
        opacity: layer.opacity ?? 1,
        background: backgrounds.join(','),
        mixBlendMode: (layer.blendMode as CSSProperties['mixBlendMode']) ?? undefined,
      }}
    />
  )
}

/** The plan itself, served AVIF → WebP → PNG. */
function PlanImage({ layer, width, height, planUrl, planSources }: AmbientLayerProps) {
  return (
    <picture>
      {planSources?.avif && <source srcSet={planSources.avif} type="image/avif" />}
      {planSources?.webp && <source srcSet={planSources.webp} type="image/webp" />}
      <img
        src={planUrl}
        alt=""
        width={width}
        height={height}
        draggable={false}
        decoding="async"
        fetchPriority="high"
        className={styles.planImage}
        style={{ width, height, opacity: layer.opacity ?? 1 }}
      />
    </picture>
  )
}

export default function AmbientLayer(props: AmbientLayerProps) {
  switch (props.layer.kind) {
    case 'image':
      return <PlanImage {...props} />
    case 'clouds':
      return <CloudShadows {...props} />
    case 'water':
      return <Water {...props} />
    case 'particles':
      return <Particles {...props} />
    case 'grade':
      return <Grade {...props} />
    default:
      return null
  }
}
