import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Lead, LeadNote, Plot } from '@/lib/types/database'
import LeadDetailPanel from '@/components/admin/LeadDetailPanel'

type PlotMeta = Pick<Plot, 'plot_number' | 'type' | 'area_sqft'>

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const leadResult = await supabase.from('leads').select('*').eq('id', id).single()
  const lead = leadResult.data as Lead | null
  if (!lead) notFound()

  const notesResult = await supabase
    .from('lead_notes')
    .select('*')
    .eq('lead_id', id)
    .order('created_at')
  const notes = (notesResult.data ?? []) as LeadNote[]

  let plot: PlotMeta | null = null
  if (lead.plot_id) {
    const plotResult = await supabase
      .from('plots')
      .select('plot_number, type, area_sqft')
      .eq('id', lead.plot_id)
      .single()
    plot = plotResult.data as PlotMeta | null
  }

  return <LeadDetailPanel lead={lead} notes={notes} plot={plot} />
}
