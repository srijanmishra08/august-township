import type {
  Plot3D,
  Plot3DFacing,
  Plot3DFilters,
  Plot3DSector,
  Plot3DStatus,
  RawPlot3D,
} from './types/plot3d'

/**
 * Deterministic integer hash. Status, price variance and facing are derived
 * from it so a plot always renders identically between server and client
 * without needing those columns in Supabase yet.
 */
function hash(n: number): number {
  n = ((n >>> 16) ^ n) * 0x45d9f3b | 0
  n = ((n >>> 16) ^ n) * 0x45d9f3b | 0
  return ((n >>> 16) ^ n) >>> 0
}

const FACINGS: Plot3DFacing[] = ['North', 'East', 'South', 'West']

const SECTOR_NAMES: Record<Plot3DSector, string> = {
  A: 'Upper Block',
  B: 'Central Block',
  C: 'East Block',
  D: 'Diagonal Zone',
  E: 'South Block',
  L: 'Luxury Lot',
}

const LOAN_RATE = 0.085
const LOAN_MONTHS = 240

function monthlyEmi(principalRupees: number): number {
  const r = LOAN_RATE / 12
  const growth = Math.pow(1 + r, LOAN_MONTHS)
  return Math.round((principalRupees * r * growth) / (growth - 1))
}

/**
 * Resolve the commercial fields for every plot. Order matters — the diagonal
 * sector takes its facing from the plot's position in the source list.
 */
export function derivePlots(raw: RawPlot3D[]): Plot3D[] {
  return raw.map((plot, index) => {
    const n = index + 1

    const roll = hash(n * 7) % 100
    const status: Plot3DStatus =
      roll < 52 ? 'available' : roll < 78 ? 'booked' : 'sold'

    const price = parseFloat((plot.priceBase + (hash(n * 13) % 100) / 100).toFixed(2))
    const priceRupees = price * 100_000

    let facing: Plot3DFacing
    if (plot.sector === 'D') facing = FACINGS[index % 4]
    else if (plot.sector === 'L') facing = 'East'
    else facing = FACINGS[hash(n * 31) % 4]

    return {
      ...plot,
      status,
      facing,
      price,
      priceLabel: `₹${price} L`,
      rate: Math.round(priceRupees / plot.sqft),
      emi: monthlyEmi(priceRupees),
      sectorName: SECTOR_NAMES[plot.sector],
    }
  })
}

export function matchesFilters(plot: Plot3D, filters: Plot3DFilters): boolean {
  return (
    (filters.status === 'all' || plot.status === filters.status) &&
    (filters.size === 'all' || plot.sizeKey === filters.size) &&
    (filters.facing === 'all' || plot.facing === filters.facing)
  )
}

export function plotLabel(plot: Plot3D): string {
  return plot.displayNumber ? `Plot #${plot.displayNumber}` : plot.id
}

export interface Plot3DTally {
  shown: number
  available: number
  booked: number
  sold: number
}

export function tally(plots: Plot3D[], filters: Plot3DFilters): Plot3DTally {
  const counts: Plot3DTally = { shown: 0, available: 0, booked: 0, sold: 0 }
  for (const plot of plots) {
    if (!matchesFilters(plot, filters)) continue
    counts.shown++
    counts[plot.status]++
  }
  return counts
}
