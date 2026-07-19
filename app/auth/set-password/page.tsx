'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function SetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const exchangeStarted = useRef(false)
  const [status, setStatus] = useState<'exchanging' | 'ready' | 'error'>('exchanging')
  const [exchangeError, setExchangeError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Establish a session from the invite link, then let the invitee choose their password.
  useEffect(() => {
    if (exchangeStarted.current) return
    exchangeStarted.current = true

    const code = searchParams.get('code')
    const tokenHash = searchParams.get('token_hash')
    const type = searchParams.get('type') as
      | 'invite'
      | 'signup'
      | 'recovery'
      | 'email'
      | null

    const prepareSession = async () => {
      // 1) PKCE / magic-link style: ?code=...
      if (code) {
        const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeErr) {
          setExchangeError('This invite link is invalid or has already been used.')
          setStatus('error')
          return
        }
      // 2) OTP style: ?token_hash=...&type=invite
      } else if (tokenHash && type) {
        const { error: otpErr } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
        if (otpErr) {
          setExchangeError('This invite link is invalid or has already been used.')
          setStatus('error')
          return
        }
      }

      // 3) Confirm we actually have a session now. This also covers the case where
      //    /auth/callback already exchanged the code before redirecting here.
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setExchangeError('This invite link is invalid or has already been used.')
        setStatus('error')
        return
      }

      setEmail(user.email ?? '')
      setStatus('ready')
    }

    void prepareSession()
  }, [searchParams])

  const handleSetPassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password })

    if (updateErr) {
      setError(updateErr.message)
      setLoading(false)
      return
    }

    // Password set - the invite session is now a full account. Go straight into the app.
    router.push('/')
    router.refresh()
  }

  if (status === 'exchanging') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <p className="text-sm text-gray-400">Verifying your invite...</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <p className="text-sm text-red-600">{exchangeError}</p>
          <a href="/login" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 mt-4 inline-block">
            Go to sign in
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Welcome to Project Cap</h1>
          <p className="text-sm text-gray-400 mt-1">Set a password to finish setting up your account.</p>
        </div>
        {email && (
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Your sign-in email</label>
            <input
              type="email"
              value={email}
              readOnly
              className="w-full border border-gray-200 bg-gray-50 text-gray-500 rounded-xl px-3.5 py-2.5 text-sm"
            />
          </div>
        )}
        <form onSubmit={handleSetPassword} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              required
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={event => setConfirm(event.target.value)}
              required
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold transition-colors"
          >
            {loading ? 'Saving...' : 'Set password & continue'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function SetPasswordPageWrapper() {
  return (
    <Suspense>
      <SetPasswordPage />
    </Suspense>
  )
}
