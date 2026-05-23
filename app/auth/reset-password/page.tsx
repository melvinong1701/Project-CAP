'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'exchanging' | 'ready' | 'error'>('exchanging')
  const [exchangeError, setExchangeError] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const prepareSession = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !data.session) {
        setExchangeError('This password reset link is invalid or has expired.')
        setStatus('error')
        return
      }

      setStatus('ready')
    }

    void prepareSession()
  }, [])

  const handleReset = async (event: React.FormEvent) => {
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

    await supabase.auth.signOut()
    router.push('/login')
  }

  if (status === 'exchanging') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <p className="text-sm text-gray-400">Verifying reset link…</p>
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
            Request a new link
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Set a new password</h1>
          <p className="text-sm text-gray-400 mt-1">Choose a strong password for your account.</p>
        </div>
        <form onSubmit={handleReset} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">New password</label>
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              required
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
            {loading ? 'Saving...' : 'Set password'}
          </button>
        </form>
      </div>
    </div>
  )
}
