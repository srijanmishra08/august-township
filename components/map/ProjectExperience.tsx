'use client'

import { useEffect, useState } from 'react'
import PlotExplorer3D from './PlotExplorer3D'
import ProjectShowcase from './ProjectShowcase'
import TownshipFlyover from '../flyover/TownshipFlyover'
import TownshipFlythrough3D from '../flyover/TownshipFlythrough3D'
import type { AmenityDef } from '@/lib/types/project'
import type { FlyoverConfig } from '@/lib/types/flyover'
import type { FlythroughConfig } from '@/lib/types/flythrough'
import type { Amenity3D, Plot3D } from '@/lib/types/plot3d'

interface ProjectExperienceProps {
  plots: Plot3D[]
  plotAmenities: Amenity3D[]
  planImage: string
  planSize: { width: number; pdfWidth: number; pdfHeight: number }
  camera: { position: [number, number, number]; target: [number, number, number] }
  amenities: AmenityDef[]
  /** Present only for projects that ship a flyover.json. */
  flyover?: FlyoverConfig | null
  /** First-person tour of the 3D masterplan. Takes precedence over `flyover`. */
  flythrough?: FlythroughConfig | null
  projectSlug: string
  projectName: string
  tagline?: string
  location?: string
  rera?: string
  whatsappNumber: string
  showcaseVideo?: string
}

export default function ProjectExperience({
  plots,
  plotAmenities,
  planImage,
  planSize,
  camera,
  amenities,
  flyover,
  flythrough,
  projectSlug,
  projectName,
  tagline,
  location,
  rera,
  whatsappNumber,
  showcaseVideo,
}: ProjectExperienceProps) {
  // Landing on the project from the township grid starts the cinematic flyover.
  // Projects without a flyover.json keep the previous scroll showcase.
  const [mode, setMode] = useState<'flyover' | 'showcase' | 'explore'>(
    flythrough || flyover ? 'flyover' : 'showcase',
  )

  useEffect(() => {
    if (mode !== 'explore') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mode])

  // The flyover drives document scroll, so entering it must start from the top —
  // otherwise a restored scroll position drops the user mid-timeline.
  useEffect(() => {
    if (mode === 'flyover') window.scrollTo(0, 0)
  }, [mode])

  if (mode === 'flyover' && flythrough) {
    return (
      <TownshipFlythrough3D
        config={flythrough}
        plots={plots}
        amenities={plotAmenities}
        planImage={planImage}
        planSize={planSize}
        camera={camera}
        projectSlug={projectSlug}
        onExit={() => setMode('explore')}
      />
    )
  }

  if (mode === 'flyover' && flyover) {
    return (
      <TownshipFlyover
        config={flyover}
        amenities={amenities}
        projectSlug={projectSlug}
        onExit={() => setMode('explore')}
      />
    )
  }

  if (mode === 'explore') {
    return (
      <div className="fixed inset-0 z-40 w-full h-screen">
        <PlotExplorer3D
          plots={plots}
          amenities={plotAmenities}
          planImage={planImage}
          planSize={planSize}
          camera={camera}
          projectSlug={projectSlug}
          projectName={projectName}
          location={location}
          rera={rera}
          whatsappNumber={whatsappNumber}
          /* Back returns to the cinematic walkthrough the visitor arrived
             through. Sending them to the old scroll showcase instead stranded
             them in a surface nothing else links to. */
          onBack={() => setMode(flythrough || flyover ? 'flyover' : 'showcase')}
        />
      </div>
    )
  }

  return (
    <ProjectShowcase
      projectName={projectName}
      tagline={tagline}
      amenities={amenities}
      plots={plots}
      plotAmenities={plotAmenities}
      planImage={planImage}
      planSize={planSize}
      camera={camera}
      projectSlug={projectSlug}
      showcaseVideo={showcaseVideo}
      onExplore={() => setMode('explore')}
    />
  )
}
