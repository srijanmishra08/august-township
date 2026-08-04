import IntroAnimation from '@/components/IntroAnimation'
import ProjectCard from '@/components/landing/ProjectCard'
import type { ProjectConfig } from '@/lib/types/project'
import augustConfig from '@/data/projects/august-township/config.json'
import project2Config from '@/data/projects/project-2/config.json'
import project3Config from '@/data/projects/project-3/config.json'

const projects: ProjectConfig[] = [
  augustConfig as unknown as ProjectConfig,
  project2Config as unknown as ProjectConfig,
  project3Config as unknown as ProjectConfig
]

export default function Home() {
  return (
    <IntroAnimation>
      <main className="min-h-screen bg-surface-dark px-6 py-12">
        <p className="text-center text-text-muted text-sm tracking-widest uppercase mb-12">
          Three Extraordinary Communities
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-6xl mx-auto">
          {projects.map((project) => (
            <ProjectCard key={project.slug} project={project} />
          ))}
        </div>
      </main>
    </IntroAnimation>
  )
}
