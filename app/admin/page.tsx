import { createClient } from '@/lib/supabase/server'
import type { Plot, Lead } from '@/lib/types/database'
import Link from 'next/link'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default async function AdminDashboard() {
  const supabase = await createClient()

  const todayMidnight = new Date()
  todayMidnight.setUTCHours(0, 0, 0, 0)

  const [plotsResult, leadsResult, todayLeadsResult, recentLeadsResult] = await Promise.all([
    supabase.from('plots').select('status'),
    supabase.from('leads').select('status'),
    supabase
      .from('leads')
      .select('id')
      .gte('created_at', todayMidnight.toISOString()),
    supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const plots = (plotsResult.data ?? []) as Pick<Plot, 'status'>[]
  const leads = (leadsResult.data ?? []) as Pick<Lead, 'status'>[]
  const recentLeads = (recentLeadsResult.data ?? []) as Lead[]

  const availableCount = plots.filter(p => p.status === 'available').length
  const bookedCount = leads.filter(l => l.status === 'booked').length
  const totalLeads = leads.length
  const newToday = (todayLeadsResult.data ?? []).length

  const stats = [
    { label: 'Available', value: availableCount },
    { label: 'Total Leads', value: totalLeads },
    { label: 'New Today', value: newToday },
    { label: 'Booked', value: bookedCount },
  ]

  return (
    <div className="p-6 space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(stat => (
          <div
            key={stat.label}
            className="bg-surface-card rounded-xl p-5 border border-surface-overlay"
          >
            <p className="text-text-muted text-xs uppercase tracking-wide">{stat.label}</p>
            <p className="text-text-primary text-3xl font-semibold mt-2">{stat.value}</p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-text-primary text-sm font-medium mb-3">Recent Leads</h2>
        <div className="space-y-2">
          {recentLeads.length === 0 ? (
            <p className="text-text-muted text-sm">No leads yet.</p>
          ) : (
            recentLeads.map(lead => (
              <div
                key={lead.id}
                className="flex items-center justify-between bg-surface-card rounded-lg px-4 py-3 border border-surface-overlay"
              >
                <div>
                  <p className="text-text-primary text-sm font-medium">{lead.name}</p>
                  <p className="text-text-muted text-xs mt-0.5">
                    {lead.phone} · {lead.project_slug}
                  </p>
                </div>
                <span className="text-text-subtle text-xs shrink-0 ml-4">
                  {timeAgo(lead.created_at)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex gap-6">
        <Link
          href="/admin/leads"
          className="text-brand-primary text-sm hover:text-brand-secondary transition-colors"
        >
          Manage Leads →
        </Link>
        <Link
          href="/admin/projects/august-township"
          className="text-brand-primary text-sm hover:text-brand-secondary transition-colors"
        >
          Manage Plots →
        </Link>
      </div>
    </div>
  )
}
