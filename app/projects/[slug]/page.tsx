import fs from 'fs'
import path from 'path'
import type { AmenityDef, ProjectConfig } from '@/lib/types/project'
import type { FlyoverConfig } from '@/lib/types/flyover'
import type { FlythroughConfig } from '@/lib/types/flythrough'
import type { Plots3DData } from '@/lib/types/plot3d'
import { derivePlots } from '@/lib/plots3d'
import ProjectExperience from '@/components/map/ProjectExperience'

export const revalidate = 60

function readProjectFile<T>(slug: string, file: string): T | null {
  try {
    const full = path.join(process.cwd(), 'data', 'projects', slug, file)
    return JSON.parse(fs.readFileSync(full, 'utf-8')) as T
  } catch {
    return null
  }
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const config = readProjectFile<ProjectConfig>(slug, 'config.json')!
  const amenities = readProjectFile<AmenityDef[]>(slug, 'amenities.json') ?? []
  const layout = readProjectFile<Plots3DData>(slug, 'plots-3d.json')
  // Optional cinematic intros, in order of preference: a first-person flythrough
  // of the 3D masterplan, then the flat-plan flyover, then the scroll showcase.
  const flyover = readProjectFile<FlyoverConfig>(slug, 'flyover.json')
  const flythrough = readProjectFile<FlythroughConfig>(slug, 'flythrough.json')

  if (!layout) {
    throw new Error(`Missing plots-3d.json for project "${slug}"`)
  }

  // Status, price and facing are derived deterministically from the layout so
  // server and client agree without those columns existing in Supabase yet.
  const plots = derivePlots(layout.plots)

  return (
    <main className="w-full">
      <ProjectExperience
        plots={plots}
        plotAmenities={layout.amenities}
        planImage={`/data/projects/${slug}/${layout.planImage}`}
        planSize={layout.planSize}
        camera={layout.camera}
        amenities={amenities}
        flyover={flyover}
        flythrough={flythrough}
        projectSlug={slug}
        projectName={config.name}
        tagline={config.tagline}
        location={config.location}
        rera={config.rera}
        whatsappNumber={config.cta.whatsappNumber}
        showcaseVideo={
          config.showcaseVideo ? `/data/projects/${slug}/${config.showcaseVideo}` : undefined
        }
      />
    </main>
  )
}
