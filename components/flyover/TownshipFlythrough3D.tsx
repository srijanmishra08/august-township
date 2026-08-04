'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import * as THREE from 'three'
import Plot3DScene, { type Plot3DSceneHandle } from '../map/Plot3DScene'
import type { Amenity3D, Plot3D } from '@/lib/types/plot3d'
import type { FlyCam, FlythroughConfig, FlythroughStation } from '@/lib/types/flythrough'
import styles from './Flyover.module.css'

interface Props {
  config: FlythroughConfig
  plots: Plot3D[]
  amenities: Amenity3D[]
  planImage: string
  planSize: { width: number; pdfWidth: number; pdfHeight: number }
  camera: { position: [number, number, number]; target: [number, number, number] }
  projectSlug: string
  onExit: () => void
}

function ramp(v: number, from: number, to: number): number {
  if (to <= from) return v >= to ? 1 : 0
  const t = Math.min(Math.max((v - from) / (to - from), 0), 1)
  return t * t * (3 - 2 * t)
}

interface Range {
  station: FlythroughStation
  index: number
  travelStart: number
  arrive: number
  depart: number
}

function buildRanges(stations: FlythroughStation[]): Range[] {
  const total = stations.reduce((s, w) => s + (w.duration || 0) + (w.dwell || 0), 0) || 1
  let cursor = 0
  return stations.map((station, index) => {
    const travelStart = cursor / total
    cursor += station.duration || 0
    const arrive = cursor / total
    cursor += station.dwell || 0
    return { station, index, travelStart, arrive, depart: cursor / total }
  })
}

