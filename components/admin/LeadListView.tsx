'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Lead, LeadStatus } from '@/lib/types/database'

type StatusFilter = 'all' | LeadStatus

const FILTER_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'site_visit_scheduled', label: 'Site Visit' },
  { value: 'site_visit_done', label: 'Visit Done' },
  { value: 'negotiating', label: 'Negotiating' },
  { value: 'booked', label: 'Booked' },
  { value: 'lost', label: 'Lost' },
]

const STATUS_BADGE: Record<LeadStatus, string> = {
  new: 'bg-blue-900/40 text-blue-400',
  contacted: 'bg-amber-900/40 text-amber-400',
  site_visit_scheduled: 'bg-purple-900/40 text-purple-400',
  site_visit_done: 'bg-indigo-900/40 text-indigo-400',
  negotiating: 'bg-orange-900/40 text-orange-400',
  booked: 'bg-green-900/40 text-green-400',
  lost: 'bg-gray-800 text-gray-400',
}

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  site_visit_scheduled: 'Site Visit',
  site_visit_done: 'Visit Done',
  negotiating: 'Negotiating',
  booked: 'Booked',
  lost: 'Lost',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

interface Props {
  leads: Lead[]
}

export default function LeadListView({ leads }: Props) {
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')

  const lowerSearch = search.toLowerCase()
  const filtered = leads.filter(lead => {
    const matchesStatus = filter === 'all' || lead.status === filter
    const matchesSearch =
      !lowerSearch ||
      lead.name.toLowerCase().includes(lowerSearch) ||
      lead.phone.includes(lowerSearch)
    return matchesStatus && matchesSearch
  })

  return (
    <div className="p-6 space-y-4">
      {/* Filter tabs + search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-1 border-b border-surface-overlay overflow-x-auto flex-1">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                filter === tab.value
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or phone…"
          className="bg-surface-overlay border border-surface-overlay rounded-lg px-3 py-1.5 text-text-primary text-sm placeholder:text-text-subtle focus:outline-none focus:border-brand-primary w-full sm:w-56"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted text-xs border-b border-surface-overlay">
              <th className="pb-3 pr-4 font-medium">Name</th>
              <th className="pb-3 pr-4 font-medium">Phone</th>
              <th className="pb-3 pr-4 font-medium">Email</th>
              <th className="pb-3 pr-4 font-medium">Project</th>
              <th className="pb-3 pr-4 font-medium">Status</th>
              <th className="pb-3 pr-4 font-medium">Submitted</th>
              <th className="pb-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-text-muted text-sm">
                  No leads found
                </td>
              </tr>
            )}
            {filtered.map(lead => (
              <tr
                key={lead.id}
                className="border-b border-surface-overlay/50 hover:bg-surface-overlay/20 transition-colors"
              >
                <td className="py-3 pr-4 text-text-primary font-medium">{lead.name}</td>
                <td className="py-3 pr-4 text-text-muted">{lead.phone}</td>
                <td className="py-3 pr-4 text-text-muted max-w-[160px] truncate">
                  {lead.email ?? '—'}
                </td>
                <td className="py-3 pr-4 text-text-muted">{lead.project_slug}</td>
                <td className="py-3 pr-4">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[lead.status]}`}
                  >
                    {STATUS_LABEL[lead.status]}
                  </span>
                </td>
                <td className="py-3 pr-4 text-text-muted text-xs">{timeAgo(lead.created_at)}</td>
                <td className="py-3">
                  <Link
                    href={`/admin/leads/${lead.id}`}
                    className="text-text-muted hover:text-brand-primary text-xs transition-colors"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
