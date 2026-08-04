'use client'

import { usePathname } from 'next/navigation'
import AdminSidebar from './AdminSidebar'
import AdminTopbar from './AdminTopbar'

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === '/admin/login' || pathname === '/admin/signup') {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen bg-surface-dark">
      <AdminSidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <AdminTopbar />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
