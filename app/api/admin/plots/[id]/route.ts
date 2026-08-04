import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Plot, PlotStatus } from '@/lib/types/database'

const PLOT_STATUSES: PlotStatus[] = ['available', 'reserved', 'sold', 'blocked']

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

  const { status, price } = body as { status?: unknown; price?: unknown }

  if (status !== undefined && !PLOT_STATUSES.includes(status as PlotStatus)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  if (price !== undefined && price !== null && typeof price !== 'number') {
    return NextResponse.json({ error: 'Invalid price' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: currentData } = await admin.from('plots').select('*').eq('id', id).single()
  const old = currentData as Plot | null
  if (!old) {
    return NextResponse.json({ error: 'Plot not found' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const update: Record<string, unknown> = { updated_at: now }
  if (status !== undefined) update.status = status
  if (price !== undefined) update.price = price

  const { data: updatedData, error: updateError } = await admin
    .from('plots')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const updatedPlot = updatedData as Plot

  const auditEntries: Array<{
    entity_type: 'plot'
    entity_id: string
    field: string
    old_value: string | null
    new_value: string | null
    changed_by: string
  }> = []

  if (status !== undefined && status !== old.status) {
    auditEntries.push({
      entity_type: 'plot',
      entity_id: id,
      field: 'status',
      old_value: old.status,
      new_value: status as string,
      changed_by: user.id,
    })
  }

  if (price !== undefined && price !== old.price) {
    auditEntries.push({
      entity_type: 'plot',
      entity_id: id,
      field: 'price',
      old_value: old.price !== null ? String(old.price) : null,
      new_value: price !== null ? String(price) : null,
      changed_by: user.id,
    })
  }

  if (auditEntries.length > 0) {
    await admin.from('audit_log').insert(auditEntries)
  }

  return NextResponse.json(updatedPlot)
}
