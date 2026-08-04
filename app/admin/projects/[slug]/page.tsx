import { createClient } from '@/lib/supabase/server'
import type { Plot, AuditLog } from '@/lib/types/database'
import PlotListView from '@/components/admin/PlotListView'

export default async function AdminProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const plotsResult = await supabase
    .from('plots')
    .select('*')
    .eq('project_slug', slug)
    .order('plot_number')

  const plots = (plotsResult.data ?? []) as Plot[]

  let auditLog: AuditLog[] = []
  if (plots.length > 0) {
    const plotIds = plots.map(p => p.id)
    const auditResult = await supabase
      .from('audit_log')
      .select('*')
      .in('entity_id', plotIds)
      .order('changed_at', { ascending: false })
      .limit(10)
    auditLog = (auditResult.data ?? []) as AuditLog[]
  }

  return <PlotListView plots={plots} auditLog={auditLog} />
}
