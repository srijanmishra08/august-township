'use client'

import { useEffect, useImperativeHandle, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Amenity3D, Plot3D } from '@/lib/types/plot3d'
import {
  buildAmenityBlocks,
  buildBuildings,
  buildRoads,
  buildTrees,
  buildWalls,
  type Building,
} from '@/lib/massing'

/** Garden platform each house sits on — a kerb, roughly 30 cm at world scale. */
const PLOT_HEIGHT = 0.07

/** Status colours now ride on the buildings; the pads underneath are garden. */
const STATUS_COLOR: Record<string, number> = {
  available: 0xd8d2c6,
  booked: 0xe8c98a,
  sold: 0x8d8578,
  luxury: 0xe4d3a8,
}
const HOVER_COLOR = 0xff8a4c
const SELECTED_COLOR = 0x6fa8ff
const GHOST_COLOR = 0x2a2620

export interface Plot3DSceneHandle {
  resetView: () => void
  /**
   * Drive the camera directly. Only meaningful in `cinematic` mode, where
   * OrbitControls is switched off so it cannot fight the written transform.
   */
  setCamera: (
    pos: readonly [number, number, number],
    target: readonly [number, number, number],
    fov?: number,
  ) => void
}

interface Plot3DSceneProps {
  plots: Plot3D[]
  amenities: Amenity3D[]
  planImage: string
  planSize: { width: number; pdfWidth: number; pdfHeight: number }
  camera: { position: [number, number, number]; target: [number, number, number] }
  /** Ids of plots dimmed out by the active filter. */
  hiddenIds: ReadonlySet<string>
  selectedId: string | null
  /** Preview mode orbits on its own and ignores pointer input. */
  interactive: boolean
  /**
   * Scroll-driven flythrough: no orbit controls, no auto-rotate, camera owned
   * entirely by the caller through `setCamera`.
   */
  cinematic?: boolean
  className?: string
  handleRef?: RefObject<Plot3DSceneHandle | null>
  onHover?: (plot: Plot3D | null, x: number, y: number) => void
  onSelect?: (plot: Plot3D | null) => void
  /** Fired when a marker with a walkthrough clip is clicked. */
  onAmenitySelect?: (amenity: Amenity3D) => void
  onReady?: () => void
}

function buildMaterials() {
  return {
    available: new THREE.MeshStandardMaterial({ color: 0xc8602a, roughness: 0.5, metalness: 0.1 }),
    booked: new THREE.MeshStandardMaterial({ color: 0xe0a800, roughness: 0.5, metalness: 0.1 }),
    sold: new THREE.MeshStandardMaterial({ color: 0x5a5048, roughness: 0.9, metalness: 0.02 }),
    luxury: new THREE.MeshStandardMaterial({
      color: 0x8b6c2a,
      roughness: 0.45,
      metalness: 0.25,
      emissive: new THREE.Color(0x3a2a08),
      emissiveIntensity: 0.2,
    }),
    hover: new THREE.MeshStandardMaterial({
      color: 0xff7840,
      roughness: 0.4,
      emissive: new THREE.Color(0xcc3800),
      emissiveIntensity: 0.4,
    }),
    selected: new THREE.MeshStandardMaterial({
      color: 0x4a90ff,
      roughness: 0.4,
      emissive: new THREE.Color(0x1a44cc),
      emissiveIntensity: 0.5,
    }),
    ghost: new THREE.MeshStandardMaterial({
      color: 0x2a2218,
      roughness: 1,
      transparent: true,
      opacity: 0.15,
    }),
  }
}

type Materials = ReturnType<typeof buildMaterials>

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

/** Label sprite drawn to a canvas texture, matching the standalone prototype. */
function amenitySprite(name: string, clickable = false): THREE.Sprite {
  const cv = document.createElement('canvas')
  cv.width = 256
  cv.height = 80
  const ctx = cv.getContext('2d')!
  ctx.clearRect(0, 0, 256, 80)
  ctx.fillStyle = clickable ? 'rgba(28,20,12,0.9)' : 'rgba(20,18,14,0.82)'
  roundRect(ctx, 4, 10, 248, 60, 8)
  ctx.fill()
  ctx.strokeStyle = clickable ? 'rgba(232,149,109,0.55)' : 'rgba(255,255,255,0.18)'
  ctx.lineWidth = clickable ? 1.5 : 1
  roundRect(ctx, 4, 10, 248, 60, 8)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = 'bold 22px sans-serif'
  ctx.textAlign = 'center'
  // Play glyph marks the markers that open a walkthrough.
  ctx.fillText(clickable ? `▶  ${name}` : name, 128, 50)

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cv),
      transparent: true,
      depthTest: false,
    })
  )
  sprite.scale.set(4.5, 1.4, 1)
  return sprite
}

