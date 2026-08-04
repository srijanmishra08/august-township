'use client'

import { useState } from 'react'

export default function IntroAnimation({ children }: { children: React.ReactNode }) {
  const [revealed, setRevealed] = useState(false)

  return (
    <>
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center bg-surface-dark transition-opacity duration-700 ${
          revealed ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <span
          className="text-brand-primary text-7xl font-bold tracking-widest select-none"
          style={{ animation: 'august-fade-in 1.2s ease-in forwards' }}
          onAnimationEnd={() => setTimeout(() => setRevealed(true), 400)}
        >
          AUGUST
        </span>
      </div>
      {children}
    </>
  )
}
