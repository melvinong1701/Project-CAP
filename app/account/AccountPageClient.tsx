'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import {
  AlertTriangle,
  Bell,
  Building2,
  Check,
  ChevronRight,
  CreditCard,
  KeyRound,
  Loader2,
  LogOut,
  Plus,
  Settings,
  Shield,
  Store,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react'
import { PLATFORMS } from '@/lib/platformRegistry'
import { cn } from '@/lib/utils'

type Role = 'owner' | 'agent'

interface AccountData {
  id: string
  organizationId: string
  role: Role
  storedRole: string
  email: string
  fullName: string
  displayName: string
  avatarUrl: string | null
  emailVerified: boolean
  notificationPreferences: NotificationPreferences
  preferences: UserPreferences
}

interface OrganizationData {
  id: string
  name: string
  logoUrl: string | null
  defaultLanguage: string
  defaultTimezone: string
  plan: string
  planName: string
  planTier: string
  storeLimit: number
  storesUsed: number
  aiConversationCount: number
  aiConversationPool: number
}

interface MemberData {
  id: string
  email: string
  role: Role
  fullName: string
  displayName: string
  avatarUrl: string | null
  joinedAt: string
  isCurrentUser: boolean
}

interface SessionData {
  id: string
  deviceName: string
  location: string | null
  lastActiveAt: string
  current: boolean
}

interface NotificationPreferences {
  new_message: boolean
  ai_escalation: boolean
  weekly_digest: boolean
}

interface UserPreferences {
  language: string
  timezone: string
}

interface StoreRow {
  id: string
  name: string
  country: string
  language: string
  currency: string
}

interface StorePlatformRow {
  store_id: string
  platform_id: string
  account_label: string | null
}

type ApiResponse<T> = {
  data: T | null
  error: string | null
  field?: string
}

const languages = [
  { value: 'en', label: 'English' },
  { value: 'ms', label: 'Bahasa Malaysia' },
  { value: 'id', label: 'Bahasa Indonesia' },
]

const timezones = [
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Jakarta',
  'Asia/Bangkok',
  'Asia/Manila',
  'Asia/Ho_Chi_Minh',
  'UTC',
]

const marketplacePlatformIds = ['shopee', 'lazada', 'tiktok_shop']

const sections = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'organization', label: 'Organization', icon: Building2 },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'stores', label: 'Connected stores', icon: Store, ownerOnly: true },
  { id: 'billing', label: 'Plan & billing', icon: CreditCard, ownerOnly: true },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'preferences', label: 'My preferences', icon: Settings },
  { id: 'danger', label: 'Danger zone', icon: AlertTriangle },
]

function initials(name: string) {
  return (name.trim().charAt(0) || '?').toUpperCase()
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

async function readJson<T>(response: Response): Promise<ApiResponse<T>> {
  const body = await response.json().catch(() => ({}))
  return body as ApiResponse<T>
}

function SectionHeader({
  id,
  label,
  icon: Icon,
}: {
  id: string
  label: string
  icon: React.ElementType
}) {
  return (
    <div id={id} className="mb-5 flex items-center gap-2">
      <Icon className="h-4 w-4 text-gray-400" />
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</h2>
    </div>
  )
}

function AvatarPreview({
  name,
  imageUrl,
  size = 'md',
}: {
  name: string
  imageUrl: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizeClass = size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-16 w-16 text-lg' : 'h-11 w-11 text-sm'

  return imageUrl ? (
    <div
      aria-hidden="true"
      className={cn(sizeClass, 'rounded-full border border-gray-100 bg-cover bg-center')}
      style={{ backgroundImage: `url(${imageUrl})` }}
    />
  ) : (
    <div className={cn(sizeClass, 'flex items-center justify-center rounded-full bg-gray-900 font-semibold text-white')}>
      {initials(name)}
    </div>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-gray-500">{label}</span>
      {children}
      {error && <span className="mt-1.5 block text-xs text-red-600">{error}</span>}
    </label>
  )
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400',
        props.className
      )}
    />
  )
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400',
        props.className
      )}
    />
  )
}

function ToggleSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50',
        checked ? 'bg-indigo-600' : 'bg-gray-200'
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition',
          checked ? 'translate-x-5' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
        role === 'owner' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'
      )}
    >
      {role === 'owner' ? 'Owner' : 'Agent'}
    </span>
  )
}

function InlineStatus({ tone, message }: { tone: 'success' | 'error' | 'muted'; message: string }) {
  return (
    <p className={cn(
      'text-xs',
      tone === 'success' && 'text-emerald-600',
      tone === 'error' && 'text-red-600',
      tone === 'muted' && 'text-gray-400'
    )}>
      {message}
    </p>
  )
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-700">
            <span className="sr-only">Close</span>
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function AccountPageClient() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [account, setAccount] = useState<AccountData | null>(null)
  const [organization, setOrganization] = useState<OrganizationData | null>(null)
  const [members, setMembers] = useState<MemberData[]>([])
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [stores, setStores] = useState<StoreRow[]>([])
  const [platforms, setPlatforms] = useState<StorePlatformRow[]>([])
  const [activeSection, setActiveSection] = useState('profile')

  const [profileForm, setProfileForm] = useState({ fullName: '', displayName: '', email: '', avatarUrl: '' })
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({})
  const [profileStatus, setProfileStatus] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({})
  const [passwordStatus, setPasswordStatus] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)

  const [orgForm, setOrgForm] = useState({ name: '', logoUrl: '', defaultLanguage: 'en', defaultTimezone: 'Asia/Singapore' })
  const [orgErrors, setOrgErrors] = useState<Record<string, string>>({})
  const [orgStatus, setOrgStatus] = useState('')
  const [orgSaving, setOrgSaving] = useState(false)

  const [notifications, setNotifications] = useState<NotificationPreferences>({
    new_message: true,
    ai_escalation: true,
    weekly_digest: false,
  })
  const [notificationStatus, setNotificationStatus] = useState('')

  const [preferences, setPreferences] = useState<UserPreferences>({ language: 'en', timezone: 'Asia/Singapore' })
  const [preferencesStatus, setPreferencesStatus] = useState('')
  const [preferencesSaving, setPreferencesSaving] = useState(false)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteStatus, setInviteStatus] = useState('')
  const [inviteSaving, setInviteSaving] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferUserId, setTransferUserId] = useState('')
  const [transferStatus, setTransferStatus] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteStatus, setDeleteStatus] = useState('')

  const isOwner = account?.role === 'owner'

  const visibleSections = useMemo(
    () => sections.filter(section => !section.ownerOnly || isOwner),
    [isOwner]
  )

  const connectedMarketplaceRows = useMemo(() => {
    return platforms
      .filter(platform => marketplacePlatformIds.includes(platform.platform_id))
      .map(platform => ({
        platform,
        store: stores.find(store => store.id === platform.store_id) ?? null,
        definition: PLATFORMS.find(item => item.id === platform.platform_id),
      }))
      .filter(row => row.store && row.definition)
  }, [platforms, stores])

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError('')

    try {
      const [accountRes, orgRes, membersRes, sessionsRes, storesRes] = await Promise.all([
        fetch('/api/account'),
        fetch('/api/org'),
        fetch('/api/org/members'),
        fetch('/api/account/sessions'),
        fetch('/api/stores'),
      ])

      const accountBody = await readJson<{ account: AccountData }>(accountRes)
      const orgBody = await readJson<{ organization: OrganizationData }>(orgRes)
      const membersBody = await readJson<{ members: MemberData[] }>(membersRes)
      const sessionsBody = await readJson<{ sessions: SessionData[] }>(sessionsRes)
      const storesBody = await storesRes.json().catch(() => ({})) as { stores?: StoreRow[]; platforms?: StorePlatformRow[] }

      if (!accountRes.ok || !accountBody.data?.account) throw new Error(accountBody.error ?? 'Failed to load account')
      if (!orgRes.ok || !orgBody.data?.organization) throw new Error(orgBody.error ?? 'Failed to load organization')
      if (!membersRes.ok || !membersBody.data?.members) throw new Error(membersBody.error ?? 'Failed to load members')

      const nextAccount = accountBody.data.account
      const nextOrg = orgBody.data.organization

      setAccount(nextAccount)
      setOrganization(nextOrg)
      setMembers(membersBody.data.members)
      setSessions(sessionsBody.data?.sessions ?? [])
      setStores(storesBody.stores ?? [])
      setPlatforms(storesBody.platforms ?? [])
      setProfileForm({
        fullName: nextAccount.fullName,
        displayName: nextAccount.displayName,
        email: nextAccount.email,
        avatarUrl: nextAccount.avatarUrl ?? '',
      })
      setOrgForm({
        name: nextOrg.name,
        logoUrl: nextOrg.logoUrl ?? '',
        defaultLanguage: nextOrg.defaultLanguage,
        defaultTimezone: nextOrg.defaultTimezone,
      })
      setNotifications(nextAccount.notificationPreferences)
      setPreferences(nextAccount.preferences)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load account')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const reloadStores = async () => {
    const response = await fetch('/api/stores')
    const body = await response.json().catch(() => ({})) as { stores?: StoreRow[]; platforms?: StorePlatformRow[] }
    setStores(body.stores ?? [])
    setPlatforms(body.platforms ?? [])
  }

  const saveProfile = async () => {
    setProfileSaving(true)
    setProfileErrors({})
    setProfileStatus('')

    const response = await fetch('/api/account/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileForm),
    })
    const body = await readJson<{ ok: boolean }>(response)

    if (!response.ok) {
      setProfileErrors(body.field ? { [body.field]: body.error ?? 'Invalid value' } : {})
      setProfileStatus(body.error ?? 'Failed to save profile')
      setProfileSaving(false)
      return
    }

    setProfileStatus('Profile saved')
    await loadData()
    setProfileSaving(false)
  }

  const changePassword = async () => {
    setPasswordSaving(true)
    setPasswordErrors({})
    setPasswordStatus('')

    if (passwordForm.newPassword.length < 8) {
      setPasswordErrors({ newPassword: 'New password must be at least 8 characters' })
      setPasswordSaving(false)
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordErrors({ confirmPassword: 'Passwords do not match' })
      setPasswordSaving(false)
      return
    }

    const response = await fetch('/api/account/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(passwordForm),
    })
    const body = await readJson<{ ok: boolean }>(response)

    if (!response.ok) {
      setPasswordErrors(body.field ? { [body.field]: body.error ?? 'Invalid value' } : {})
      setPasswordStatus(body.error ?? 'Failed to update password')
      setPasswordSaving(false)
      return
    }

    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    setPasswordStatus('Password updated')
    setPasswordSaving(false)
  }

  const saveOrganization = async () => {
    setOrgSaving(true)
    setOrgErrors({})
    setOrgStatus('')

    const response = await fetch('/api/org', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orgForm),
    })
    const body = await readJson<{ ok: boolean }>(response)

    if (!response.ok) {
      setOrgErrors(body.field ? { [body.field]: body.error ?? 'Invalid value' } : {})
      setOrgStatus(body.error ?? 'Failed to save organization')
      setOrgSaving(false)
      return
    }

    setOrgStatus('Organization saved')
    await loadData()
    setOrgSaving(false)
  }

  const saveNotification = async (key: keyof NotificationPreferences, checked: boolean) => {
    const previous = notifications
    const next = { ...notifications, [key]: checked }
    setNotifications(next)
    setNotificationStatus('Saving...')

    const response = await fetch('/api/account/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationPreferences: next }),
    })

    if (!response.ok) {
      setNotifications(previous)
      setNotificationStatus('Could not save')
      return
    }

    setNotificationStatus('Saved')
    window.setTimeout(() => setNotificationStatus(''), 1800)
  }

  const savePreferences = async () => {
    setPreferencesSaving(true)
    setPreferencesStatus('')

    const response = await fetch('/api/account/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences }),
    })
    const body = await readJson<{ preferences: UserPreferences }>(response)

    if (!response.ok) {
      setPreferencesStatus(body.error ?? 'Failed to save preferences')
      setPreferencesSaving(false)
      return
    }

    setPreferencesStatus('Preferences saved')
    setPreferencesSaving(false)
  }

  const inviteMember = async () => {
    setInviteSaving(true)
    setInviteStatus('')

    const response = await fetch('/api/org/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, role: 'agent' }),
    })
    const body = await readJson<{ ok: boolean }>(response)

    if (!response.ok) {
      setInviteStatus(body.error ?? 'Failed to invite member')
      setInviteSaving(false)
      return
    }

    setInviteEmail('')
    setInviteOpen(false)
    await loadData()
    setInviteSaving(false)
  }

  const removeMember = async (member: MemberData) => {
    if (!window.confirm(`Remove ${member.displayName} from this organization?`)) return

    const response = await fetch(`/api/org/members/${encodeURIComponent(member.id)}`, { method: 'DELETE' })
    if (!response.ok) return
    await loadData()
  }

  const disconnectPlatform = async (storeId: string, platformId: string) => {
    const response = await fetch(
      `/api/stores/${encodeURIComponent(storeId)}/platforms/${encodeURIComponent(platformId)}`,
      { method: 'DELETE' }
    )
    if (response.ok) await reloadStores()
  }

  const signOut = async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const signOutSession = async (sessionId: string) => {
    const response = await fetch(`/api/account/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
    if (response.ok) {
      setSessions(current => current.filter(session => session.id !== sessionId))
    }
  }

  const signOutOtherSessions = async () => {
    const response = await fetch('/api/account/sessions', { method: 'DELETE' })
    if (response.ok) {
      setSessions(current => current.filter(session => session.current))
    }
  }

  const transferOwnership = async () => {
    setTransferStatus('')
    const response = await fetch('/api/org/transfer-ownership', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: transferUserId }),
    })
    const body = await readJson<{ ok: boolean }>(response)

    if (!response.ok) {
      setTransferStatus(body.error ?? 'Failed to transfer ownership')
      return
    }

    setTransferOpen(false)
    await loadData()
  }

  const deleteOrganization = async () => {
    setDeleteStatus('')
    const response = await fetch('/api/org', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmName: deleteConfirm }),
    })
    const body = await readJson<{ ok: boolean }>(response)

    if (!response.ok) {
      setDeleteStatus(body.error ?? 'Failed to delete organization')
      return
    }

    await signOut()
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
      </main>
    )
  }

  if (loadError || !account || !organization) {
    return (
      <main className="min-h-screen bg-gray-50 px-6 py-10">
        <div className="mx-auto max-w-xl rounded-lg border border-red-100 bg-white p-6">
          <h1 className="text-base font-semibold text-gray-900">Account unavailable</h1>
          <p className="mt-2 text-sm text-red-600">{loadError || 'Could not load account data.'}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 transition hover:text-gray-900"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
            Inbox
          </button>
          <div className="flex items-center gap-3">
            <AvatarPreview name={account.displayName} imageUrl={account.avatarUrl} size="sm" />
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-900">{account.displayName}</p>
              <p className="text-xs text-gray-400">{organization.name}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-5 py-6 lg:grid-cols-[240px_1fr]">
        <aside className="lg:sticky lg:top-6 lg:h-fit">
          <select
            value={activeSection}
            onChange={event => {
              setActiveSection(event.target.value)
              document.getElementById(event.target.value)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            className="mb-4 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm lg:hidden"
          >
            {visibleSections.map(section => (
              <option key={section.id} value={section.id}>{section.label}</option>
            ))}
          </select>

          <nav className="hidden rounded-lg border border-gray-100 bg-white p-2 lg:block">
            {visibleSections.map(section => {
              const Icon = section.icon
              return (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition',
                    activeSection === section.id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {section.label}
                </a>
              )
            })}
          </nav>
        </aside>

        <div className="space-y-6">
          <section className="rounded-lg border border-gray-100 bg-white p-6">
            <SectionHeader id="profile" label="Profile" icon={User} />
            <div className="grid gap-5 md:grid-cols-[auto_1fr]">
              <AvatarPreview name={profileForm.displayName} imageUrl={profileForm.avatarUrl || null} size="lg" />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Full name" error={profileErrors.fullName}>
                  <TextInput value={profileForm.fullName} onChange={event => setProfileForm({ ...profileForm, fullName: event.target.value })} />
                </Field>
                <Field label="Display name" error={profileErrors.displayName}>
                  <TextInput value={profileForm.displayName} onChange={event => setProfileForm({ ...profileForm, displayName: event.target.value })} />
                </Field>
                <Field label="Email address" error={profileErrors.email}>
                  <div className="flex items-center gap-2">
                    <TextInput type="email" value={profileForm.email} onChange={event => setProfileForm({ ...profileForm, email: event.target.value })} />
                    {account.emailVerified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        <Check className="h-3 w-3" />
                        Verified
                      </span>
                    )}
                  </div>
                </Field>
                <Field label="Avatar URL" error={profileErrors.avatarUrl}>
                  <TextInput value={profileForm.avatarUrl} onChange={event => setProfileForm({ ...profileForm, avatarUrl: event.target.value })} placeholder="https://..." />
                </Field>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                disabled={profileSaving}
                onClick={saveProfile}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
              >
                {profileSaving ? 'Saving...' : 'Save profile'}
              </button>
              {profileStatus && <InlineStatus tone={profileStatus.includes('saved') ? 'success' : 'error'} message={profileStatus} />}
            </div>
          </section>

          <section className="rounded-lg border border-gray-100 bg-white p-6">
            <SectionHeader id="security" label="Security" icon={Shield} />
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Current password" error={passwordErrors.currentPassword}>
                <TextInput type="password" value={passwordForm.currentPassword} onChange={event => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} />
              </Field>
              <Field label="New password" error={passwordErrors.newPassword}>
                <TextInput type="password" value={passwordForm.newPassword} onChange={event => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} />
              </Field>
              <Field label="Confirm new password" error={passwordErrors.confirmPassword}>
                <TextInput type="password" value={passwordForm.confirmPassword} onChange={event => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} />
              </Field>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                disabled={passwordSaving}
                onClick={changePassword}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
              >
                <KeyRound className="h-4 w-4" />
                {passwordSaving ? 'Updating...' : 'Change password'}
              </button>
              {passwordStatus && <InlineStatus tone={passwordStatus.includes('updated') ? 'success' : 'error'} message={passwordStatus} />}
            </div>

            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-gray-900">Active sessions</h3>
                {sessions.length > 1 && (
                  <button type="button" onClick={signOutOtherSessions} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                    Sign out all other sessions
                  </button>
                )}
              </div>
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                {sessions.map(session => (
                  <div key={session.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {session.deviceName}
                        {session.current && <span className="ml-2 text-xs font-semibold text-emerald-600">Current</span>}
                      </p>
                      <p className="text-xs text-gray-400">
                        {session.location ?? 'Location unavailable'} - Last active {formatDate(session.lastActiveAt)}
                      </p>
                    </div>
                    {!session.current && (
                      <button type="button" onClick={() => signOutSession(session.id)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                        Sign out
                      </button>
                    )}
                  </div>
                ))}
                {sessions.length === 0 && <p className="px-4 py-3 text-sm text-gray-400">No active sessions found.</p>}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-gray-100 bg-white p-6">
            <SectionHeader id="organization" label="Organization" icon={Building2} />
            <div className="grid gap-5 md:grid-cols-[auto_1fr]">
              <AvatarPreview name={orgForm.name} imageUrl={orgForm.logoUrl || null} size="lg" />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Org name" error={orgErrors.name}>
                  <TextInput disabled={!isOwner} value={orgForm.name} onChange={event => setOrgForm({ ...orgForm, name: event.target.value })} />
                </Field>
                <Field label="Org logo URL" error={orgErrors.logoUrl}>
                  <TextInput disabled={!isOwner} value={orgForm.logoUrl} onChange={event => setOrgForm({ ...orgForm, logoUrl: event.target.value })} placeholder="https://..." />
                </Field>
                <Field label="Default language" error={orgErrors.defaultLanguage}>
                  <SelectInput disabled={!isOwner} value={orgForm.defaultLanguage} onChange={event => setOrgForm({ ...orgForm, defaultLanguage: event.target.value })}>
                    {languages.map(language => <option key={language.value} value={language.value}>{language.label}</option>)}
                  </SelectInput>
                </Field>
                <Field label="Default timezone" error={orgErrors.defaultTimezone}>
                  <TextInput disabled={!isOwner} list="org-timezones" value={orgForm.defaultTimezone} onChange={event => setOrgForm({ ...orgForm, defaultTimezone: event.target.value })} />
                </Field>
              </div>
            </div>
            <datalist id="org-timezones">
              {timezones.map(timezone => <option key={timezone} value={timezone} />)}
            </datalist>
            {isOwner && (
              <div className="mt-5 flex items-center gap-3">
                <button type="button" disabled={orgSaving} onClick={saveOrganization} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50">
                  {orgSaving ? 'Saving...' : 'Save organization'}
                </button>
                {orgStatus && <InlineStatus tone={orgStatus.includes('saved') ? 'success' : 'error'} message={orgStatus} />}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-gray-100 bg-white p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <SectionHeader id="team" label="Team" icon={Users} />
              {isOwner && (
                <button type="button" onClick={() => setInviteOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800">
                  <Plus className="h-4 w-4" />
                  Invite
                </button>
              )}
            </div>
            <div className="overflow-hidden rounded-lg border border-gray-100">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Member</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Joined</th>
                    {isOwner && <th className="px-4 py-3 font-semibold" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {members.map(member => (
                    <tr key={member.id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <AvatarPreview name={member.displayName} imageUrl={member.avatarUrl} size="sm" />
                          <div>
                            <p className="font-medium text-gray-900">{member.fullName}</p>
                            <p className="text-xs text-gray-400">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><RoleBadge role={member.role} /></td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(member.joinedAt)}</td>
                      {isOwner && (
                        <td className="px-4 py-3 text-right">
                          {!member.isCurrentUser && (
                            <button type="button" onClick={() => removeMember(member)} className="text-xs font-semibold text-red-500 hover:text-red-600">
                              Remove
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {isOwner && (
            <section className="rounded-lg border border-gray-100 bg-white p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <SectionHeader id="stores" label="Connected stores" icon={Store} />
                <button type="button" onClick={() => router.push('/settings')} className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800">
                  <Plus className="h-4 w-4" />
                  Add store
                </button>
              </div>
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                {connectedMarketplaceRows.map(row => (
                  <div key={`${row.platform.store_id}-${row.platform.platform_id}`} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="flex items-center gap-3">
                      {row.definition && (
                        <Image src={row.definition.logo} alt="" width={28} height={28} className="h-7 w-7" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900">{row.store?.name}</p>
                        <p className="text-xs text-gray-400">{row.definition?.label} - {row.platform.account_label ?? 'Connected account'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Connected</span>
                      <button type="button" onClick={() => disconnectPlatform(row.platform.store_id, row.platform.platform_id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50">
                        Disconnect
                      </button>
                    </div>
                  </div>
                ))}
                {connectedMarketplaceRows.length === 0 && (
                  <p className="px-4 py-3 text-sm text-gray-400">No marketplace stores connected yet.</p>
                )}
              </div>
            </section>
          )}

          {isOwner && (
            <section className="rounded-lg border border-gray-100 bg-white p-6">
              <SectionHeader id="billing" label="Plan & billing" icon={CreditCard} />
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Plan</p>
                  <p className="mt-2 text-lg font-semibold text-gray-900">{organization.planName}</p>
                  <p className="text-xs text-gray-400">{organization.planTier}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Stores used</p>
                  <p className="mt-2 text-lg font-semibold text-gray-900">{organization.storesUsed} of {organization.storeLimit}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">AI conversations</p>
                  <p className="mt-2 text-lg font-semibold text-gray-900">{organization.aiConversationCount.toLocaleString()} of {organization.aiConversationPool.toLocaleString()}</p>
                </div>
              </div>
              <button type="button" onClick={() => window.alert('Billing route TBD')} className="mt-5 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
                Manage billing
              </button>
            </section>
          )}

          <section className="rounded-lg border border-gray-100 bg-white p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <SectionHeader id="notifications" label="Notifications" icon={Bell} />
              {notificationStatus && <InlineStatus tone={notificationStatus === 'Saved' ? 'success' : notificationStatus === 'Saving...' ? 'muted' : 'error'} message={notificationStatus} />}
            </div>
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {[
                { key: 'new_message' as const, title: 'New message' },
                { key: 'ai_escalation' as const, title: 'AI escalation' },
                { key: 'weekly_digest' as const, title: 'Weekly digest' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between gap-4 px-4 py-3">
                  <p className="text-sm font-medium text-gray-900">{item.title}</p>
                  <ToggleSwitch checked={notifications[item.key]} onChange={checked => saveNotification(item.key, checked)} />
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-gray-100 bg-white p-6">
            <SectionHeader id="preferences" label="My preferences" icon={Settings} />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Language">
                <SelectInput value={preferences.language} onChange={event => setPreferences({ ...preferences, language: event.target.value })}>
                  {languages.map(language => <option key={language.value} value={language.value}>{language.label}</option>)}
                </SelectInput>
              </Field>
              <Field label="Timezone">
                <TextInput list="preference-timezones" value={preferences.timezone} onChange={event => setPreferences({ ...preferences, timezone: event.target.value })} />
              </Field>
            </div>
            <datalist id="preference-timezones">
              {timezones.map(timezone => <option key={timezone} value={timezone} />)}
            </datalist>
            <div className="mt-5 flex items-center gap-3">
              <button type="button" disabled={preferencesSaving} onClick={savePreferences} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50">
                {preferencesSaving ? 'Saving...' : 'Save preferences'}
              </button>
              {preferencesStatus && <InlineStatus tone={preferencesStatus.includes('saved') ? 'success' : 'error'} message={preferencesStatus} />}
            </div>
          </section>

          <section className="rounded-lg border border-red-200 bg-white p-6">
            <SectionHeader id="danger" label="Danger zone" icon={AlertTriangle} />
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={signOut} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
              {isOwner && (
                <>
                  <button type="button" onClick={() => setTransferOpen(true)} className="rounded-lg border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50">
                    Transfer ownership
                  </button>
                  <button type="button" onClick={() => setDeleteOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
                    <Trash2 className="h-4 w-4" />
                    Delete organization
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      </div>

      {inviteOpen && (
        <Modal title="Invite agent" onClose={() => setInviteOpen(false)}>
          <div className="space-y-4">
            <Field label="Email">
              <TextInput type="email" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} autoFocus />
            </Field>
            <Field label="Role">
              <SelectInput value="agent" disabled>
                <option value="agent">Agent</option>
              </SelectInput>
            </Field>
            {inviteStatus && <InlineStatus tone="error" message={inviteStatus} />}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setInviteOpen(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
              <button type="button" disabled={inviteSaving} onClick={inviteMember} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50">
                {inviteSaving ? 'Inviting...' : 'Send invite'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {transferOpen && (
        <Modal title="Transfer ownership" onClose={() => setTransferOpen(false)}>
          <div className="space-y-4">
            <Field label="New owner">
              <SelectInput value={transferUserId} onChange={event => setTransferUserId(event.target.value)}>
                <option value="">Select a member</option>
                {members.filter(member => !member.isCurrentUser).map(member => (
                  <option key={member.id} value={member.id}>{member.displayName}</option>
                ))}
              </SelectInput>
            </Field>
            {transferStatus && <InlineStatus tone="error" message={transferStatus} />}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setTransferOpen(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={transferOwnership} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
                Confirm transfer
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteOpen && (
        <Modal title="Delete organization" onClose={() => setDeleteOpen(false)}>
          <div className="space-y-4">
            <Field label={`Type "${organization.name}" to confirm`}>
              <TextInput value={deleteConfirm} onChange={event => setDeleteConfirm(event.target.value)} autoFocus />
            </Field>
            {deleteStatus && <InlineStatus tone="error" message={deleteStatus} />}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteOpen(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
              <button type="button" disabled={deleteConfirm !== organization.name} onClick={deleteOrganization} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                Delete organization
              </button>
            </div>
          </div>
        </Modal>
      )}
    </main>
  )
}