/**
 * Recolours the ground plan so the architect's white-background PDF export
 * reads as a dark ochre underlay instead of a bright rectangle.
 */
function invertPlanToDark(img: HTMLImageElement): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = img.width
  cv.height = img.height
  const ctx = cv.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, cv.width, cv.height)
  const px = data.data
  for (let i = 0; i < px.length; i += 4) {
    px[i] = Math.floor((255 - px[i]) * 0.22 + 8)
    px[i + 1] = Math.floor((255 - px[i + 1]) * 0.18 + 6)
    px[i + 2] = Math.floor((255 - px[i + 2]) * 0.12 + 4)
    if (px[i] > 30) {
      px[i] = Math.min(255, px[i] * 1.6) | 0
      px[i + 1] = Math.min(255, px[i + 1] * 1.5) | 0
    }
  }
  ctx.putImageData(data, 0, 0)
  return new THREE.CanvasTexture(cv)
}

export default function Plot3DScene({
  plots,
  amenities,
  planImage,
  planSize,
  camera: cameraConfig,
  hiddenIds,
  selectedId,
  interactive,
  cinematic = false,
  className,
  handleRef,
  onHover,
  onSelect,
  onAmenitySelect,
  onReady,
}: Plot3DSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const meshesRef = useRef<THREE.Mesh[]>([])
  const meshByIdRef = useRef<Record<string, THREE.Mesh>>({})
  const materialsRef = useRef<Materials | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  /** Plot id under the cursor. Buildings occlude the pads, so hover is tracked
   *  by id rather than by mesh. */
  const hoveredRef = useRef<string | null>(null)
  // Buildings live in one InstancedMesh, so status/hover/selection are colour
  // writes on a single attribute rather than 125 material swaps.
  const bodyMeshRef = useRef<THREE.InstancedMesh | null>(null)
  const roofMeshRef = useRef<THREE.InstancedMesh | null>(null)
  const buildingsRef = useRef<Building[]>([])
  const instanceByPlotRef = useRef<Record<string, number>>({})

  // Latest-value refs so the scene can stay mounted across prop changes.
  const plotsRef = useRef(plots)
  plotsRef.current = plots
  const hiddenRef = useRef(hiddenIds)
  hiddenRef.current = hiddenIds
  const selectedRef = useRef(selectedId)
  selectedRef.current = selectedId
  const interactiveRef = useRef(interactive)
  interactiveRef.current = interactive
  const cinematicRef = useRef(cinematic)
  cinematicRef.current = cinematic
  const onHoverRef = useRef(onHover)
  onHoverRef.current = onHover
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onAmenitySelectRef = useRef(onAmenitySelect)
  onAmenitySelectRef.current = onAmenitySelect
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useImperativeHandle(handleRef, () => ({
    resetView() {
      const controls = controlsRef.current
      const camera = cameraRef.current
      if (!controls || !camera) return
      camera.position.set(...cameraConfig.position)
      controls.target.set(...cameraConfig.target)
      controls.update()
    },
    setCamera(pos, target, fov) {
      const camera = cameraRef.current
      if (!camera) return
      camera.position.set(pos[0], pos[1], pos[2])
      camera.lookAt(target[0], target[1], target[2])
      if (fov !== undefined && Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
      // Keep the orbit target in sync so handing control back after the
      // flythrough doesn't snap the view somewhere unexpected.
      controlsRef.current?.target.set(target[0], target[1], target[2])
    },
  }))

  /** Colour a single building given filter, selection and hover state. */
  function buildingColor(b: Building): number {
    if (hiddenRef.current.has(b.plotId)) return GHOST_COLOR
    if (b.plotId === selectedRef.current) return SELECTED_COLOR
    if (b.plotId === hoveredRef.current) return HOVER_COLOR
    return b.sector === 'L' ? STATUS_COLOR.luxury : STATUS_COLOR[b.status] ?? STATUS_COLOR.available
  }

  function repaintAll() {
    const body = bodyMeshRef.current
    const roof = roofMeshRef.current
    const buildings = buildingsRef.current
    if (!body || buildings.length === 0) return

    const c = new THREE.Color()
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i]
      c.setHex(buildingColor(b))
      // A touch of per-instance warmth so a street of "available" homes still
      // reads as individual houses rather than one extruded blob.
      if (!hiddenRef.current.has(b.plotId) && b.plotId !== selectedRef.current
        && b.plotId !== hoveredRef.current) {
        c.offsetHSL(0, 0, (b.tone - 0.5) * 0.06)
      }
      body.setColorAt(i, c)
      roof?.setColorAt(i, c.multiplyScalar(0.72))
    }
    if (body.instanceColor) body.instanceColor.needsUpdate = true
    if (roof?.instanceColor) roof.instanceColor.needsUpdate = true
  }

  // Build the scene once. Prop-driven state is pushed in by the effects below.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;touch-action:none'
    container.appendChild(canvas)

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05

    const scene = new THREE.Scene()
    // A vertical gradient rather than a flat fill: at eye level the horizon
    // takes up half the frame, and a solid colour there reads as a dead void.
    const skyCv = document.createElement('canvas')
    skyCv.width = 4
    skyCv.height = 256
    const skyCtx = skyCv.getContext('2d')!
    const grad = skyCtx.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0.0, '#070a12')
    grad.addColorStop(0.30, '#141d2b')
    grad.addColorStop(0.44, '#3d4433')
    // The horizon band has to be the same colour the fog resolves to, or the
    // ground plane's far edge meets the sky as a hard dark seam.
    grad.addColorStop(0.50, '#6b5c40')
    grad.addColorStop(0.58, '#4a4033')
    grad.addColorStop(1.0, '#241f18')
    skyCtx.fillStyle = grad
    skyCtx.fillRect(0, 0, 4, 256)
    const skyTex = new THREE.CanvasTexture(skyCv)
    skyTex.colorSpace = THREE.SRGBColorSpace
    scene.background = skyTex
    scene.fog = new THREE.FogExp2(0x4a4033, 0.009)

    const width = Math.max(container.clientWidth, 2)
    const height = Math.max(container.clientHeight, 2)

    const camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 500)
    camera.position.set(...cameraConfig.position)
    cameraRef.current = camera
    renderer.setSize(width, height, false)

    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.045
    controls.minPolarAngle = 0.12
    controls.maxPolarAngle = Math.PI / 2 - 0.06
    controls.minDistance = 6
    controls.maxDistance = 180
    controls.screenSpacePanning = false
    controls.target.set(...cameraConfig.target)
    controls.enabled = interactiveRef.current && !cinematicRef.current
    controls.autoRotate = !interactiveRef.current && !cinematicRef.current
    controls.autoRotateSpeed = 0.45
    controls.update()
    controlsRef.current = controls

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const sun = new THREE.DirectionalLight(0xfff5e0, 2.0)
    sun.position.set(20, 60, 25)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -80
    sun.shadow.camera.right = 80
    sun.shadow.camera.top = 60
    sun.shadow.camera.bottom = -60
    sun.shadow.camera.far = 200
    sun.shadow.bias = -0.001
    scene.add(sun)
    const fill = new THREE.DirectionalLight(0xc8daff, 0.45)
    fill.position.set(-25, 40, -20)
    scene.add(fill)

    // Everything disposable is tracked here so unmount can free GPU memory.
    const geometries: THREE.BufferGeometry[] = []
    const materials: THREE.Material[] = []
    const textures: THREE.Texture[] = [skyTex]

    const baseGeo = new THREE.PlaneGeometry(400, 400)
    // Asphalt rather than near-black: at street level this is the road surface,
    // and it has to catch enough light to read as ground.
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x2b2723, roughness: 0.95 })
    const base = new THREE.Mesh(baseGeo, baseMat)
    base.rotation.x = -Math.PI / 2
    base.position.y = -0.05
    base.receiveShadow = true
    scene.add(base)
    geometries.push(baseGeo)
    materials.push(baseMat)

    const planWidth = planSize.width
    const planHeight = (planWidth * planSize.pdfHeight) / planSize.pdfWidth
    const planGeo = new THREE.PlaneGeometry(planWidth, planHeight)
    const planMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
    const plan = new THREE.Mesh(planGeo, planMat)
    plan.rotation.x = -Math.PI / 2
    plan.position.y = 0.01
    scene.add(plan)
    geometries.push(planGeo)
    materials.push(planMat)

    // The plan underlay is optional — a missing file just leaves the dark ground.
    let planImg: HTMLImageElement | null = new Image()
    planImg.crossOrigin = 'anonymous'
    planImg.onload = () => {
      if (!planImg) return
      const tex = invertPlanToDark(planImg)
      textures.push(tex)
      planMat.map = tex
      // Faint. From above it orients the eye; at street level a full-strength
      // architectural drawing under your feet reads as patterned carpet.
      planMat.opacity = 0.2
      planMat.needsUpdate = true
    }
    planImg.onerror = () => {
      planMat.color = new THREE.Color(0x1c1812)
      planMat.opacity = 1
      planMat.needsUpdate = true
    }
    planImg.src = planImage

    const mats = buildMaterials()
    materialsRef.current = mats
    materials.push(...Object.values(mats))

    // Plot pads are now the garden each house sits in, so they read as ground
    // rather than as the product. Status colour moved onto the buildings.
    const gardenMat = new THREE.MeshStandardMaterial({ color: 0x2f3a26, roughness: 0.95 })
    materials.push(gardenMat)

    const meshes: THREE.Mesh[] = []
    const byId: Record<string, THREE.Mesh> = {}
    for (const plot of plotsRef.current) {
      const geo = new THREE.BoxGeometry(plot.width, PLOT_HEIGHT, plot.depth)
      geometries.push(geo)
      const mesh = new THREE.Mesh(geo, gardenMat)
      mesh.position.set(plot.cx, PLOT_HEIGHT / 2, plot.cz)
      mesh.receiveShadow = true
      mesh.userData = { plotId: plot.id, status: plot.status, sector: plot.sector }
      scene.add(mesh)
      meshes.push(mesh)
      byId[plot.id] = mesh
    }
    meshesRef.current = meshes
    meshByIdRef.current = byId

    /* ---------- procedural massing ---------- */
    // The source layout carries footprints only. Villas, roofs, boundary walls
    // and street planting are derived from those footprints so the site reads
    // as a township at eye level instead of as coloured tiles.
    const buildings = [
      ...buildBuildings(plotsRef.current),
      ...buildAmenityBlocks(amenities),
    ]
    buildingsRef.current = buildings
    const instanceByPlot: Record<string, number> = {}
    buildings.forEach((b, i) => { instanceByPlot[b.plotId] = i })
    instanceByPlotRef.current = instanceByPlot

    const dummy = new THREE.Object3D()

    const bodyGeo = new THREE.BoxGeometry(1, 1, 1)
    const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.04 })
    const bodyMesh = new THREE.InstancedMesh(bodyGeo, bodyMat, buildings.length)
    bodyMesh.castShadow = true
    bodyMesh.receiveShadow = true

    // ConeGeometry with 4 segments and radius √½ has a unit square base, so the
    // instance scale maps straight to the building footprint.
    const roofGeo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4)
    roofGeo.rotateY(Math.PI / 4)
    const roofMat = new THREE.MeshStandardMaterial({ roughness: 0.85 })
    const roofMesh = new THREE.InstancedMesh(roofGeo, roofMat, buildings.length)
    roofMesh.castShadow = true

    buildings.forEach((b, i) => {
      dummy.position.set(b.cx, PLOT_HEIGHT + b.height / 2, b.cz)
      dummy.rotation.set(0, b.rotY, 0)
      dummy.scale.set(b.width, b.height, b.depth)
      dummy.updateMatrix()
      bodyMesh.setMatrixAt(i, dummy.matrix)

      // Flat-roofed stock still gets a shallow cap; a bare box reads unfinished.
      const roofH = b.roof > 0 ? b.roof : 0.28
      dummy.position.set(b.cx, PLOT_HEIGHT + b.height + roofH / 2, b.cz)
      dummy.scale.set(b.width * 1.07, roofH, b.depth * 1.07)
      dummy.updateMatrix()
      roofMesh.setMatrixAt(i, dummy.matrix)
    })
    bodyMesh.instanceMatrix.needsUpdate = true
    roofMesh.instanceMatrix.needsUpdate = true
    scene.add(bodyMesh, roofMesh)
    bodyMeshRef.current = bodyMesh
    roofMeshRef.current = roofMesh
    geometries.push(bodyGeo, roofGeo)
    materials.push(bodyMat, roofMat)

    // Carriageway, laid just above the ground plane. Without it the street the
    // camera drives down is indistinguishable from the empty ground either side.
    const roads = buildRoads(plotsRef.current)
    const roadGeo = new THREE.PlaneGeometry(1, 1)
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x554e45,
      roughness: 0.88,
    })
    const roadMesh = new THREE.InstancedMesh(roadGeo, roadMat, roads.length)
    roadMesh.receiveShadow = true
    roads.forEach((r, i) => {
      dummy.position.set(r.cx, 0.012, r.cz)
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      // Overlap slightly so adjacent runs do not leave hairline seams.
      dummy.scale.set(r.width * 1.02, r.depth * 1.6, 1)
      dummy.updateMatrix()
      roadMesh.setMatrixAt(i, dummy.matrix)
    })
    roadMesh.instanceMatrix.needsUpdate = true
    scene.add(roadMesh)
    geometries.push(roadGeo)
    materials.push(roadMat)

    const walls = buildWalls(plotsRef.current)
    const wallGeo = new THREE.BoxGeometry(1, 1, 1)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 0.9 })
    const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, walls.length)
    wallMesh.receiveShadow = true
    walls.forEach((w, i) => {
      dummy.position.set(w.cx, PLOT_HEIGHT + w.height / 2, w.cz)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(w.width, w.height, w.depth)
      dummy.updateMatrix()
      wallMesh.setMatrixAt(i, dummy.matrix)
    })
    wallMesh.instanceMatrix.needsUpdate = true
    scene.add(wallMesh)
    geometries.push(wallGeo)
    materials.push(wallMat)

    const trees = buildTrees(plotsRef.current)
    const trunkGeo = new THREE.CylinderGeometry(0.045, 0.065, 1, 5)
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 })
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length)
    const canopyGeo = new THREE.IcosahedronGeometry(1, 0)
    const canopyMat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true })
    const canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, trees.length)
    canopyMesh.castShadow = true
    const canopyColor = new THREE.Color()
    trees.forEach((t, i) => {
      const trunkH = t.height * 0.45
      dummy.rotation.set(0, t.tone * Math.PI, 0)
      dummy.position.set(t.x, trunkH / 2, t.z)
      dummy.scale.set(1, trunkH, 1)
      dummy.updateMatrix()
      trunkMesh.setMatrixAt(i, dummy.matrix)

      dummy.position.set(t.x, trunkH + t.radius * 0.85, t.z)
      dummy.scale.set(t.radius, t.radius * 1.15, t.radius)
      dummy.updateMatrix()
      canopyMesh.setMatrixAt(i, dummy.matrix)
      canopyColor.setHSL(0.24 + t.tone * 0.05, 0.34, 0.17 + t.tone * 0.1)
      canopyMesh.setColorAt(i, canopyColor)
    })
    trunkMesh.instanceMatrix.needsUpdate = true
    canopyMesh.instanceMatrix.needsUpdate = true
    if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true
    scene.add(trunkMesh, canopyMesh)
    geometries.push(trunkGeo, canopyGeo)
    materials.push(trunkMat, canopyMat)

    // Only markers with a clip are pickable, so nothing invites a dead click.
    const amenityTargets: THREE.Object3D[] = []
    for (const amenity of amenities) {
      const color = new THREE.Color(parseInt(amenity.color.replace(/^0x/i, ''), 16))
      const clickable = Boolean(amenity.video || amenity.panorama)
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.6,
        emissive: color.clone().multiplyScalar(clickable ? 0.45 : 0.3),
        emissiveIntensity: clickable ? 0.7 : 0.5,
      })
      const geo = new THREE.CylinderGeometry(0.35, 0.45, 0.45, 6)
      const marker = new THREE.Mesh(geo, mat)
      marker.position.set(amenity.cx, 0.22, amenity.cz)
      marker.castShadow = true
      marker.userData = { amenity: clickable ? amenity : null, baseY: 0.22 }
      scene.add(marker)
      geometries.push(geo)
      materials.push(mat)

      const sprite = amenitySprite(amenity.name, clickable)
      // Labels are a third-person wayfinding affordance. At eye level they
      // billboard straight into the lens and break the shot, so the cinematic
      // camera runs without them.
      sprite.visible = !cinematicRef.current
      sprite.position.set(amenity.cx, 1.6, amenity.cz)
      sprite.userData = { amenity: clickable ? amenity : null }
      scene.add(sprite)
      materials.push(sprite.material)
      if (sprite.material.map) textures.push(sprite.material.map)

      if (clickable) {
        amenityTargets.push(marker, sprite)
        // An invisible collar widens the hit area — the cylinder alone is a
        // very small target once the camera pulls back. It floats clear of
        // PLOT_H so it cannot swallow clicks on plots beside the marker,
        // which are tested after amenities.
        const hitGeo = new THREE.CylinderGeometry(0.8, 0.8, 1.8, 8)
        const hitMat = new THREE.MeshBasicMaterial({ visible: false })
        const hit = new THREE.Mesh(hitGeo, hitMat)
        hit.position.set(amenity.cx, PLOT_HEIGHT + 0.9, amenity.cz)
        hit.userData = { amenity }
        scene.add(hit)
        geometries.push(hitGeo)
        materials.push(hitMat)
        amenityTargets.push(hit)
      }
    }

    repaintAll()

    /* ---------- pointer interaction ---------- */
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2(-9, -9)
    let downX = 0
    let downY = 0
    let dragged = false

    function aimAt(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect()
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
    }

    /** Returns the plot id under the cursor, from the building or its garden. */
    function pickAt(clientX: number, clientY: number): string | null {
      aimAt(clientX, clientY)
      const hits = raycaster.intersectObjects([bodyMesh, roofMesh, ...meshes], false)
      for (const hit of hits) {
        let id: string | undefined
        if (hit.object === bodyMesh || hit.object === roofMesh) {
          const b = hit.instanceId !== undefined ? buildings[hit.instanceId] : undefined
          // Amenity blocks are not for sale, so they are not plot targets.
          if (b && !b.plotId.startsWith('amenity:')) id = b.plotId
        } else {
          id = (hit.object as THREE.Mesh).userData.plotId as string | undefined
        }
        if (id && !hiddenRef.current.has(id)) return id
      }
      return null
    }

    /** Amenities sit above the plots, so they win when both are under the cursor. */
    function pickAmenityAt(clientX: number, clientY: number): Amenity3D | null {
      if (!amenityTargets.length) return null
      aimAt(clientX, clientY)
      const hits = raycaster.intersectObjects(amenityTargets, false)
      for (const hit of hits) {
        const found = hit.object.userData?.amenity as Amenity3D | null | undefined
        if (found) return found
      }
      return null
    }

    let liftedMarker: THREE.Mesh | null = null
    function setMarkerHover(amenity: Amenity3D | null) {
      // Nudge the matching marker upward so the hover target is unambiguous.
      if (liftedMarker) {
        liftedMarker.position.y = liftedMarker.userData.baseY as number
        liftedMarker = null
      }
      if (!amenity) return
      const marker = amenityTargets.find(
        (o) => o.userData?.amenity === amenity && o.userData?.baseY !== undefined
      ) as THREE.Mesh | undefined
      if (marker) {
        marker.position.y = (marker.userData.baseY as number) + 0.28
        liftedMarker = marker
      }
    }

    function setHover(plotId: string | null) {
      if (hoveredRef.current === plotId) return
      hoveredRef.current = plotId
      repaintAll()
    }

    function handleMove(e: PointerEvent) {
      if (!interactiveRef.current) return
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) dragged = true

      const amenity = pickAmenityAt(e.clientX, e.clientY)
      setMarkerHover(amenity)
      if (amenity) {
        setHover(null)
        canvas.style.cursor = 'pointer'
        onHoverRef.current?.(null, 0, 0)
        return
      }

      const plotId = pickAt(e.clientX, e.clientY)
      setHover(plotId)
      canvas.style.cursor = plotId ? 'pointer' : ''
      if (plotId) {
        const rect = container!.getBoundingClientRect()
        const plot = plotsRef.current.find((p) => p.id === plotId) ?? null
        onHoverRef.current?.(plot, e.clientX - rect.left, e.clientY - rect.top)
      } else {
        onHoverRef.current?.(null, 0, 0)
      }
    }

    function handleDown(e: PointerEvent) {
      downX = e.clientX
      downY = e.clientY
      dragged = false
    }

    function handleUp(e: PointerEvent) {
      if (!interactiveRef.current || dragged) return

      const amenity = pickAmenityAt(e.clientX, e.clientY)
      if (amenity) {
        onAmenitySelectRef.current?.(amenity)
        return
      }

      const plotId = pickAt(e.clientX, e.clientY)
      const plot = plotId ? plotsRef.current.find((p) => p.id === plotId) ?? null : null
      onSelectRef.current?.(plot)
    }

    function handleLeave() {
      setHover(null)
      setMarkerHover(null)
      canvas.style.cursor = ''
      onHoverRef.current?.(null, 0, 0)
    }

    canvas.addEventListener('pointermove', handleMove, { passive: true })
    canvas.addEventListener('pointerdown', handleDown)
    canvas.addEventListener('pointerup', handleUp)
    canvas.addEventListener('pointerleave', handleLeave)

    /* ---------- resize ---------- */
    // A collapsed container would otherwise produce an infinite aspect ratio
    // and a 1px drawing buffer; skip until it has real layout.
    let sizedW = 0
    let sizedH = 0
    const resize = () => {
      const w = container!.clientWidth
      const h = container!.clientHeight
      if (w < 2 || h < 2) return
      if (w === sizedW && h === sizedH) return
      sizedW = w
      sizedH = h
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(w, h, false)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    // The renderer sized itself from the container's first-paint layout. If the
    // container had not settled yet (sticky/flex parents commonly have not),
    // that size is wrong and no resize event follows, leaving the canvas
    // covering only part of the viewport. Re-measure once layout is real.
    const rafResize = requestAnimationFrame(() => {
      resize()
      requestAnimationFrame(resize)
    })

    /* ---------- render loop ---------- */
    let frame = 0
    let painted = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      // Authoritative sizing. A ResizeObserver alone is not enough here: when
      // the scene mounts inside a container that has no layout yet, the growth
      // callback can be missed entirely and the renderer stays at its 2px
      // fallback while the canvas element stretches to fill the viewport.
      // The comparison is two integer reads, so polling costs nothing.
      resize()
      // In cinematic mode the caller owns the camera; letting controls damp
      // toward its own target here would drag the shot off the path.
      if (!cinematicRef.current) controls.update()
      renderer.render(scene, camera)
      // Report ready once the first frames are genuinely on screen.
      if (painted < 4 && ++painted === 4) onReadyRef.current?.()
    }
    tick()

    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(rafResize)
      observer.disconnect()
      canvas.removeEventListener('pointermove', handleMove)
      canvas.removeEventListener('pointerdown', handleDown)
      canvas.removeEventListener('pointerup', handleUp)
      canvas.removeEventListener('pointerleave', handleLeave)
      if (planImg) {
        planImg.onload = null
        planImg.onerror = null
        planImg = null
      }
      controls.dispose()
      for (const g of geometries) g.dispose()
      for (const m of materials) m.dispose()
      for (const t of textures) t.dispose()
      renderer.dispose()
      canvas.remove()
      meshesRef.current = []
      meshByIdRef.current = {}
      materialsRef.current = null
      controlsRef.current = null
      cameraRef.current = null
      hoveredRef.current = null
    }
    // Scene is built once; live updates arrive through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Filter / selection changes only need a repaint, never a rebuild.
  useEffect(() => {
    repaintAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenIds, selectedId])

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    controls.enabled = interactive && !cinematic
    controls.autoRotate = !interactive && !cinematic
    if (!interactive) {
      hoveredRef.current = null
      repaintAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, cinematic])

  return <div ref={containerRef} className={className} />
}
