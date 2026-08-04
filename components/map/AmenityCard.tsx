'use client'

import type { AmenityDef } from '@/lib/types/project'

interface AmenityCardProps {
  amenity: AmenityDef
  onOpen: () => void
}

export default function AmenityCard({ amenity, onOpen }: AmenityCardProps) {
  return (
    <button
      onClick={onOpen}
      className="group w-72 text-left rounded-2xl bg-surface-card/90 ring-1 ring-brand-primary/20 backdrop-blur-md shadow-2xl p-5 flex flex-col gap-2 transition-all duration-300 hover:bg-surface-card hover:ring-brand-primary/50 hover:-translate-y-0.5"
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-brand-primary">
        Amenity
      </p>
      <h3 className="text-lg font-semibold text-text-primary leading-tight">
        {amenity.name}
      </h3>
      <p className="text-sm text-text-muted line-clamp-2">{amenity.description}</p>
      <span className="mt-2 text-xs font-medium text-brand-primary group-hover:underline">
        Watch tour →
      </span>
    </button>
  )
}