export default function TownshipFlythrough3D({
  config, plots, amenities, planImage, planSize, camera, projectSlug, onExit,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<Plot3DSceneHandle>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const filmRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const exitRef = useRef<HTMLButtonElement>(null)
  const cueRef = useRef<HTMLDivElement>(null)
  const arrivalRef = useRef<HTMLDivElement>(null)

  const [vh, setVh] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const activeIndexRef = useRef(0)
  const dwellRef = useRef(0)
  const settledRef = useRef(false)
  // Coalesced video seek target — writing currentTime while a seek is in
  // flight makes the decoder drop frames, which reads as tearing.
  const seekRef = useRef<number | null>(null)

  useEffect(() => {
    const measure = () => setVh(window.innerHeight)
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [])

  // A restored offset would drop the visitor mid-tour on reload.
  useEffect(() => {
    const prev = history.scrollRestoration
    history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)
    return () => { history.scrollRestoration = prev }
  }, [])

  const amenityByName = useMemo(
    () => Object.fromEntries(amenities.map((a) => [a.name, a])) as Record<string, Amenity3D>,
    [amenities],
  )
  const ranges = useMemo(() => buildRanges(config.stations), [config.stations])
  const noHidden = useMemo(() => new Set<string>(), [])

  /** One CatmullRom per leg, in world space at the station's eye height. */
  const curves = useMemo(
    () =>
      config.stations.map((s) =>
        s.points && s.points.length >= 2
          ? new THREE.CatmullRomCurve3(
              s.points.map(([x, z]) => new THREE.Vector3(x, s.eye, z)),
              false,
              'catmullrom',
              0.4,
            )
          : null,
      ),
    [config.stations],
  )

  const scrollHeight = useMemo(() => {
    if (!vh) return 0
    const units = config.stations.reduce((s, w) => s + (w.duration || 0) + (w.dwell || 0), 0)
    return Math.max(vh, units * vh * (config.scrollPerUnit ?? 0.75)) + vh
  }, [vh, config])

  const active = ranges[activeIndex]?.station
  const activeAmenity = active?.amenity ? amenityByName[active.amenity] : undefined
  // The clip is scrubbed, so the all-intra encode is the correct source —
  // that is exactly what plots-3d.json already points at.
  const filmSrc =
    active?.fullscreenVideo && activeAmenity?.video
      ? `/data/projects/${projectSlug}/${activeAmenity.video}`
      : null

  const paint = useCallback(
    (index: number, dwell: number, settled: boolean) => {
      const station = ranges[index]?.station
      const amount = settled ? dwell : 0
      dwellRef.current = dwell
      settledRef.current = settled
      const isExit = Boolean(station?.isExit)

      // Name the place the moment the camera arrives, and clear it before the
      // clip takes the screen — arriving somewhere unnamed is disorienting.
      const named = Boolean(station && !station.isExit && index > 0)
      const arrival = named
        ? Math.max(0, ramp(amount, 0.02, 0.12) - ramp(amount, 0.22, 0.34))
        : 0
      if (arrivalRef.current) {
        arrivalRef.current.style.opacity = String(arrival)
        arrivalRef.current.style.visibility = arrival <= 0.01 ? 'hidden' : 'visible'
        arrivalRef.current.style.transform =
          `translate(-50%, -50%) scale(${(0.97 + 0.03 * arrival).toFixed(4)})`
      }

      // While a fullscreen clip owns the screen, the 3D copy steps aside.
      const filmOn = Boolean(station?.fullscreenVideo)
      const film = filmOn ? Math.max(0, ramp(amount, 0.2, 0.36) - ramp(amount, 0.85, 0.97)) : 0

      if (filmRef.current) {
        filmRef.current.style.opacity = String(film)
        filmRef.current.style.visibility = film <= 0.01 ? 'hidden' : 'visible'
      }

      const video = videoRef.current
      if (video && filmOn && video.duration) {
        // Middle of the dwell scrubs the clip end to end.
        const t = ramp(amount, 0.3, 0.88)
        seekRef.current = Math.min(t * video.duration, video.duration - 0.05)
        if (!video.seeking && Math.abs(video.currentTime - seekRef.current) > 1 / 48) {
          video.currentTime = seekRef.current
        }
      }

      const copyIn = index === 0 ? 1 : ramp(amount, 0, 0.18)
      const copyOut = isExit ? 0 : ramp(amount, 0.86, 1)
      // Hide the 3D caption behind the film, but bring it back over the clip
      // once the clip itself is up, so the stop is always named.
      const copy = Math.max(0, copyIn - copyOut)
      if (panelRef.current) {
        panelRef.current.style.opacity = String(copy)
        panelRef.current.style.transform = `translateY(${((1 - copyIn) * 16).toFixed(2)}px)`
        panelRef.current.style.zIndex = film > 0.5 ? '40' : '20'
      }

      if (exitRef.current) {
        const e = isExit ? ramp(amount, 0.2, 0.6) : 0
        exitRef.current.style.opacity = String(e)
        exitRef.current.style.pointerEvents = e > 0.6 ? 'auto' : 'none'
      }
      if (cueRef.current) {
        cueRef.current.style.opacity = String(index === 0 ? 1 - ramp(amount, 0.1, 0.5) : 0)
      }
    },
    [ranges],
  )

  // Repaint after a station swap: the new nodes mount at opacity 0, and if the
  // timeline has already settled no further tick will arrive to reveal them.
  useEffect(() => {
    paint(activeIndex, dwellRef.current, settledRef.current)
  }, [activeIndex, paint])

  useEffect(() => {
    if (!vh) return
    const container = containerRef.current
    if (!container) return
    const stations = config.stations
    if (!stations.length) return

    gsap.registerPlugin(ScrollTrigger)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const lookAhead = config.lookAhead ?? 0.06

    const first = stations[0]
    const cam: FlyCam = {
      px: first.at?.[0] ?? 0, py: first.eye, pz: first.at?.[1] ?? 0,
      tx: first.lookAt?.[0] ?? (first.at?.[0] ?? 0),
      ty: first.lookHeight ?? first.eye * 0.55,
      tz: first.lookAt?.[1] ?? ((first.at?.[1] ?? 0) - 12), fov: first.fov ?? 56,
    }

    const tmpA = new THREE.Vector3()
    const tmpB = new THREE.Vector3()

    function driveCurve(curve: THREE.CatmullRomCurve3, u: number, eye: number, fov: number) {
      curve.getPointAt(Math.min(Math.max(u, 0), 1), tmpA)
      curve.getPointAt(Math.min(u + lookAhead, 1), tmpB)
      // Looking a little further down the road is what makes this read as
      // driving rather than sliding sideways.
      if (tmpB.distanceToSquared(tmpA) < 1e-6) {
        curve.getPointAt(Math.max(u - lookAhead, 0), tmpB)
        tmpB.subVectors(tmpA, tmpB).add(tmpA)
      }
      cam.px = tmpA.x; cam.py = eye; cam.pz = tmpA.z
      cam.tx = tmpB.x; cam.ty = eye * 0.82; cam.tz = tmpB.z
      cam.fov = fov
    }

    function push(this: gsap.core.Timeline) {
      sceneRef.current?.setCamera([cam.px, cam.py, cam.pz], [cam.tx, cam.ty, cam.tz], cam.fov)
      const p = this.progress()
      let cur = ranges[0]
      for (const r of ranges) { if (p >= r.travelStart) cur = r; else break }
      const span = cur.depart - cur.arrive
      const dwell = span <= 0 ? (p >= cur.arrive ? 1 : 0)
        : Math.min(Math.max((p - cur.arrive) / span, 0), 1)
      if (cur.index !== activeIndexRef.current) {
        activeIndexRef.current = cur.index
        setActiveIndex(cur.index)
      }
      paint(cur.index, dwell, p >= cur.arrive)
    }

    const tl = gsap.timeline({ paused: true, onUpdate: push })

    stations.forEach((station, i) => {
      const fov = station.fov ?? 56
      const curve = curves[i]

      if (i > 0) {
        if (curve) {
          const leg = { u: 0 }
          tl.to(leg, {
            u: 1,
            duration: station.duration || 0.5,
            ease: station.ease || 'power1.inOut',
            onUpdate: () => driveCurve(curve, leg.u, station.eye, fov),
          })
        } else {
          // No path — an explicit pose (the closing aerial).
          tl.to(cam, {
            px: station.at?.[0] ?? cam.px, py: station.eye, pz: station.at?.[1] ?? cam.pz,
            tx: station.lookAt?.[0] ?? cam.tx, ty: station.lookHeight ?? 0, tz: station.lookAt?.[1] ?? cam.tz,
            fov, duration: station.duration || 0.5, ease: station.ease || 'power3.inOut',
          })
        }
      }

      const dwell = station.dwell || 0
      if (dwell <= 0) return

      // On arrival, turn from the road to face the subject.
      if (station.target) {
        tl.to(cam, {
          // Aim just above eye level, so arriving looks up at the building
          // rather than down at the marker under it.
          tx: station.target[0], ty: station.eye * 1.5, tz: station.target[1],
          duration: dwell * 0.28, ease: 'power2.inOut',
        })
        tl.to(cam, { duration: dwell * 0.72 })
      } else {
        tl.to(cam, { duration: dwell })
      }
    })

    if (curves[0]) driveCurve(curves[0], 0, first.eye, first.fov ?? 56)
    sceneRef.current?.setCamera([cam.px, cam.py, cam.pz], [cam.tx, cam.ty, cam.tz], cam.fov)
    paint(0, 0, true)

    const trigger = ScrollTrigger.create({
      trigger: container, start: 'top top', end: 'bottom bottom',
      scrub: reduce ? true : 0.7, animation: tl, invalidateOnRefresh: true,
    })

    let lenis: { destroy: () => void } | null = null
    let tickerFn: ((t: number) => void) | null = null
    if (!reduce) {
      void import('lenis').then(({ default: Lenis }) => {
        const inst = new Lenis({ duration: 1.1, smoothWheel: true, wheelMultiplier: 0.9 })
        lenis = inst
        inst.on('scroll', ScrollTrigger.update)
        tickerFn = (t: number) => inst.raf(t * 1000)
        gsap.ticker.add(tickerFn)
        gsap.ticker.lagSmoothing(0)
      })
    }
    ScrollTrigger.refresh()

    return () => {
      trigger.kill(); tl.kill()
      if (tickerFn) gsap.ticker.remove(tickerFn)
      gsap.ticker.lagSmoothing(500, 33)
      lenis?.destroy()
    }
  }, [vh, config, curves, ranges, paint])

  return (
    <div ref={containerRef} className={styles.root} style={{ height: scrollHeight || '100svh' }}>
      <div className={styles.viewport}>
        <Plot3DScene
          plots={plots}
          amenities={amenities}
          planImage={planImage}
          planSize={planSize}
          camera={camera}
          hiddenIds={noHidden}
          selectedId={null}
          interactive={false}
          cinematic
          handleRef={sceneRef}
          className={styles.sceneHost}
        />

        {/* Fullscreen amenity film. Takes the whole screen on arrival and is
            scrubbed by scroll, then hands back to the drive. */}
        <div ref={filmRef} className={styles.film} style={{ opacity: 0, visibility: 'hidden' }}>
          {filmSrc && (
            <video
              ref={videoRef}
              key={active?.id}
              src={filmSrc}
              muted
              playsInline
              preload="auto"
              disableRemotePlayback
              onLoadedData={(e) => {
                // First frame on screen as soon as it decodes, so the takeover
                // never flashes black.
                const v = e.currentTarget
                if (v.currentTime < 0.01) v.currentTime = 0.01
              }}
            />
          )}
          <div className={styles.filmVignette} />
        </div>

        <div ref={arrivalRef} className={styles.arrival} style={{ opacity: 0, visibility: 'hidden' }}>
          <span className={styles.arrivalEyebrow}>You have arrived at</span>
          <span className={styles.arrivalName}>{active?.title ?? active?.label}</span>
        </div>

        <div className={styles.rail} aria-hidden>
          {ranges.map((r, i) => (
            <div key={r.station.id}
              className={`${styles.railItem} ${i === activeIndex ? styles.railItemActive : ''}`}>
              <span className={styles.railDot} />
              <span className={styles.railLabel}>{r.station.label}</span>
            </div>
          ))}
        </div>

        <div ref={panelRef} className={styles.panel} style={{ opacity: 0 }}>
          <p className={styles.panelIndex}>
            {String(activeIndex + 1).padStart(2, '0')} / {String(ranges.length).padStart(2, '0')}
          </p>
          <div className={styles.panelRule} />
          <h2 className={styles.panelTitle}>{active?.title ?? active?.label ?? ''}</h2>
          {active?.description && <p className={styles.panelBody}>{active.description}</p>}
        </div>

        <div ref={cueRef} className={styles.cue} aria-hidden>Scroll to walk through</div>

        <button ref={exitRef} type="button" className={styles.exitButton}
          style={{ opacity: 0, pointerEvents: 'none' }} onClick={onExit}>
          Explore Every Plot
        </button>
        <button type="button" className={styles.skip} onClick={onExit}>Skip to 3D</button>
      </div>
    </div>
  )
}
