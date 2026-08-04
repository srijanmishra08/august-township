'use client'

import { useState } from 'react'
import type { AmenityDef } from '@/lib/types/project'
import AmenityCard from './AmenityCard'
import AmenityModal from './AmenityModal'

interface AmenityOverlayProps {
  amenities: AmenityDef[]
  progress: number
  projectSlug: string
  onModalOpen?: () => void
  onModalClose?: () => void
}

export default function AmenityOverlay({
  amenities,
  progress,
  projectSlug,
  onModalOpen,
  onModalClose,
}: AmenityOverlayProps) {
  const [selected, setSelected] = useState<AmenityDef | null>(null)

  const active = amenities.filter(
    (a) => progress >= a.scrollStageRange[0] && progress <= a.scrollStageRange[1]
  )

  function openModal(amenity: AmenityDef) {
    setSelected(amenity)
    onModalOpen?.()
  }

  function closeModal() {
    setSelected(null)
    onModalClose?.()
  }

  return (
    <>
      <div
        className="pointer-events-none absolute top-1/2 right-4 sm:right-6 -translate-y-1/2 z-30 flex flex-col gap-3"
        aria-live="polite"
      >
        {active.map((a) => (
          <div
            key={a.id}
            className="pointer-events-auto animate-[august-fade-in_300ms_ease-out_both]"
          >
            <AmenityCard amenity={a} onOpen={() => openModal(a)} />
          </div>
        ))}
      </div>

      {selected && (
        <AmenityModal amenity={selected} projectSlug={projectSlug} onClose={closeModal} />
      )}
    </>
  )
}
