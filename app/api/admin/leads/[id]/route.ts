import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Lead, LeadStatus } from '@/lib/types/database'

const LEAD_STATUSES: LeadStatus[] = [
  'new',
  'contacted',
  'site_visit_scheduled',
  'site_visit_done',
  'negotiating',
  'booked',
  'lost',
]

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { status } = body as { status?: unknown }

  if (!status || !LEAD_STATUSES.includes(status as LeadStatus)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: currentData } = await admin.from('leads').select('*').eq('id', id).single()
  const old = currentData as Lead | null
  if (!old) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  const now = new Date().toISOString()

  const { data: updatedData, error: updateError } = await admin
    .from('leads')
    .update({ status, updated_at: now })
    .eq('id', id)
    .select('*')
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const updatedLead = updatedData as Lead

  if (status !== old.status) {
    await admin.from('audit_log').insert({
      entity_type: 'lead',
      entity_id: id,
      field: 'status',
      old_value: old.status,
      new_value: status as string,
      changed_by: user.id,
    })
  }

  return NextResponse.json(updatedLead)
}
