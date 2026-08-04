import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { LeadNote } from '@/lib/types/database'

export async function POST(
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

  const { body: noteBody } = body as { body?: unknown }

  if (!noteBody || typeof noteBody !== 'string' || !noteBody.trim()) {
    return NextResponse.json({ error: 'Note body required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: noteData, error: noteError } = await admin
    .from('lead_notes')
    .insert({
      lead_id: id,
      author_id: user.id,
      body: noteBody.trim(),
    })
    .select('*')
    .single()

  if (noteError) {
    return NextResponse.json({ error: noteError.message }, { status: 500 })
  }

  const note = noteData as LeadNote

  return NextResponse.json(note, { status: 201 })
}
