'use client'

import { useEffect } from 'react'
import type { AmenityDef } from '@/lib/types/project'

interface AmenityModalProps {
  amenity: AmenityDef
  projectSlug: string
  onClose: () => void
}

export default function AmenityModal({ amenity, projectSlug, onClose }: AmenityModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const videoSrc = amenity.videoPath
    ? `/data/projects/${projectSlug}/${amenity.videoPath}`
    : null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-surface-dark/90 backdrop-blur-sm p-4 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={amenity.name}
    >
      <div
        className="relative w-full max-w-4xl rounded-2xl bg-surface-card ring-1 ring-brand-primary/20 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 h-9 w-9 rounded-full bg-surface-overlay/80 text-text-primary hover:bg-surface-overlay hover:text-brand-primary transition-colors flex items-center justify-center"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="aspect-video bg-surface-overlay flex items-center justify-center">
          {videoSrc ? (
            <video
              className="w-full h-full object-cover"
              src={videoSrc}
              autoPlay
              muted
              loop
              playsInline
              controls
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-surface-overlay via-surface-card to-surface-dark">
              <div className="h-14 w-14 rounded-full ring-2 ring-brand-primary/40 flex items-center justify-center">
                <svg className="w-6 h-6 text-brand-primary" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <p className="text-text-muted text-sm font-medium tracking-wide">
                Video coming soon
              </p>
            </div>
          )}
        </div>

        <div className="p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-primary mb-2">
            Amenity
          </p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-text-primary mb-3">
            {amenity.name}
          </h2>
          <p className="text-sm sm:text-base text-text-muted leading-relaxed">
            {amenity.description}
          </p>
        </div>
      </div>
    </div>
  )
}
