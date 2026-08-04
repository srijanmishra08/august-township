'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import s from './PanoramaViewer.module.css'

/** Degrees of rotation per pixel dragged. */
const DEG_PER_PIXEL = 0.11
/** Per-frame decay of the look-around glide. */
const FRICTION = 0.93
const MIN_VELOCITY = 0.004
/** Looking past the poles inverts the world, so clamp short of vertical. */
const MAX_PITCH = 85
const MIN_FOV = 32
const MAX_FOV = 90
const DEFAULT_FOV = 72
/** Radius is arbitrary for an inside-out sphere; only the ratio to near/far matters. */
const SPHERE_RADIUS = 50

export interface PanoramaHotspot {
  /** Compass yaw in degrees, 0 = the panorama's centre. */
  yaw: number
  /** Elevation in degrees, negative looks down. */
  pitch: number
  label: string
  /** Amenity name to jump to when activated. */
  target: string
}

interface PanoramaViewerProps {
  /** Equirectangular image, 2:1 aspect, 360x180 coverage. */
  src: string
  title: string
  description?: string
  hotspots?: PanoramaHotspot[]
  onHotspot?: (target: string) => void
  onClose: () => void
}

/**
 * Panoee-style 360 viewer: an equirectangular photo mapped to the inside of a
 * sphere with the camera at its centre. Drag looks around, wheel/pinch zooms
 * by narrowing the field of view, and hotspots are projected from 3D positions
 * to screen space each frame so they stay pinned to the architecture.
 */
