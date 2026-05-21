'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'

type AuthMode = 'login' | 'signup' | 'forgot'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    setError('')
    setSuccess('')
    setLoading(false)
  }

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    const trimmedEmail = email.trim()
    const trimmedOrgName = orgName.trim()

    if (!trimmedOrgName) {
      setError('Organization name is required.')
      setLoading(false)
      return
    }

    const { data, error: signupError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
    })

    if (signupError) {
      setError(signupError.message)
      setLoading(false)
      return
    }

    const userId = data.user?.id
    if (!userId) {
      setError('Signup failed — please try again.')
      setLoading(false)
      return
    }

    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .insert({ name: trimmedOrgName })
      .select('id')
      .single()

    if (orgErr || !org) {
      setError('Failed to create organization.')
      setLoading(false)
      return
    }

    const { error: profileErr } = await supabase
      .from('user_profiles')
      .insert({ id: userId, organization_id: org.id, role: 'admin', email: trimmedEmail })

    if (profileErr) {
      setError('Failed to link user to organization.')
      setLoading(false)
      return
    }

    if (!data.session) {
      setSuccess('Check your email to confirm your account before signing in.')
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  const handleForgotPassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    })

    if (resetError) {
      setError(resetError.message)
      setLoading(false)
      return
    }

    setSuccess('Password reset email sent. Check your inbox.')
    setLoading(false)
  }

  const isLogin = mode === 'login'
  const isSignup = mode === 'signup'
  const isForgot = mode === 'forgot'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">
            {isLogin && 'Sign in to Project Cap'}
            {isSignup && 'Create your Project Cap account'}
            {isForgot && 'Reset your password'}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {isLogin && 'Enter your email and password to continue.'}
            {isSignup && 'Create your workspace and admin account.'}
            {isForgot && 'Enter your email and we will send you a reset link.'}
          </p>
        </div>
        <form
          onSubmit={isSignup ? handleSignup : isForgot ? handleForgotPassword : handleLogin}
          className="flex flex-col gap-4"
        >
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              required
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
            />
          </div>
          {!isForgot && (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Password</label>
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                required
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              />
            </div>
          )}
          {isSignup && (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Organization name</label>
              <input
                type="text"
                value={orgName}
                onChange={event => setOrgName(event.target.value)}
                required
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              />
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {success && <p className="text-xs text-emerald-600">{success}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold transition-colors"
          >
            {loading && isLogin && 'Signing in...'}
            {loading && isSignup && 'Creating account...'}
            {loading && isForgot && 'Sending...'}
            {!loading && isLogin && 'Sign in'}
            {!loading && isSignup && 'Create account'}
            {!loading && isForgot && 'Send reset email'}
          </button>
        </form>
        {isLogin ? (
          <div className="mt-5 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => switchMode('forgot')}
              className="font-medium text-indigo-600 hover:text-indigo-700"
            >
              Forgot password?
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className="font-medium text-indigo-600 hover:text-indigo-700"
            >
              Create an account
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => switchMode('login')}
            className="mt-5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            Back to sign in
          </button>
        )}
      </div>
    </div>
  )
}
