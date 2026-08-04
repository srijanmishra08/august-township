'use client'

import { useRouter } from 'next/navigation'
import type { ProjectConfig } from '@/lib/types/project'

export default function ProjectCard({ project }: { project: ProjectConfig }) {
  const router = useRouter()

  return (
    <div
      className="relative overflow-hidden rounded-lg cursor-pointer bg-surface-card h-64 transition-transform duration-300 hover:scale-[1.02] ring-1 ring-transparent hover:ring-brand-primary"
      onClick={() => router.push(`/projects/${project.slug}`)}
    >
      {project.landingLoop ? (
        <video
          src={`/data/projects/${project.slug}/${project.landingLoop}`}
          muted
          autoPlay
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => {
            ;(e.target as HTMLVideoElement).style.display = 'none'
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-surface-overlay via-surface-card to-surface-dark" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-surface-dark to-transparent opacity-80" />
      <div className="absolute bottom-4 left-4">
        <p className="text-2xl font-semibold text-text-primary">{project.name}</p>
        {project.tagline && (
          <p className="text-sm text-text-muted mt-1">{project.tagline}</p>
        )}
      </div>
    </div>
  )
}
