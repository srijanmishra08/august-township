import type { Amenity3D, Plot3D } from '@/lib/types/plot3d'

/**
 * Procedural building massing for the 3D masterplan.
 *
 * The source layout only carries plot footprints — flat pads roughly a third of
 * a unit tall. At eye level that reads as coloured tiles on a plan, not a
 * township, so this derives villa volumes, roofs, boundary walls and street
 * planting from the footprints themselves.
 *
 * Everything is deterministic: the same layout always produces the same town.
 * Variation comes from a hash of each plot id, never from Math.random, so the
 * server and client agree and a reload doesn't reshuffle the skyline.
 */

/** FNV-1a. Cheap, well-distributed, and stable across runs. */
function hash(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Deterministic 0-1 stream seeded from a plot id. */
function rng(seed: number) {
  let s = seed || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
}

export interface Building {
  plotId: string
  status: Plot3D['status']
  sector: Plot3D['sector']
  /** Footprint centre and size, already inset from the plot boundary. */
  cx: number
  cz: number
  width: number
  depth: number
  /** Wall height, excluding the roof. */
  height: number
  /** Roof apex height above the wall top. 0 = flat roof with a parapet. */
  roof: number
  rotY: number
  /** 0-1 warm/cool tint selector, so the town isn't monochrome. */
  tone: number
}

export interface Tree {
  x: number
  z: number
  /** Overall canopy height. */
  height: number
  radius: number
  tone: number
}

export interface Wall {
  cx: number
  cz: number
  width: number
  depth: number
  height: number
}

/**
 * World scale. Plots run about 2.3 × 1.4 units; for a plotted township that is
 * roughly a 10 m × 6 m frontage, so one unit is ~4.5 m. Every dimension below
 * is derived from that — get it wrong and two-storey homes come out as towers.
 */
const METRE = 1 / 4.5
const STOREY = 3.0 * METRE
const EAVES_WALL = 1.4 * METRE

/**
 * One villa per plot.
 *
 * Footprints are inset so every house keeps a garden strip, which is what
 * separates a township from a wall of terraces. Height follows the sector —
 * luxury plots carry an extra storey — with small deterministic jitter so
 * rooflines aren't machined flat.
 */
export function buildBuildings(plots: Plot3D[]): Building[] {
  const out: Building[] = []
  for (const plot of plots) {
    const rand = rng(hash(plot.id))
    const short = Math.min(plot.width, plot.depth)

    // Garden setback, wider on generous plots but never swallowing small ones.
    const setback = Math.min(short * 0.16, 0.4)
    const width = Math.max(0.6, plot.width - setback * 2)
    const depth = Math.max(0.6, plot.depth - setback * 2)

    const storeys = plot.sector === 'L' ? 3 : rand() > 0.78 ? 3 : 2
    const height = storeys * STOREY * (0.94 + rand() * 0.12)

    // A quarter of the stock gets a flat roof + parapet for silhouette variety.
    const flat = rand() > 0.74
    const roof = flat ? 0 : (0.9 + rand() * 0.8) * METRE * 2

    // Nudge the house off dead-centre so the plot reads as having a frontage.
    const shiftX = (rand() - 0.5) * setback * 0.5
    const shiftZ = (rand() - 0.5) * setback * 0.5

    out.push({
      plotId: plot.id,
      status: plot.status,
      sector: plot.sector,
      cx: plot.cx + shiftX,
      cz: plot.cz + shiftZ,
      width,
      depth,
      height,
      roof,
      // A degree or two of slop reads as hand-built rather than stamped.
      rotY: (rand() - 0.5) * 0.035,
      tone: rand(),
    })
  }
  return out
}

/**
 * Larger volumes for the amenities.
 *
 * Amenities carry only a point in the source data, so footprints are inferred
 * from what the space is: a hall needs bulk, a court needs none at all.
 */
export function buildAmenityBlocks(amenities: Amenity3D[]): Building[] {
  // Metres, converted below — clubhouse-scale volumes, not villa-scale.
  const SPEC: Record<string, { w: number; d: number; h: number; roof: number }> = {
    'M-Purpose Court': { w: 30, d: 19, h: 8.5, roof: 2.4 },
    'Green Gym': { w: 18, d: 13, h: 5.5, roof: 0 },
    'Sit Out Park': { w: 14, d: 10, h: 3.8, roof: 1.6 },
    'Kids Play': { w: 12, d: 10, h: 3.4, roof: 1.4 },
  }
  const out: Building[] = []
  for (const a of amenities) {
    const spec = SPEC[a.name]
    if (!spec) continue // Open-air amenities stay open.
    const rand = rng(hash(a.name))
    out.push({
      plotId: `amenity:${a.name}`,
      status: 'available',
      sector: 'L',
      cx: a.cx,
      cz: a.cz,
      width: spec.w * METRE,
      depth: spec.d * METRE,
      height: spec.h * METRE,
      roof: spec.roof * METRE,
      rotY: (rand() - 0.5) * 0.02,
      tone: 0.5,
    })
  }
  return out
}

/** Low boundary walls along each plot edge, which is what makes streets read. */
export function buildWalls(plots: Plot3D[]): Wall[] {
  const out: Wall[] = []
  const T = 0.2 * METRE
  const H = EAVES_WALL
  for (const plot of plots) {
    const hw = plot.width / 2
    const hd = plot.depth / 2
    out.push({ cx: plot.cx, cz: plot.cz - hd, width: plot.width, depth: T, height: H })
    out.push({ cx: plot.cx, cz: plot.cz + hd, width: plot.width, depth: T, height: H })
    out.push({ cx: plot.cx - hw, cz: plot.cz, width: T, depth: plot.depth, height: H })
    out.push({ cx: plot.cx + hw, cz: plot.cz, width: T, depth: plot.depth, height: H })
  }
  return out
}

export interface Occupancy {
  cell: number
  x0: number
  z0: number
  w: number
  h: number
  blocked: Uint8Array
  at: (gx: number, gz: number) => boolean
}

/** Rasterised plot footprints. Exposed for road/space queries. */
export function occupancy(plots: Plot3D[], cell = 0.6, pad = 6): Occupancy {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const p of plots) {
    minX = Math.min(minX, p.cx - p.width / 2)
    maxX = Math.max(maxX, p.cx + p.width / 2)
    minZ = Math.min(minZ, p.cz - p.depth / 2)
    maxZ = Math.max(maxZ, p.cz + p.depth / 2)
  }
  const x0 = minX - pad
  const z0 = minZ - pad
  const w = Math.ceil((maxX + pad - x0) / cell)
  const h = Math.ceil((maxZ + pad - z0) / cell)
  const blocked = new Uint8Array(w * h)
  for (const p of plots) {
    const gx0 = Math.max(0, Math.floor((p.cx - p.width / 2 - x0) / cell))
    const gx1 = Math.min(w - 1, Math.ceil((p.cx + p.width / 2 - x0) / cell))
    const gz0 = Math.max(0, Math.floor((p.cz - p.depth / 2 - z0) / cell))
    const gz1 = Math.min(h - 1, Math.ceil((p.cz + p.depth / 2 - z0) / cell))
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) blocked[gz * w + gx] = 1
    }
  }
  return {
    cell, x0, z0, w, h, blocked,
    at: (gx, gz) => (gx < 0 || gz < 0 || gx >= w || gz >= h ? true : blocked[gz * w + gx] === 1),
  }
}

