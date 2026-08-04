/**
 * Generate synthetic walkthrough demo data for august-township.
 * Writes plots-seed.json and plots-geometry.geojson.
 * Deterministic: same output every run. Re-run after tweaking constants below.
 *
 * Usage: node --experimental-strip-types scripts/generate-august-demo-data.ts
 */

import { writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const SLUG = 'august-township'
const ROWS = 5
const COLS = 10
const TOTAL = ROWS * COLS

const ANCHOR_LAT = 18.7546
const ANCHOR_LNG = 73.4062

const PLOT_W_M = 25
const PLOT_D_M = 35
const STEP_LNG_M = 30
const STEP_LAT_M = 40

const LAT_DEG_PER_M = 1 / 110_950
const LNG_DEG_PER_M = 1 / (111_320 * Math.cos((ANCHOR_LAT * Math.PI) / 180))

const STATUS_PLAN = [
  ...Array<string>(30).fill('available'),
  ...Array<string>(12).fill('reserved'),
  ...Array<string>(6).fill('sold'),
  ...Array<string>(2).fill('blocked'),
]

const FACINGS = ['north', 'east', 'south', 'west']

function isCorner(r: number, c: number) {
  return (r === 0 || r === ROWS - 1) && (c === 0 || c === COLS - 1)
}

function isPremium(r: number, c: number) {
  return (r === 2 && (c === 2 || c === 7)) || (r === 0 && c === 4) || (r === ROWS - 1 && c === 5)
}

function cornerFacing(r: number, c: number): string {
  const ns = r === 0 ? 'north' : 'south'
  const ew = c === 0 ? 'west' : 'east'
  return `${ns}-${ew}`
}

function edgeFacing(r: number, c: number): string {
  if (r === 0) return 'north'
  if (r === ROWS - 1) return 'south'
  if (c === 0) return 'west'
  if (c === COLS - 1) return 'east'
  return FACINGS[(r + c) % FACINGS.length]
}

function makePlot(index: number, r: number, c: number) {
  const plotNumber = `P${String(index + 1).padStart(3, '0')}`
  const geometryRef = `plot-p${String(index + 1).padStart(3, '0')}`

  const corner = isCorner(r, c)
  const premium = !corner && isPremium(r, c)
  const type = corner ? 'corner' : premium ? 'premium' : 'residential'

  const baseArea = corner ? 2000 : premium ? 1700 : 1100
  const areaJitter = ((index * 37) % 7) * 50 - 150
  const area_sqft = baseArea + areaJitter

  const facing = corner ? cornerFacing(r, c) : edgeFacing(r, c)

  const baseRate = premium || corner ? 5000 : 3800
  const rateJitter = ((index * 17) % 5) * 100
  const price = (area_sqft * (baseRate + rateJitter)) / 1
  const priceRounded = Math.round(price / 10_000) * 10_000

  const status = STATUS_PLAN[index]

  let notes: string | null = null
  if (status === 'reserved') notes = 'Held — site visit scheduled'
  else if (status === 'sold') notes = 'Sold via direct walk-in'
  else if (status === 'blocked') notes = 'Reserved for utility easement'

  return {
    plot_number: plotNumber,
    geometry_ref: geometryRef,
    area_sqft,
    type,
    facing,
    status,
    price: priceRounded,
    notes,
  }
}

function makeFeature(index: number, r: number, c: number) {
  const geometryRef = `plot-p${String(index + 1).padStart(3, '0')}`
  const plotNumber = `P${String(index + 1).padStart(3, '0')}`

  const nwLng = ANCHOR_LNG + c * STEP_LNG_M * LNG_DEG_PER_M
  const nwLat = ANCHOR_LAT - r * STEP_LAT_M * LAT_DEG_PER_M
  const seLng = nwLng + PLOT_W_M * LNG_DEG_PER_M
  const seLat = nwLat - PLOT_D_M * LAT_DEG_PER_M

  const ring: [number, number][] = [
    [nwLng, nwLat],
    [seLng, nwLat],
    [seLng, seLat],
    [nwLng, seLat],
    [nwLng, nwLat],
  ]

  return {
    type: 'Feature' as const,
    id: geometryRef,
    properties: {
      plot_number: plotNumber,
      geometry_ref: geometryRef,
    },
    geometry: {
      type: 'Polygon' as const,
      coordinates: [ring],
    },
  }
}

const plots = []
const features = []

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const index = r * COLS + c
    plots.push(makePlot(index, r, c))
    features.push(makeFeature(index, r, c))
  }
}

if (plots.length !== TOTAL) {
  console.error(`Expected ${TOTAL} plots, got ${plots.length}`)
  process.exit(1)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, `../data/projects/${SLUG}`)

writeFileSync(path.join(outDir, 'plots-seed.json'), JSON.stringify(plots, null, 2) + '\n')
writeFileSync(
  path.join(outDir, 'plots-geometry.geojson'),
  JSON.stringify({ type: 'FeatureCollection', features }, null, 2) + '\n'
)

const statusCounts = plots.reduce<Record<string, number>>((acc, p) => {
  acc[p.status] = (acc[p.status] ?? 0) + 1
  return acc
}, {})

console.log(`Wrote ${plots.length} plots to data/projects/${SLUG}/plots-seed.json`)
console.log(`Wrote ${features.length} features to data/projects/${SLUG}/plots-geometry.geojson`)
console.log(`Status mix: ${JSON.stringify(statusCounts)}`)
console.log(`Anchor: [${ANCHOR_LNG}, ${ANCHOR_LAT}] — Lonavala`)
console.log(`Grid extent: ~${COLS * STEP_LNG_M}m E × ${ROWS * STEP_LAT_M}m S`)
