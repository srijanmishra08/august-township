import { createClient } from '@/lib/supabase/server'
import type { Lead } from '@/lib/types/database'
import LeadListView from '@/components/admin/LeadListView'

export default async function AdminLeads() {
  const supabase = await createClient()
  const result = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })

  const leads = (result.data ?? []) as Lead[]

  return <LeadListView leads={leads} />
}
