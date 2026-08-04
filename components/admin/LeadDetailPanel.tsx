'use client'

import { useState } from 'react'
import type { Lead, LeadNote, LeadStatus, Plot } from '@/lib/types/database'

type PlotMeta = Pick<Plot, 'plot_number' | 'type' | 'area_sqft'>

const LEAD_STATUSES: LeadStatus[] = [
  'new',
  'contacted',
  'site_visit_scheduled',
  'site_visit_done',
  'negotiating',
  'booked',
  'lost',
]

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  site_visit_scheduled: 'Site Visit Scheduled',
  site_visit_done: 'Site Visit Done',
  negotiating: 'Negotiating',
  booked: 'Booked',
  lost: 'Lost',
}

const STATUS_BADGE: Record<LeadStatus, string> = {
  new: 'bg-blue-900/40 text-blue-400',
  contacted: 'bg-amber-900/40 text-amber-400',
  site_visit_scheduled: 'bg-purple-900/40 text-purple-400',
  site_visit_done: 'bg-indigo-900/40 text-indigo-400',
  negotiating: 'bg-orange-900/40 text-orange-400',
  booked: 'bg-green-900/40 text-green-400',
  lost: 'bg-gray-800 text-gray-400',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return (
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  )
}

interface Props {
  lead: Lead
  notes: LeadNote[]
  plot: PlotMeta | null
}

export default function LeadDetailPanel({ lead, notes: initialNotes, plot }: Props) {
  const [status, setStatus] = useState<LeadStatus>(lead.status)
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  const [notesList, setNotesList] = useState<LeadNote[]>(initialNotes)
  const [noteBody, setNoteBody] = useState('')
  const [noteLoading, setNoteLoading] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)

  const normalizedPhone = lead.phone.replace(/\D/g, '')

  async function handleSaveStatus() {
    setStatusLoading(true)
    setStatusError(null)
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        setStatusError((err as { error?: string }).error ?? 'Update failed')
        return
      }
    } catch {
      setStatusError('Network error')
    } finally {
      setStatusLoading(false)
    }
  }

  async function handleAddNote() {
    const body = noteBody.trim()
    if (!body) return
    setNoteLoading(true)
    setNoteError(null)
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        setNoteError((err as { error?: string }).error ?? 'Failed to add note')
        return
      }
      const newNote = (await res.json()) as LeadNote
      setNotesList(prev => [...prev, newNote])
      setNoteBody('')
    } catch {
      setNoteError('Network error')
    } finally {
      setNoteLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Two-column: info + actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Info card */}
        <div className="bg-surface-card border border-surface-overlay rounded-xl p-5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-text-primary font-semibold text-lg">{lead.name}</h2>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${STATUS_BADGE[status]}`}
            >
              {STATUS_LABEL[status]}
            </span>
          </div>

          <div className="space-y-1.5 text-sm">
            <div>
              <span className="text-text-muted text-xs block">Phone</span>
              <a href={`tel:${lead.phone}`} className="text-brand-primary hover:text-brand-secondary transition-colors">
                {lead.phone}
              </a>
            </div>
            <div>
              <span className="text-text-muted text-xs block">Email</span>
              {lead.email ? (
                <a href={`mailto:${lead.email}`} className="text-text-primary hover:text-brand-primary transition-colors">
                  {lead.email}
                </a>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </div>
            <div>
              <span className="text-text-muted text-xs block">Project</span>
              <span className="text-text-primary">{lead.project_slug}</span>
            </div>
            {plot && (
              <div>
                <span className="text-text-muted text-xs block">Plot</span>
                <span className="text-text-primary">
                  {plot.plot_number} · {plot.type}
                  {plot.area_sqft ? ` · ${plot.area_sqft} sqft` : ''}
                </span>
              </div>
            )}
            <div>
              <span className="text-text-muted text-xs block">Submitted</span>
              <span className="text-text-primary">
                {formatDate(lead.created_at)}{' '}
                <span className="text-text-subtle">({timeAgo(lead.created_at)})</span>
              </span>
            </div>
          </div>

          {lead.message && (
            <div className="bg-surface-overlay/40 rounded-lg p-3 text-text-muted text-sm mt-2">
              {lead.message}
            </div>
          )}
        </div>

        {/* Status + contact */}
        <div className="bg-surface-card border border-surface-overlay rounded-xl p-5 space-y-4">
          <div>
            <p className="text-text-muted text-xs mb-1.5">Status</p>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as LeadStatus)}
              className="w-full bg-surface-overlay border border-surface-overlay rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-brand-primary"
            >
              {LEAD_STATUSES.map(s => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <button
              onClick={handleSaveStatus}
              disabled={statusLoading}
              className="mt-2 w-full bg-brand-primary rounded-lg py-2 text-surface-dark text-sm font-medium hover:bg-brand-secondary transition-colors disabled:opacity-50"
            >
              {statusLoading ? 'Saving…' : 'Save Status'}
            </button>
            {statusError && <p className="text-red-400 text-xs mt-1">{statusError}</p>}
          </div>

          <div>
            <p className="text-text-muted text-xs mb-2">Contact</p>
            <div className="flex gap-2">
              <a
                href={`tel:${lead.phone}`}
                className="flex-1 text-center border border-surface-overlay rounded-lg py-2 text-text-muted text-sm hover:text-text-primary hover:border-brand-primary transition-colors"
              >
                Call
              </a>
              <a
                href={`https://wa.me/${normalizedPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center border border-surface-overlay rounded-lg py-2 text-text-muted text-sm hover:text-text-primary hover:border-brand-primary transition-colors"
              >
                WhatsApp
              </a>
              {lead.email && (
                <a
                  href={`mailto:${lead.email}`}
                  className="flex-1 text-center border border-surface-overlay rounded-lg py-2 text-text-muted text-sm hover:text-text-primary hover:border-brand-primary transition-colors"
                >
                  Email
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Notes thread */}
      <div className="bg-surface-card border border-surface-overlay rounded-xl p-5 space-y-4">
        <h3 className="text-text-primary text-sm font-medium">Notes</h3>

        <div className="space-y-3">
          {notesList.length === 0 ? (
            <p className="text-text-muted text-sm">No notes yet.</p>
          ) : (
            notesList.map(note => (
              <div key={note.id} className="bg-surface-overlay/40 rounded-lg p-3 space-y-1">
                <p className="text-text-primary text-sm">{note.body}</p>
                <p className="text-text-subtle text-xs">
                  Admin · {formatDate(note.created_at)}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2 pt-2 border-t border-surface-overlay">
          <textarea
            value={noteBody}
            onChange={e => setNoteBody(e.target.value)}
            placeholder="Add a note…"
            rows={3}
            className="w-full bg-surface-overlay border border-surface-overlay rounded-lg px-3 py-2 text-text-primary text-sm placeholder:text-text-subtle focus:outline-none focus:border-brand-primary resize-none"
          />
          <button
            onClick={handleAddNote}
            disabled={noteLoading || !noteBody.trim()}
            className="bg-brand-primary rounded-lg px-4 py-2 text-surface-dark text-sm font-medium hover:bg-brand-secondary transition-colors disabled:opacity-50"
          >
            {noteLoading ? 'Adding…' : 'Add Note'}
          </button>
          {noteError && <p className="text-red-400 text-xs">{noteError}</p>}
        </div>
      </div>
    </div>
  )
}
