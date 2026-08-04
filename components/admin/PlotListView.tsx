'use client'

import { useState } from 'react'
import type { Plot, PlotStatus, AuditLog } from '@/lib/types/database'
import PlotEditModal from '@/components/admin/PlotEditModal'

type StatusFilter = 'all' | PlotStatus

const FILTERS: StatusFilter[] = ['all', 'available', 'reserved', 'sold', 'blocked']
const STATUSES: PlotStatus[] = ['available', 'reserved', 'sold', 'blocked']

const STATUS_BADGE: Record<PlotStatus, string> = {
  available: 'bg-green-900/40 text-green-400',
  reserved: 'bg-amber-900/40 text-amber-400',
  sold: 'bg-red-900/40 text-red-400',
  blocked: 'bg-gray-800 text-gray-400',
}

function formatTs(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface Props {
  plots: Plot[]
  auditLog: AuditLog[]
}

export default function PlotListView({ plots: initialPlots, auditLog }: Props) {
  const [plots, setPlots] = useState<Plot[]>(initialPlots)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [editingPlot, setEditingPlot] = useState<Plot | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ id: string; msg: string } | null>(null)

  const plotMap = new Map(plots.map(p => [p.id, p.plot_number]))
  const filtered = filter === 'all' ? plots : plots.filter(p => p.status === filter)

  function handleEditSuccess(updated: Plot) {
    setPlots(prev => prev.map(p => (p.id === updated.id ? updated : p)))
  }

  async function updateStatus(plot: Plot, nextStatus: PlotStatus) {
    if (nextStatus === plot.status) return
    setUpdatingId(plot.id)
    setRowError(null)
    try {
      const res = await fetch(`/api/admin/plots/${plot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Update failed' }))
        setRowError({ id: plot.id, msg: (err as { error?: string }).error ?? 'Update failed' })
        return
      }
      const updated = (await res.json()) as Plot
      setPlots(prev => prev.map(p => (p.id === updated.id ? updated : p)))
    } catch {
      setRowError({ id: plot.id, msg: 'Network error' })
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-surface-overlay">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-xs font-medium capitalize transition-colors border-b-2 -mb-px ${
              filter === f
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Plot table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted text-xs border-b border-surface-overlay">
              <th className="pb-3 pr-4 font-medium">Plot No.</th>
              <th className="pb-3 pr-4 font-medium">Type</th>
              <th className="pb-3 pr-4 font-medium">Area (sqft)</th>
              <th className="pb-3 pr-4 font-medium">Facing</th>
              <th className="pb-3 pr-4 font-medium">Status</th>
              <th className="pb-3 pr-4 font-medium">Price</th>
              <th className="pb-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-text-muted text-sm">
                  No plots found
                </td>
              </tr>
            )}
            {filtered.map(plot => (
              <tr
                key={plot.id}
                className="border-b border-surface-overlay/50 hover:bg-surface-overlay/20 transition-colors"
              >
                <td className="py-3 pr-4 text-text-primary font-medium">{plot.plot_number}</td>
                <td className="py-3 pr-4 text-text-muted capitalize">{plot.type}</td>
                <td className="py-3 pr-4 text-text-muted">{plot.area_sqft ?? '—'}</td>
                <td className="py-3 pr-4 text-text-muted">{plot.facing ?? '—'}</td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <select
                      value={plot.status}
                      onChange={(e) => updateStatus(plot, e.target.value as PlotStatus)}
                      disabled={updatingId === plot.id}
                      aria-label={`Status for ${plot.plot_number}`}
                      className={`appearance-none cursor-pointer rounded-full pl-3 pr-7 py-1 text-xs font-medium capitalize border-0 outline-none focus:ring-2 focus:ring-brand-primary/40 disabled:opacity-60 ${STATUS_BADGE[plot.status]}`}
                      style={{
                        backgroundImage:
                          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10' fill='currentColor'><path d='M2 3.5 5 6.5 8 3.5z'/></svg>\")",
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 8px center',
                      }}
                    >
                      {STATUSES.map(s => (
                        <option key={s} value={s} className="bg-surface-overlay text-text-primary">
                          {s}
                        </option>
                      ))}
                    </select>
                    {rowError?.id === plot.id && (
                      <span className="text-red-400 text-[10px]">{rowError.msg}</span>
                    )}
                  </div>
                </td>
                <td className="py-3 pr-4 text-text-muted">
                  {plot.price !== null ? `₹${plot.price.toLocaleString('en-IN')}` : '—'}
                </td>
                <td className="py-3">
                  <button
                    onClick={() => setEditingPlot(plot)}
                    className="text-text-muted hover:text-brand-primary text-xs transition-colors"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Audit trail */}
      {auditLog.length > 0 && (
        <div>
          <h3 className="text-text-muted text-xs font-medium uppercase tracking-wide mb-3">
            Recent Changes
          </h3>
          <div className="space-y-1.5">
            {auditLog.map(entry => (
              <div
                key={entry.id}
                className="flex items-center justify-between text-xs text-text-muted bg-surface-overlay/30 rounded-lg px-3 py-2"
              >
                <span>
                  Plot{' '}
                  <span className="text-text-primary font-medium">
                    {plotMap.get(entry.entity_id) ?? entry.entity_id.slice(0, 8)}
                  </span>
                  {' · '}
                  <span className="text-text-primary">{entry.field}</span>
                  {' '}
                  <span className="font-mono">{entry.old_value ?? 'null'}</span>
                  {' → '}
                  <span className="font-mono text-text-primary">{entry.new_value ?? 'null'}</span>
                </span>
                <span className="text-text-subtle ml-4 shrink-0">{formatTs(entry.changed_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingPlot && (
        <PlotEditModal
          plot={editingPlot}
          onSuccess={handleEditSuccess}
          onClose={() => setEditingPlot(null)}
        />
      )}
    </div>
  )
}
