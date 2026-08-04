import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  const path = request.nextUrl.searchParams.get('path')

  if (secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: 'invalid secret' }, { status: 401 })
  }

  if (!path) {
    return NextResponse.json({ error: 'path required' }, { status: 400 })
  }

  revalidatePath(path)
  return NextResponse.json({ revalidated: true, path })
}
