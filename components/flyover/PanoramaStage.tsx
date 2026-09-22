'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'
import styles from './Flyover.module.css'

export interface PanoramaHandle {
  /** 0-1 across the dwell. Drives the yaw sweep. */
  setView: (u: number) => void
}

interface PanoramaStageProps {
  src: string
  /** Degrees of yaw swept across the dwell. */
  sweep?: number
  /** Yaw the sweep starts from, in degrees. */
  startYaw?: number
}

/**
 * A fullscreen equirectangular panorama the visitor scrolls through.
 *
 * The camera sits at the centre of an inverted sphere, so the render is the
 * real photographic space rather than an approximation of it. Scroll drives
 * yaw, which is what turns a still 360 into a walkthrough beat.
 *
 * This owns its own renderer rather than borrowing the masterplan scene's:
 * the two have completely different cameras and lighting, and swapping a
 * skybox in and out of a lit scene is far more fragile than a second canvas.
 */
const PanoramaStage = forwardRef<PanoramaHandle, PanoramaStageProps>(
  function PanoramaStage({ src, sweep = 150, startYaw = -75 }, ref) {
    const hostRef = useRef<HTMLDivElement>(null)
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
    const yawRef = useRef(startYaw)
    const pitchRef = useRef(0)

    useImperativeHandle(ref, () => ({
      setView(u: number) {
        const k = Math.min(Math.max(u, 0), 1)
        yawRef.current = startYaw + k * sweep
        // A touch of vertical drift stops the sweep reading as a flat pan.
        pitchRef.current = Math.sin(k * Math.PI) * 5
      },
    }), [sweep, startYaw])

    useEffect(() => {
      const host = hostRef.current
      if (!host) return

      const canvas = document.createElement('canvas')
      canvas.style.cssText =
        'position:absolute;inset:0;width:100%;height:100%;display:block'
      host.appendChild(canvas)

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      // No tone mapping. The source is an already-graded LDR render; running
      // ACES over it a second time crushes the highlights and mutes the whole
      // frame. The panorama should look exactly like the file.
      renderer.toneMapping = THREE.NoToneMapping

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 1000)
      cameraRef.current = camera

      // Inverted sphere: negative X scale flips the winding so the texture is
      // seen from the inside without mirroring the image.
      const geo = new THREE.SphereGeometry(500, 64, 40)
      geo.scale(-1, 1, 1)
      const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })
      const sphere = new THREE.Mesh(geo, mat)
      scene.add(sphere)

      let texture: THREE.Texture | null = null
      let disposed = false
      new THREE.TextureLoader().load(src, (tex) => {
        if (disposed) { tex.dispose(); return }
        tex.colorSpace = THREE.SRGBColorSpace
        // The source is only ~1800px around, so trilinear filtering matters:
        // without mipmaps the upscale shimmers badly as the yaw sweeps.
        tex.minFilter = THREE.LinearMipmapLinearFilter
        tex.magFilter = THREE.LinearFilter
        tex.generateMipmaps = true
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
        texture = tex
        mat.map = tex
        mat.opacity = 1
        mat.needsUpdate = true
      })

      let sizedW = 0
      let sizedH = 0
      function resize() {
        const w = host!.clientWidth
        const h = host!.clientHeight
        if (w < 2 || h < 2 || (w === sizedW && h === sizedH)) return
        sizedW = w; sizedH = h
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        renderer.setSize(w, h, false)
      }

      let frame = 0
      const tick = () => {
        frame = requestAnimationFrame(tick)
        resize()
        camera.rotation.order = 'YXZ'
        camera.rotation.y = THREE.MathUtils.degToRad(yawRef.current)
        camera.rotation.x = THREE.MathUtils.degToRad(pitchRef.current)
        renderer.render(scene, camera)
      }
      tick()

      return () => {
        disposed = true
        cancelAnimationFrame(frame)
        geo.dispose()
        mat.dispose()
        texture?.dispose()
        renderer.dispose()
        canvas.remove()
        cameraRef.current = null
      }
    }, [src])

    return <div ref={hostRef} className={styles.panoHost} />
  },
)

export default PanoramaStage