export interface Road {
  cx: number
  cz: number
  width: number
  depth: number
}

/**
 * The road network.
 *
 * There is no carriageway in the source data — roads are only the negative
 * space between plots, which is why the ground reads as one flat void. This
 * marks the open cells that sit within a short reach of built ground (the
 * corridors, not the open countryside beyond the site) and merges each row
 * into runs, so the whole network draws as a few hundred quads.
 */
export function buildRoads(plots: Plot3D[], reachUnits = 1.6): Road[] {
  const grid = occupancy(plots, 0.5, 3)
  const reach = Math.max(1, Math.round(reachUnits / grid.cell))
  const out: Road[] = []

  for (let gz = 0; gz < grid.h; gz++) {
    let runStart = -1
    for (let gx = 0; gx <= grid.w; gx++) {
      let isRoad = false
      if (gx < grid.w && !grid.at(gx, gz)) {
        // Near built ground on at least one side — that makes it a street
        // rather than the empty margin around the site.
        for (let d = 1; d <= reach && !isRoad; d++) {
          if (
            grid.at(gx + d, gz) || grid.at(gx - d, gz) ||
            grid.at(gx, gz + d) || grid.at(gx, gz - d)
          ) isRoad = true
        }
      }

      if (isRoad && runStart < 0) runStart = gx
      if (!isRoad && runStart >= 0) {
        const cells = gx - runStart
        out.push({
          cx: grid.x0 + (runStart + cells / 2) * grid.cell,
          cz: grid.z0 + (gz + 0.5) * grid.cell,
          width: cells * grid.cell,
          depth: grid.cell,
        })
        runStart = -1
      }
    }
  }
  return out
}

/**
 * Garden planting.
 *
 * Trees go inside the plot boundary, in the setback strip between the wall and
 * the house. Planting them in the open space instead would look like a park
 * from above, but the roads here are only a unit or two wide — trees placed
 * there end up standing in the middle of the carriageway the camera drives
 * down. Garden trees give the same leafy street canopy and can never block it.
 */
export function buildTrees(plots: Plot3D[]): Tree[] {
  const out: Tree[] = []

  for (const plot of plots) {
    const rand = rng(hash(`tree:${plot.id}`))
    const short = Math.min(plot.width, plot.depth)
    const setback = Math.min(short * 0.16, 0.4)

    // Half-extent of the house, so planting never lands on the roof.
    const houseHalfW = Math.max(0.6, plot.width - setback * 2) / 2
    const houseHalfD = Math.max(0.6, plot.depth - setback * 2) / 2

    const count = rand() > 0.5 ? 2 : 1
    for (let i = 0; i < count; i++) {
      // Pick a side, then sit in that side's setback strip.
      const side = Math.floor(rand() * 4)
      const along = (rand() - 0.5) * 0.78
      const inset = (0.6 + rand() * 0.9) * METRE

      let dx = 0
      let dz = 0
      if (side === 0) { dx = along * plot.width; dz = -(houseHalfD + inset) }
      else if (side === 1) { dx = along * plot.width; dz = houseHalfD + inset }
      else if (side === 2) { dx = -(houseHalfW + inset); dz = along * plot.depth }
      else { dx = houseHalfW + inset; dz = along * plot.depth }

      // Stay inside the boundary wall.
      const maxX = plot.width / 2 - 0.06
      const maxZ = plot.depth / 2 - 0.06
      dx = Math.min(Math.max(dx, -maxX), maxX)
      dz = Math.min(Math.max(dz, -maxZ), maxZ)

      out.push({
        x: plot.cx + dx,
        z: plot.cz + dz,
        // 6-10 m garden trees.
        height: (6 + rand() * 4) * METRE,
        radius: (2.2 + rand() * 1.4) * METRE,
        tone: rand(),
      })
    }
  }
  return out
}
