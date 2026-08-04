export interface CameraStage {
  id: string
  name: string
  center: [number, number]
  zoom: number
  pitch: number
  bearing: number
  scrollProgress: number
}

export interface AmenityDef {
  id: string
  name: string
  displayMode: 'card' | 'modal'
  scrollStageRange: [number, number]
  anchor: [number, number]
  /** Full-quality inter-frame encode. Used for normal playback (modals, hero). */
  videoPath: string
  /**
   * All-intra encode (every frame a keyframe). Required for scroll-scrubbing:
   * seeking an inter-frame file forces the decoder back to the previous
   * keyframe, which is what makes scrubbing stutter. Falls back to videoPath.
   */
  scrubVideoPath?: string
  description: string
}

export interface MasterPlanConfig {
  desktop: string
  mobile: string
  georef: {
    topLeft: [number, number]
    topRight: [number, number]
    bottomRight: [number, number]
    bottomLeft: [number, number]
  } | null
}

export interface InitialCamera {
  center: [number, number]
  zoom: number
  pitch: number
  bearing: number
}

export interface ProjectConfig {
  slug: string
  name: string
  tagline: string
  /** Shown under the wordmark in the plot explorer, e.g. "Raipur, Chhattisgarh". */
  location?: string
  /** RERA registration number, printed in the explorer footer. */
  rera?: string
  mapboxStyle: string
  masterPlan: MasterPlanConfig
  cameraStages: CameraStage[]
  initialCamera?: InitialCamera
  landingLoop?: string
  showcaseVideo?: string
  cta: {
    label: string
    whatsappNumber: string
  }
}
