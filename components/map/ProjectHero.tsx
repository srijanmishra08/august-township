'use client'

interface ProjectHeroProps {
  name: string
  tagline?: string
}

export default function ProjectHero({ name, tagline }: ProjectHeroProps) {
  return (
    <section
      data-snap-section
      className="relative h-screen flex flex-col items-center justify-center overflow-hidden bg-surface-dark"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-surface-overlay via-surface-card to-surface-dark opacity-90" />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, var(--color-brand-primary), transparent 50%), radial-gradient(circle at 80% 70%, var(--color-brand-primary), transparent 45%)',
        }}
      />

      <div className="relative z-10 text-center px-6 max-w-4xl">
        <p className="text-brand-primary text-xs uppercase tracking-[0.4em] mb-6">
          August Presents
        </p>
        <h1 className="text-5xl sm:text-7xl font-semibold text-text-primary tracking-tight leading-[1.05]">
          {name}
        </h1>
        {tagline && (
          <p className="mt-6 text-base sm:text-xl text-text-muted max-w-2xl mx-auto leading-relaxed">
            {tagline}
          </p>
        )}
      </div>

      <div className="absolute bottom-10 z-10 flex flex-col items-center gap-2 text-text-muted">
        <span className="text-[10px] uppercase tracking-[0.3em]">Scroll to Discover</span>
        <svg
          className="w-4 h-4 animate-bounce"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M19 14l-7 7m0 0l-7-7m7 7V3"
          />
        </svg>
      </div>
    </section>
  )
}
