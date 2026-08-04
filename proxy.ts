import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/lib/types/database'

export async function proxy(request: NextRequest) {
  const isAdminRoute = request.nextUrl.pathname.startsWith('/admin')
  const isPublicAuthPage =
    request.nextUrl.pathname.startsWith('/admin/login') ||
    request.nextUrl.pathname.startsWith('/admin/signup')

  if (!isAdminRoute || isPublicAuthPage) return NextResponse.next()

  // Preserve cookies across the session refresh
  const supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() validates the session server-side — never use getSession() here
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/admin/:path*'],
}
