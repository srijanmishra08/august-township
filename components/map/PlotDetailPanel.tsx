'use client'

import { useState } from 'react'

const STATUS_BADGE_COLORS: Record<string, string> = {
  available: 'bg-green-100 text-green-800',
  reserved: 'bg-amber-100 text-amber-800',
  sold: 'bg-red-100 text-red-800',
  blocked: 'bg-gray-100 text-gray-600',
}

interface PlotDetailPanelProps {
  properties: Record<string, unknown>
  projectSlug: string
  whatsappNumber: string
  onClose: () => void
}

export default function PlotDetailPanel({
  properties,
  projectSlug,
  whatsappNumber,
  onClose,
}: PlotDetailPanelProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const status = String(properties.status ?? 'blocked')
  const badgeClass = STATUS_BADGE_COLORS[status] ?? STATUS_BADGE_COLORS.blocked

  const price = properties.price
    ? '₹' + Number(properties.price).toLocaleString('en-IN')
    : 'On Request'
  const area = properties.area_sqft ? String(properties.area_sqft) + ' sq ft' : '—'
  const plotNumber = String(properties.plot_number ?? '—')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setResult('idle')
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        phone,
        email: email || null,
        message: message || null,
        project_slug: projectSlug,
        plot_id: (properties.id as string) ?? null,
      }),
    })
    setSubmitting(false)
    if (res.ok) {
      setResult('success')
    } else {
      const body = await res.json().catch(() => ({ error: 'Unknown error' }))
      setErrorMsg((body as { error: string }).error)
      setResult('error')
    }
  }

  return (
    <div className="absolute inset-4 sm:inset-auto sm:top-4 sm:right-4 sm:bottom-4 sm:w-96 bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 z-20 flex flex-col overflow-hidden">
      <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-gray-200">
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Plot</p>
          <h2 className="text-2xl font-bold text-gray-900 mt-0.5">{plotNumber}</h2>
          <span className={`inline-block mt-2 px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${badgeClass}`}>
            {status}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full p-1 transition-colors ml-4 -mt-1 -mr-1"
          aria-label="Close panel"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Plot details */}
      <div className="p-5 border-b border-gray-200">
        <dl className="grid grid-cols-2 gap-4">
          {[
            { label: 'Price', value: price },
            { label: 'Area', value: area },
            { label: 'Type', value: String(properties.type ?? '—') },
            { label: 'Facing', value: String(properties.facing ?? '—') },
          ].map(({ label, value }) => (
            <div key={label}>
              <dt className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</dt>
              <dd className="text-sm font-semibold text-gray-900 mt-1 capitalize">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* WhatsApp button */}
      {whatsappNumber && (
        <div className="p-5 border-b border-gray-200">
          <a
            href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`I'm interested in Plot ${plotNumber} at ${projectSlug}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            WhatsApp Us
          </a>
        </div>
      )}

      {/* Interest form */}
      <div className="p-5 flex-1">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Register Interest</h3>
        {result === 'success' ? (
          <p className="text-green-800 text-sm font-medium bg-green-50 ring-1 ring-green-200 rounded-lg p-3">
            Interest recorded! We&apos;ll be in touch.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              required
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-black/30 focus:border-gray-400"
            />
            <input
              required
              type="tel"
              placeholder="Phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-black/30 focus:border-gray-400"
            />
            <input
              type="email"
              placeholder="Email (optional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-black/30 focus:border-gray-400"
            />
            <textarea
              placeholder="Message (optional)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-black/30 focus:border-gray-400 resize-none"
            />
            {result === 'error' && (
              <p className="text-red-700 text-xs font-medium">{errorMsg}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting…' : 'Submit Interest'}
            </button>
          </form>
        )}
      </div>
      </div>
    </div>
  )
}
