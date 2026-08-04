'use client'

import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const TITLES: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/leads': 'Leads',
  '/admin/settings': 'Settings',
  '/admin/projects/august-township': 'Plot Management',
  '/admin/projects/project-2': 'Plot Management',
  '/admin/projects/project-3': 'Plot Management',
}

function getTitle(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname]
  if (pathname.startsWith('/admin/leads/')) return 'Lead Detail'
  if (pathname.startsWith('/admin/projects/')) return 'Plot Management'
  return 'Admin'
}

export default function AdminTopbar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  return (
    <header className="h-14 border-b border-surface-overlay flex items-center justify-between px-6 bg-surface-dark/80 backdrop-blur-sm shrink-0">
      <h1 className="text-text-primary font-medium text-sm">{getTitle(pathname)}</h1>
      <button
        onClick={handleLogout}
        className="text-text-muted hover:text-text-primary text-sm transition-colors"
      >
        Logout
      </button>
    </header>
  )
}
