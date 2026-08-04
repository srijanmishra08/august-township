'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TOP_NAV = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/leads', label: 'Leads' },
  { href: '/admin/settings', label: 'Settings' },
]

const PROJECTS_NAV = [
  { href: '/admin/projects/august-township', label: 'August Township' },
  { href: '/admin/projects/project-2', label: 'Project 2' },
  { href: '/admin/projects/project-3', label: 'Project 3' },
]

export default function AdminSidebar() {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 bg-surface-dark border-r border-surface-overlay flex flex-col">
      <div className="px-6 py-6 border-b border-surface-overlay">
        <span className="text-lg font-bold tracking-[0.3em] text-brand-primary uppercase">
          August
        </span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {TOP_NAV.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center px-3 py-2 rounded-md text-sm transition-colors ${
              isActive(href)
                ? 'bg-surface-overlay text-text-primary font-medium'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-overlay/50'
            }`}
          >
            {label}
          </Link>
        ))}

        <p className="text-text-subtle text-xs uppercase tracking-widest px-3 pt-4 pb-1">
          Plots
        </p>
        {PROJECTS_NAV.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center px-3 py-2 rounded-md text-sm transition-colors ${
              isActive(href)
                ? 'bg-surface-overlay text-text-primary font-medium'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-overlay/50'
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {/* Notification bell — wired in Plan 06-04 */}
      <div className="px-6 py-4 border-t border-surface-overlay">
        <button
          aria-label="Notifications"
          className="text-text-subtle hover:text-text-muted transition-colors"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