export default function PanoramaViewer({
  src,
  title,
  description,
  hotspots = [],
  onHotspot,
  onClose,
}: PanoramaViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [hinted, setHinted] = useState(false)
  // Hotspot screen positions, recomputed per frame.
  const [marks, setMarks] = useState<Array<{ x: number; y: number; visible: boolean }>>([])

  // Look state in refs — mutated per frame.
  const yaw = useRef(0)
  const pitch = useRef(0)
  const velYaw = useRef(0)
  const velPitch = useRef(0)
  const fov = useRef(DEFAULT_FOV)
  const draggingRef = useRef(false)
  const pointerId = useRef<number | null>(null)
  const last = useRef({ x: 0, y: 0 })
  const hotspotsRef = useRef(hotspots)
  hotspotsRef.current = hotspots

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.className = s.canvas
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, 1, 0.1, 200)

    // Sphere flipped inside-out so its texture faces the camera at the centre.
    const geometry = new THREE.SphereGeometry(SPHERE_RADIUS, 64, 40)
    geometry.scale(-1, 1, 1)
    const material = new THREE.MeshBasicMaterial({ color: 0x111111 })
    const sphere = new THREE.Mesh(geometry, material)
    scene.add(sphere)

    let texture: THREE.Texture | null = null
    const loader = new THREE.TextureLoader()
    loader.load(
      src,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        // Equirect images are wide; avoid a visible seam at the wrap point.
        tex.minFilter = THREE.LinearFilter
        tex.generateMipmaps = false
        texture = tex
        material.map = tex
        material.color.set(0xffffff)
        material.needsUpdate = true
        setReady(true)
      },
      undefined,
      () => setFailed(true)
    )

    const resize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      if (w < 2 || h < 2) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h, false)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    const target = new THREE.Vector3()
    const projected = new THREE.Vector3()
    const forward = new THREE.Vector3()
    const toSpot = new THREE.Vector3()

    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)

      if (!draggingRef.current) {
        if (Math.abs(velYaw.current) >= MIN_VELOCITY || Math.abs(velPitch.current) >= MIN_VELOCITY) {
          yaw.current += velYaw.current
          pitch.current = clamp(pitch.current + velPitch.current, -MAX_PITCH, MAX_PITCH)
          velYaw.current *= FRICTION
          velPitch.current *= FRICTION
        } else {
          velYaw.current = 0
          velPitch.current = 0
        }
      }

      // Aim the camera from spherical angles.
      const phi = THREE.MathUtils.degToRad(90 - pitch.current)
      const theta = THREE.MathUtils.degToRad(yaw.current)
      target.setFromSphericalCoords(1, phi, theta)
      camera.lookAt(target)

      if (camera.fov !== fov.current) {
        camera.fov = fov.current
        camera.updateProjectionMatrix()
      }

      renderer.render(scene, camera)

      // Project hotspots to screen space so the DOM markers track the view.
      const list = hotspotsRef.current
      if (list.length) {
        const w = mount.clientWidth
        const h = mount.clientHeight
        const next = list.map((spot) => {
          const p = THREE.MathUtils.degToRad(90 - spot.pitch)
          const t = THREE.MathUtils.degToRad(spot.yaw)
          projected.setFromSphericalCoords(SPHERE_RADIUS * 0.5, p, t)
          // Points behind the camera still project to finite coordinates, but
          // mirrored and enormous. Reject them by direction before trusting x/y.
          toSpot.copy(projected).normalize()
          camera.getWorldDirection(forward)
          const inFront = toSpot.dot(forward) > 0.05
          projected.project(camera)
          const visible =
            inFront && Math.abs(projected.x) <= 1.1 && Math.abs(projected.y) <= 1.1
          return {
            x: (projected.x * 0.5 + 0.5) * w,
            y: (-projected.y * 0.5 + 0.5) * h,
            visible,
          }
        })
        setMarks(next)
      }
    }
    tick()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      geometry.dispose()
      material.dispose()
      texture?.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [src])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function down(e: React.PointerEvent) {
    if (!ready || failed || pointerId.current !== null) return
    pointerId.current = e.pointerId
    last.current = { x: e.clientX, y: e.clientY }
    velYaw.current = 0
    velPitch.current = 0
    draggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    setHinted(true)
  }

  function move(e: React.PointerEvent) {
    if (pointerId.current !== e.pointerId) return
    const dx = e.clientX - last.current.x
    const dy = e.clientY - last.current.y
    last.current = { x: e.clientX, y: e.clientY }
    // Scale by FOV so zoomed-in looking stays proportionally slow.
    const scale = (DEG_PER_PIXEL * fov.current) / DEFAULT_FOV
    const dYaw = -dx * scale
    const dPitch = dy * scale
    yaw.current += dYaw
    pitch.current = clamp(pitch.current + dPitch, -MAX_PITCH, MAX_PITCH)
    velYaw.current = dYaw
    velPitch.current = dPitch
  }

  function up(e: React.PointerEvent) {
    if (pointerId.current !== e.pointerId) return
    pointerId.current = null
    draggingRef.current = false
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    setDragging(false)
  }

  function wheel(e: React.WheelEvent) {
    fov.current = clamp(fov.current + e.deltaY * 0.05, MIN_FOV, MAX_FOV)
  }

  const interactive = ready && !failed

  return (
    <div className={s.backdrop} role="dialog" aria-modal="true" aria-label={`${title} 360 tour`}>
      <button className={s.dismiss} onClick={onClose} aria-label="Close tour">✕</button>

      <div
        ref={mountRef}
        className={`${s.stage} ${dragging ? s.stageDragging : ''} ${interactive ? '' : s.stageInert}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onWheel={wheel}
      >
        {hotspots.map((spot, i) => {
          const mark = marks[i]
          if (!mark?.visible) return null
          return (
            <button
              key={spot.label + i}
              className={s.hotspot}
              style={{ left: mark.x, top: mark.y }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onHotspot?.(spot.target)}
            >
              <span className={s.hotspotDot} />
              <span className={s.hotspotLabel}>{spot.label}</span>
            </button>
          )
        })}

        {!ready && !failed && (
          <div className={s.status}>
            <div className={s.ring} />
            <span>Loading 360 view…</span>
          </div>
        )}
        {failed && (
          <div className={s.status}>
            <span>360 panorama unavailable for this amenity.</span>
          </div>
        )}
        {interactive && !hinted && (
          <div className={s.hint}>
            <span>Drag to look around · scroll to zoom</span>
          </div>
        )}
      </div>

      <div className={s.caption}>
        <div className={s.eyebrow}>360° Tour</div>
        <h2 className={s.title}>{title}</h2>
        {description && <p className={s.body}>{description}</p>}
      </div>
    </div>
  )
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}
