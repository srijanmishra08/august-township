'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import * as THREE from 'three'
import Plot3DScene, { type Plot3DSceneHandle } from '../map/Plot3DScene'
import PanoramaStage, { type PanoramaHandle } from './PanoramaStage'
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
  const panoRef = useRef<PanoramaHandle>(null)
  const roadRef = useRef<HTMLDivElement>(null)
  const roadVideoRef = useRef<HTMLVideoElement>(null)

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
  // A real photographic sphere wins over a pan of the same room, so the
  // panorama takes the screen and the clip is only the fallback.
  const panoSrc = active?.panorama
    ? `/data/projects/${projectSlug}/${active.panorama}`
    : null
  // Precedence: a 360 of the room, then a clip made for this stop, then the
  // amenity's own clip. Only one takes the screen at a time.
  const stationClip = active?.video ? `/data/projects/${projectSlug}/${active.video}` : null
  const amenityClip =
    active?.fullscreenVideo && activeAmenity?.video
      ? `/data/projects/${projectSlug}/${activeAmenity.video}`
      : null
  const filmSrc = panoSrc ? null : stationClip ?? amenityClip
  const roadSrc = config.roadVideo ? `/data/projects/${projectSlug}/${config.roadVideo}` : null

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
      const filmOn = Boolean(station?.panorama || station?.video || station?.fullscreenVideo)
      const film = filmOn ? Math.max(0, ramp(amount, 0.2, 0.36) - ramp(amount, 0.85, 0.97)) : 0

      if (filmRef.current) {
        filmRef.current.style.opacity = String(film)
        filmRef.current.style.visibility = film <= 0.01 ? 'hidden' : 'visible'
      }

      // Scroll sweeps the yaw — that is what turns a still 360 into a beat.
      if (station?.panorama) {
        panoRef.current?.setView(ramp(amount, 0.14, 0.92))
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

    /**
     * The timeline drives one monotonic playhead, measured in station-time
     * units. The camera is derived from that playhead in `push`, and nothing
     * else ever writes it.
     *
     * The earlier shape had each leg's tween write the camera from its own
     * onUpdate. GSAP renders tweens that sit outside the playhead during some
     * passes — notably the invalidate that `invalidateOnRefresh` triggers — and
     * any such stray render slammed the camera to that leg's first point.
     * The first leg starts at the entrance, which is why the opening aerial
     * never appeared and the shot sat frozen on the arrival.
     */
    interface Segment {
      station: FlythroughStation
      curve: THREE.CatmullRomCurve3 | null
      start: number
      arrive: number
      end: number
    }

    let cursor = 0
    const segments: Segment[] = stations.map((station, i) => {
      const start = cursor
      cursor += i > 0 ? station.duration || 0 : 0
      const arrive = cursor
      cursor += station.dwell || 0
      return { station, curve: curves[i], start, arrive, end: cursor }
    })
    const totalUnits = cursor || 1

    const cam: FlyCam = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, fov: 56 }
    const tmpA = new THREE.Vector3()
    const tmpB = new THREE.Vector3()
    const tmpC = new THREE.Vector3()

    /** Where the camera comes to rest once it has arrived at a station. */
    function restPose(i: number): FlyCam {
      const st = stations[i]
      const curve = curves[i]
      const fov = st.fov ?? 56
      if (curve) {
        curve.getPointAt(1, tmpC)
        const target = st.target
        return {
          px: tmpC.x, py: st.eye, pz: tmpC.z,
          tx: target ? target[0] : tmpC.x,
          ty: st.eye * 1.5,
          tz: target ? target[1] : tmpC.z,
          fov,
        }
      }
      const px = st.at?.[0] ?? 0
      const pz = st.at?.[1] ?? 0
      return {
        px, py: st.eye, pz,
        tx: st.lookAt?.[0] ?? px,
        ty: st.lookHeight ?? st.eye * 0.55,
        tz: st.lookAt?.[1] ?? pz - 12,
        fov,
      }
    }

    function assign(pose: FlyCam) {
      cam.px = pose.px; cam.py = pose.py; cam.pz = pose.pz
      cam.tx = pose.tx; cam.ty = pose.ty; cam.tz = pose.tz
      cam.fov = pose.fov
    }

    function blend(a: FlyCam, b: FlyCam, u: number) {
      const k = Math.min(Math.max(u, 0), 1)
      cam.px = a.px + (b.px - a.px) * k
      cam.py = a.py + (b.py - a.py) * k
      cam.pz = a.pz + (b.pz - a.pz) * k
      cam.tx = a.tx + (b.tx - a.tx) * k
      cam.ty = a.ty + (b.ty - a.ty) * k
      cam.tz = a.tz + (b.tz - a.tz) * k
      cam.fov = a.fov + (b.fov - a.fov) * k
    }

    /** Pose while travelling along a station's driving path. */
    function alongCurve(curve: THREE.CatmullRomCurve3, u: number, st: FlythroughStation) {
      const k = Math.min(Math.max(u, 0), 1)
      curve.getPointAt(k, tmpA)
      curve.getPointAt(Math.min(k + lookAhead, 1), tmpB)
      // Aiming a little further down the road is what makes this read as
      // driving rather than sliding sideways.
      if (tmpB.distanceToSquared(tmpA) < 1e-6) {
        curve.getPointAt(Math.max(k - lookAhead, 0), tmpB)
        tmpB.subVectors(tmpA, tmpB).add(tmpA)
      }
      cam.px = tmpA.x; cam.py = st.eye; cam.pz = tmpA.z
      cam.tx = tmpB.x; cam.ty = st.eye * 0.82; cam.tz = tmpB.z
      cam.fov = st.fov ?? 56
    }

    const playhead = { t: 0 }

    function push() {
      const t = playhead.t
      let i = 0
      for (let k = 0; k < segments.length; k++) {
        if (t >= segments[k].start) i = k
        else break
      }
      const seg = segments[i]

      if (t < seg.arrive) {
        const travel = seg.arrive - seg.start
        const u = travel > 0 ? (t - seg.start) / travel : 1
        // Stations with a path drive it; stations without one (the opening
        // aerial, the closing lift) interpolate from the previous rest pose.
        if (seg.curve) alongCurve(seg.curve, u, seg.station)
        else blend(restPose(Math.max(i - 1, 0)), restPose(i), u)
      } else {
        const span = seg.end - seg.arrive
        const d = span > 0 ? (t - seg.arrive) / span : 1
        if (seg.curve) {
          alongCurve(seg.curve, 1, seg.station)
          if (seg.station.target) {
            // Arrive facing down the road, then turn to the subject.
            const facing: FlyCam = { ...cam }
            blend(facing, restPose(i), Math.min(d / 0.28, 1))
          }
        } else {
          assign(restPose(i))
        }
      }

      sceneRef.current?.setCamera([cam.px, cam.py, cam.pz], [cam.tx, cam.ty, cam.tz], cam.fov)

      // On a straight run, real road footage replaces the 3D drive. It uses the
      // same eased position along the curve as the camera, so the cut-in and
      // cut-out land exactly where the road straightens and bends.
      let road = 0
      let roadK = 0
      const runs = seg.station.straights
      if (runs && seg.curve && t < seg.arrive) {
        const travel = seg.arrive - seg.start
        const u = travel > 0 ? (t - seg.start) / travel : 1
        for (const [u0, u1] of runs) {
          if (u >= u0 && u <= u1) {
            roadK = (u - u0) / (u1 - u0)
            road = Math.max(0, ramp(roadK, 0, 0.14) - ramp(roadK, 0.86, 1))
            break
          }
        }
      }
      const roadEl = roadRef.current
      if (roadEl) {
        roadEl.style.opacity = String(road)
        roadEl.style.visibility = road <= 0.01 ? 'hidden' : 'visible'
      }
      const roadVid = roadVideoRef.current
      if (roadVid && road > 0 && roadVid.duration) {
        const target = Math.min(roadK * roadVid.duration, roadVid.duration - 0.03)
        // Half a source frame (16 fps): finer seeks decode to the same image.
        if (!roadVid.seeking && Math.abs(roadVid.currentTime - target) > 1 / 32) {
          roadVid.currentTime = target
        }
      }

      const progress = t / totalUnits
      let cur = ranges[0]
      for (const r of ranges) { if (progress >= r.travelStart) cur = r; else break }
      const dwellSpan = cur.depart - cur.arrive
      const dwellProgress = dwellSpan <= 0
        ? (progress >= cur.arrive ? 1 : 0)
        : Math.min(Math.max((progress - cur.arrive) / dwellSpan, 0), 1)
      if (cur.index !== activeIndexRef.current) {
        activeIndexRef.current = cur.index
        setActiveIndex(cur.index)
      }
      paint(cur.index, dwellProgress, progress >= cur.arrive)
    }

    const tl = gsap.timeline({ paused: true, onUpdate: push })

    // Each segment eases the playhead across its own span, so per-station
    // easing survives while the camera stays a pure function of the playhead.
    segments.forEach((seg, i) => {
      if (i > 0 && seg.arrive > seg.start) {
        tl.to(playhead, {
          t: seg.arrive,
          duration: seg.arrive - seg.start,
          ease: seg.station.ease || 'power2.inOut',
        })
      }
      if (seg.end > seg.arrive) {
        tl.to(playhead, { t: seg.end, duration: seg.end - seg.arrive, ease: 'none' })
      }
    })

    // Paint the opening frame — the aerial — before any scrolling happens.
    push()

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

        {/* Road footage for the straight runs of the drive. Sits under the
            station film and the UI; the corners stay in 3D. */}
        {roadSrc && (
          <div ref={roadRef} className={styles.roadFilm} style={{ opacity: 0, visibility: 'hidden' }}>
            <video
              ref={roadVideoRef}
              src={roadSrc}
              muted
              playsInline
              preload="auto"
              disableRemotePlayback
            />
            <div className={styles.filmVignette} />
            <div className={styles.filmNote}>Artist&rsquo;s impression</div>
          </div>
        )}

        {/* Fullscreen amenity film. Takes the whole screen on arrival and is
            scrubbed by scroll, then hands back to the drive. */}
        <div ref={filmRef} className={styles.film} style={{ opacity: 0, visibility: 'hidden' }}>
          {panoSrc && (
            <>
              <PanoramaStage
                ref={panoRef}
                /* Keyed per station so the texture is rebuilt rather than
                   swapped under a live sphere. */
                key={active?.id}
                src={panoSrc}
                sweep={active?.panoSweep}
                startYaw={active?.panoStart}
              />
              <div className={styles.panoBadge}>360° view</div>
            </>
          )}
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
          {/* Renders and films of an unbuilt project are representations, and
              real-estate advertising has to say so. */}
          <div className={styles.filmNote}>Artist&rsquo;s impression</div>
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
