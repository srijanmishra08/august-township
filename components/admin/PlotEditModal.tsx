'use client'

import { useState } from 'react'
import type { Plot, PlotStatus } from '@/lib/types/database'

const STATUSES: PlotStatus[] = ['available', 'reserved', 'sold', 'blocked']

interface Props {
  plot: Plot
  onSuccess: (updated: Plot) => void
  onClose: () => void
}

export default function PlotEditModal({ plot, onSuccess, onClose }: Props) {
  const [status, setStatus] = useState<PlotStatus>(plot.status)
  const [price, setPrice] = useState<string>(plot.price !== null ? String(plot.price) : '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const body = {
      status,
      price: price !== '' ? Number(price) : null,
    }

    try {
      const res = await fetch(`/api/admin/plots/${plot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        setError((err as { error?: string }).error ?? 'Update failed')
        return
      }

      const updated = (await res.json()) as Plot
      onSuccess(updated)
      onClose()
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-surface-card border border-surface-overlay rounded-xl p-6 w-full max-w-sm mx-4">
        <h2 className="text-text-primary font-medium text-sm mb-4">
          Edit Plot {plot.plot_number}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-text-muted text-xs block mb-1.5">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as PlotStatus)}
              className="w-full bg-surface-overlay border border-surface-overlay rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-brand-primary capitalize"
            >
              {STATUSES.map(s => (
                <option key={s} value={s} className="capitalize">
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-text-muted text-xs block mb-1.5">Price (₹)</label>
            <input
              type="number"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder="Leave blank to clear"
              min={0}
              className="w-full bg-surface-overlay border border-surface-overlay rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-brand-primary"
            />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 border border-surface-overlay rounded-lg py-2 text-text-muted text-sm hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-brand-primary rounded-lg py-2 text-surface-dark text-sm font-medium hover:bg-brand-secondary transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
