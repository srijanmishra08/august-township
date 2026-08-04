export type Plot3DStatus = 'available' | 'booked' | 'sold'

export type Plot3DSector = 'A' | 'B' | 'C' | 'D' | 'E' | 'L'

export type Plot3DFacing = 'North' | 'East' | 'South' | 'West'

/** A plot exactly as authored in plots-3d.json — geometry and pricing basis only. */
export interface RawPlot3D {
  id: string
  /** Marketing number shown to buyers. Luxury lots are sold by id instead. */
  displayNumber: number | null
  cx: number
  cz: number
  sqft: number
  sqyd: number
  /** Price floor in lakhs, before the per-plot variance. */
  priceBase: number
  width: number
  depth: number
  sizeKey: string
  sector: Plot3DSector
}

export interface Amenity3D {
  name: string
  cx: number
  cz: number
  /** Hex string, e.g. "0x2A6E2A". */
  color: string
  /** Project-relative walkthrough clip. Markers without one are not clickable. */
  video?: string
  /**
   * Project-relative equirectangular panorama (2:1, full 360x180). When set it
   * takes priority over `video` and opens the true 360 tour.
   */
  panorama?: string
  /** Hotspots linking this panorama to other amenities, by amenity name. */
  hotspots?: Array<{ yaw: number; pitch: number; label: string; target: string }>
  description?: string
}

export interface Plots3DData {
  source: string
  planImage: string
  planSize: { width: number; pdfWidth: number; pdfHeight: number }
  camera: { position: [number, number, number]; target: [number, number, number] }
  plots: RawPlot3D[]
  amenities: Amenity3D[]
}

/** A raw plot with its derived commercial fields resolved. */
export interface Plot3D extends RawPlot3D {
  status: Plot3DStatus
  facing: Plot3DFacing
  /** Lakhs. */
  price: number
  priceLabel: string
  /** Rupees per sqft. */
  rate: number
  /** Rupees per month. */
  emi: number
  sectorName: string
}

export interface Plot3DFilters {
  status: Plot3DStatus | 'all'
  size: string | 'all'
  facing: Plot3DFacing | 'all'
}
