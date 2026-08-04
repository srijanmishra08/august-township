import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Lead } from '@/lib/types/database'

type LeadInsert = Omit<Lead, 'id' | 'created_at' | 'updated_at' | 'status'>

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)

  if (!body || !body.name || !body.phone || !body.project_slug) {
    return NextResponse.json(
      { error: 'name, phone, project_slug required' },
      { status: 400 }
    )
  }

  const insert: LeadInsert = {
    name: body.name,
    phone: body.phone,
    project_slug: body.project_slug,
    email: body.email ?? null,
    message: body.message ?? null,
    plot_id: body.plot_id ?? null,
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('leads')
    .insert(insert)
    .select('id')
    .single<{ id: string }>()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: data!.id }, { status: 201 })
}
