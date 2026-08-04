'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AdminSignup() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsConfirm, setNeedsConfirm] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (data.session) {
      // Email confirmation disabled — user is signed in immediately
      router.push('/admin')
      router.refresh()
      return
    }

    // Email confirmation enabled — show check-email state
    setNeedsConfirm(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-dark px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-2xl font-bold tracking-[0.3em] text-brand-primary uppercase">
            August
          </span>
          <p className="text-text-subtle text-sm mt-1">Create Admin Account</p>
        </div>

        <div className="bg-surface-card border border-surface-overlay rounded-lg p-8">
          {needsConfirm ? (
            <div className="text-center space-y-3">
              <p className="text-text-primary font-medium">Check your email</p>
              <p className="text-text-muted text-sm">
                We sent a confirmation link to{' '}
                <span className="text-text-primary">{email}</span>. Click it to activate
                the account, then sign in.
              </p>
              <Link
                href="/admin/login"
                className="inline-block text-brand-primary text-sm hover:underline mt-2"
              >
                Back to sign in →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm text-text-muted mb-1.5">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-surface-overlay border border-surface-overlay rounded-md px-3 py-2 text-text-primary placeholder:text-text-subtle text-sm outline-none focus:border-brand-primary transition-colors"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm text-text-muted mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full bg-surface-overlay border border-surface-overlay rounded-md px-3 py-2 text-text-primary placeholder:text-text-subtle text-sm outline-none focus:border-brand-primary transition-colors"
                />
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-primary text-surface-dark font-medium text-sm py-2 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating account…' : 'Create account'}
              </button>

              <p className="text-center text-text-muted text-sm pt-2">
                Already have an account?{' '}
                <Link href="/admin/login" className="text-brand-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
