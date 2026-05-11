'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Store, Bot, Bell, Users, CreditCard,
  Check, X, Plus, Mail, Eye, ChevronDown,
  Crown, UserCog, MessageSquare, Trash2,
  ExternalLink, AlertCircle, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Nav ────────────────────────────────────────────────────────────────────

const navItems = [
  { id: 'platforms', label: 'Connected platforms', icon: Store },
  { id: 'ai', label: 'AI settings', icon: Bot },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'team', label: 'Team & agents', icon: Users },
  { id: 'billing', label: 'Plan & billing', icon: CreditCard },
]

// ─── Platform data ───────────────────────────────────────────────────────────

const marketplaces = [
  { id: 'shopee', name: 'Shopee', description: 'SG · MY · TH · ID · PH · VN · TW', color: 'bg-orange-500', letter: 'S' },
  { id: 'lazada', name: 'Lazada', description: 'SG · MY · TH · ID · PH · VN', color: 'bg-blue-600', letter: 'L' },
  { id: 'tiktok_shop', name: 'TikTok Shop', description: 'SG · MY · TH · ID · PH · VN', color: 'bg-black', letter: 'T' },
  { id: 'tokopedia', name: 'Tokopedia', description: 'ID', color: 'bg-green-500', letter: 'T' },
]

type PlatformId = 'whatsapp' | 'facebook_messenger' | 'instagram' | 'line' | 'telegram' | 'zalo'

interface MessagingPlatform {
  id: PlatformId
  name: string
  description: string
  color: string
  letter: string
  connectable: boolean
  connectLabel?: string
  steps?: string[]
  accountPlaceholder?: string
}

const messagingPlatforms: MessagingPlatform[] = [
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    description: 'All of SEA · Most widely used',
    color: 'bg-green-600',
    letter: 'W',
    connectable: true,
    connectLabel: 'Connect via Meta',
    steps: [
      'Authorize OakChat with your Meta Business account',
      'Select your verified WhatsApp Business number',
      'Choose which stores to route messages to',
    ],
    accountPlaceholder: '+65 9123 4567 (TechGear SG)',
  },
  {
    id: 'facebook_messenger',
    name: 'Facebook Messenger',
    description: 'All of SEA · Meta',
    color: 'bg-blue-500',
    letter: 'M',
    connectable: true,
    connectLabel: 'Connect via Meta',
    steps: [
      'Log in to Facebook and authorize OakChat',
      'Select the Facebook Page to connect',
      'Choose which stores to route messages to',
    ],
    accountPlaceholder: 'TechGear SG Official Page',
  },
  {
    id: 'instagram',
    name: 'Instagram Direct',
    description: 'All of SEA · Meta',
    color: 'bg-pink-500',
    letter: 'I',
    connectable: true,
    connectLabel: 'Connect via Meta',
    steps: [
      'Connect your Instagram Business account via Facebook',
      'Select the Instagram account to link',
      'Choose which stores to route DMs to',
    ],
    accountPlaceholder: '@homedecor.my',
  },
  {
    id: 'line',
    name: 'LINE',
    description: 'TH · TW · JP',
    color: 'bg-green-400',
    letter: 'L',
    connectable: false,
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'All regions · Popular with tech-savvy sellers',
    color: 'bg-sky-500',
    letter: 'T',
    connectable: false,
  },
  {
    id: 'zalo',
    name: 'Zalo',
    description: 'VN · Dominant messaging app',
    color: 'bg-blue-700',
    letter: 'Z',
    connectable: false,
  },
]

// ─── Team data ───────────────────────────────────────────────────────────────

type Role = 'owner' | 'admin' | 'agent' | 'viewer'

interface TeamMember {
  id: string
  name: string
  email: string
  role: Role
  status: 'active' | 'invited'
  avatar: string
}

const initialTeam: TeamMember[] = [
  { id: '1', name: 'Melvin', email: 'melvinong1701@gmail.com', role: 'owner', status: 'active', avatar: 'M' },
  { id: '2', name: 'Ryan', email: 'ryan@oakchat.app', role: 'admin', status: 'active', avatar: 'R' },
  { id: '3', name: 'Martin', email: 'martin@oakchat.app', role: 'admin', status: 'active', avatar: 'M' },
]

const roleConfig: Record<Role, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  owner: { label: 'Owner', color: 'text-amber-700', bg: 'bg-amber-50', icon: Crown },
  admin: { label: 'Admin', color: 'text-indigo-700', bg: 'bg-indigo-50', icon: UserCog },
  agent: { label: 'Agent', color: 'text-green-700', bg: 'bg-green-50', icon: MessageSquare },
  viewer: { label: 'Viewer', color: 'text-gray-600', bg: 'bg-gray-100', icon: Eye },
}

const roleDescriptions: Record<Role, string> = {
  owner: 'Full access including billing, workspace settings, and team management.',
  admin: 'Full access to conversations and settings. Can manage team, but not billing.',
  agent: 'Can view and reply to conversations, use AI suggestions, and assign chats. No settings access.',
  viewer: 'Read-only. Can see conversations but cannot reply or make changes.',
}

const permissions = [
  { label: 'View all conversations', owner: true, admin: true, agent: true, viewer: true },
  { label: 'Reply to conversations', owner: true, admin: true, agent: true, viewer: false },
  { label: 'Use AI suggestions', owner: true, admin: true, agent: true, viewer: false },
  { label: 'Assign conversations', owner: true, admin: true, agent: true, viewer: false },
  { label: 'Add tags', owner: true, admin: true, agent: true, viewer: false },
  { label: 'Configure AI settings', owner: true, admin: true, agent: false, viewer: false },
  { label: 'Manage connected stores', owner: true, admin: true, agent: false, viewer: false },
  { label: 'Manage team members', owner: true, admin: true, agent: false, viewer: false },
  { label: 'View reports', owner: true, admin: true, agent: false, viewer: false },
  { label: 'Manage billing', owner: true, admin: false, agent: false, viewer: false },
  { label: 'Delete workspace', owner: true, admin: false, agent: false, viewer: false },
]

// ─── Sub-components ──────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: Role }) {
  const cfg = roleConfig[role]
  const Icon = cfg.icon
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cfg.bg, cfg.color)}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

// ─── Connect Modal ────────────────────────────────────────────────────────────

interface ConnectModalProps {
  platform: MessagingPlatform
  onClose: () => void
  onConnect: (platformId: PlatformId, account: string) => void
}

function ConnectModal({ platform, onClose, onConnect }: ConnectModalProps) {
  const [step, setStep] = useState<'intro' | 'connecting' | 'done'>('intro')

  const handleConnect = () => {
    setStep('connecting')
    // Simulate OAuth / API handshake
    setTimeout(() => {
      setStep('done')
    }, 1800)
  }

  const handleFinish = () => {
    onConnect(platform.id, platform.accountPlaceholder ?? 'Connected account')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={step !== 'connecting' ? onClose : undefined} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', platform.color)}>
              <span className="text-white font-bold text-sm">{platform.letter}</span>
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Connect {platform.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{platform.description}</p>
            </div>
          </div>
          {step !== 'connecting' && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Steps (intro) */}
        {step === 'intro' && (
          <>
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">What happens next</p>
              {platform.steps?.map((s, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-sm text-gray-600">{s}</p>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 text-xs text-gray-400 bg-amber-50 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p>OakChat only requests read/write access to messages. We never post to your profile or access your contacts.</p>
            </div>
            <button
              onClick={handleConnect}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              {platform.connectLabel}
            </button>
          </>
        )}

        {/* Connecting */}
        {step === 'connecting' && (
          <div className="flex flex-col items-center py-8 gap-4">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            <p className="text-sm text-gray-500">Connecting to {platform.name}…</p>
          </div>
        )}

        {/* Done */}
        {step === 'done' && (
          <>
            <div className="flex flex-col items-center py-4 gap-3">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-gray-900 text-sm">Connected!</p>
                <p className="text-xs text-gray-400 mt-1">{platform.accountPlaceholder}</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
              Messages from <span className="font-medium">{platform.name}</span> will now flow into your OakChat inbox. AI replies are active by default.
            </div>
            <button
              onClick={handleFinish}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Platform Card ────────────────────────────────────────────────────────────

interface PlatformCardProps {
  platform: MessagingPlatform
  isConnected: boolean
  connectedAccount?: string
  onConnect: () => void
  onDisconnect: () => void
}

function MessagingPlatformCard({ platform, isConnected, connectedAccount, onConnect, onDisconnect }: PlatformCardProps) {
  return (
    <div className={cn(
      'flex items-center gap-4 px-5 py-4 border rounded-xl bg-white transition-all',
      isConnected ? 'border-green-200 bg-green-50/30' : 'border-gray-100 hover:border-gray-200 hover:shadow-sm'
    )}>
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', platform.color)}>
        <span className="text-white font-bold text-sm">{platform.letter}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{platform.name}</p>
        {isConnected && connectedAccount ? (
          <p className="text-xs text-green-600 mt-0.5 font-medium">{connectedAccount}</p>
        ) : (
          <p className="text-xs text-gray-400 mt-0.5">{platform.description}</p>
        )}
      </div>
      {isConnected ? (
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
            <Check className="w-3 h-3" /> Connected
          </span>
          <button
            onClick={onDisconnect}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
          >
            Disconnect
          </button>
        </div>
      ) : platform.connectable ? (
        <button
          onClick={onConnect}
          className="text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-full transition-colors flex-shrink-0"
        >
          Connect
        </button>
      ) : (
        <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full flex-shrink-0">
          Coming soon
        </span>
      )}
    </div>
  )
}

// ─── Static platform card (for marketplaces) ──────────────────────────────────

function MarketplaceCard({ name, description, color, letter }: { name: string; description: string; color: string; letter: string }) {
  return (
    <div className="flex items-center gap-4 px-5 py-4 border border-gray-100 rounded-xl bg-white hover:border-gray-200 hover:shadow-sm transition-all">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', color)}>
        <span className="text-white font-bold text-sm">{letter}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{name}</p>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
      <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full flex-shrink-0">
        Coming soon
      </span>
    </div>
  )
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────

interface InviteModalProps {
  onClose: () => void
  onInvite: (email: string, role: Role) => void
}

function InviteModal({ onClose, onInvite }: InviteModalProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('agent')
  const [sent, setSent] = useState(false)

  const handleSubmit = () => {
    if (!email.includes('@')) return
    onInvite(email, role)
    setSent(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={sent ? onClose : undefined} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 flex flex-col gap-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-gray-900">Invite team member</p>
            <p className="text-xs text-gray-400 mt-0.5">They&apos;ll receive an email with a sign-in link.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!sent ? (
          <>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-300"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Role</label>
                <div className="space-y-2">
                  {(['admin', 'agent', 'viewer'] as Role[]).map(r => {
                    const cfg = roleConfig[r]
                    const Icon = cfg.icon
                    return (
                      <button
                        key={r}
                        onClick={() => setRole(r)}
                        className={cn(
                          'w-full flex items-start gap-3 px-3.5 py-3 rounded-xl border text-left transition-all',
                          role === r ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 hover:border-gray-200'
                        )}
                      >
                        <div className={cn('w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5', cfg.bg)}>
                          <Icon className={cn('w-3.5 h-3.5', cfg.color)} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{cfg.label}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{roleDescriptions[r]}</p>
                        </div>
                        {role === r && <Check className="w-4 h-4 text-indigo-600 ml-auto flex-shrink-0 mt-0.5" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={!email.includes('@')}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <Mail className="w-4 h-4" />
              Send invite
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center py-6 gap-3">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-900 text-sm">Invite sent!</p>
              <p className="text-xs text-gray-400 mt-1">{email} will receive their sign-in link shortly.</p>
            </div>
            <button onClick={onClose} className="mt-2 text-sm text-indigo-600 hover:underline">Done</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Role Dropdown ────────────────────────────────────────────────────────────

function RoleDropdown({ member, onChange }: { member: TeamMember; onChange: (role: Role) => void }) {
  const [open, setOpen] = useState(false)
  if (member.role === 'owner') return <RoleBadge role="owner" />

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 group"
      >
        <RoleBadge role={member.role} />
        <ChevronDown className="w-3 h-3 text-gray-400 group-hover:text-gray-600 transition-colors" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1.5 z-20 bg-white rounded-xl border border-gray-100 shadow-lg py-1 w-36">
            {(['admin', 'agent', 'viewer'] as Role[]).map(r => {
              const cfg = roleConfig[r]
              return (
                <button
                  key={r}
                  onClick={() => { onChange(r); setOpen(false) }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-gray-50 transition-colors',
                    member.role === r && 'font-semibold text-indigo-600'
                  )}
                >
                  {member.role === r && <Check className="w-3 h-3 text-indigo-500" />}
                  {member.role !== r && <span className="w-3" />}
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter()
  const [activeSection, setActiveSection] = useState('platforms')

  // Platform state
  const [connectingPlatform, setConnectingPlatform] = useState<PlatformId | null>(null)
  const [connectedPlatforms, setConnectedPlatforms] = useState<Record<PlatformId, string | null>>({
    telegram: 'Demo bot · @oakchat_demo',
    whatsapp: null,
    facebook_messenger: null,
    instagram: null,
    line: null,
    zalo: null,
  })

  const handleConnect = (platformId: PlatformId, account: string) => {
    setConnectedPlatforms(prev => ({ ...prev, [platformId]: account }))
  }
  const handleDisconnect = (platformId: PlatformId) => {
    setConnectedPlatforms(prev => ({ ...prev, [platformId]: null }))
  }

  // Team state
  const [team, setTeam] = useState<TeamMember[]>(initialTeam)
  const [showInvite, setShowInvite] = useState(false)
  const [showPermissions, setShowPermissions] = useState(false)

  const handleInvite = (email: string, role: Role) => {
    const name = email.split('@')[0]
    setTeam(prev => [...prev, {
      id: String(Date.now()),
      name: name.charAt(0).toUpperCase() + name.slice(1),
      email,
      role,
      status: 'invited',
      avatar: name.charAt(0).toUpperCase(),
    }])
  }

  const handleRoleChange = (memberId: string, role: Role) => {
    setTeam(prev => prev.map(m => m.id === memberId ? { ...m, role } : m))
  }

  const handleRemove = (memberId: string) => {
    setTeam(prev => prev.filter(m => m.id !== memberId))
  }

  return (
    <div className="flex bg-gray-50" style={{ height: '100dvh' }}>

      {/* Modals */}
      {connectingPlatform && (() => {
        const p = messagingPlatforms.find(m => m.id === connectingPlatform)!
        return (
          <ConnectModal
            platform={p}
            onClose={() => setConnectingPlatform(null)}
            onConnect={handleConnect}
          />
        )
      })()}
      {showInvite && (
        <InviteModal onClose={() => setShowInvite(false)} onInvite={handleInvite} />
      )}

      {/* Sidebar */}
      <div className="w-60 flex-shrink-0 flex flex-col bg-white border-r border-gray-100">
        <div className="px-5 py-5 border-b border-gray-100">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to inbox
          </button>
        </div>
        <div className="px-3 py-4 flex-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">Settings</p>
          <nav className="space-y-0.5">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left',
                  activeSection === id
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="px-4 py-3 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">OakChat · Early access</p>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-8 py-8">

          {/* ── Platforms ────────────────────────────────── */}
          {activeSection === 'platforms' && (
            <>
              <div className="mb-8">
                <h1 className="text-lg font-semibold text-gray-900">Connected platforms</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Connect your marketplaces and messaging channels. All conversations flow into one inbox.
                </p>
              </div>
              <div className="space-y-8">
                <div>
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Marketplaces</h2>
                  <div className="space-y-2">
                    {marketplaces.map(p => <MarketplaceCard key={p.id} {...p} />)}
                  </div>
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Messaging & Social</h2>
                  <div className="space-y-2">
                    {messagingPlatforms.map(p => (
                      <MessagingPlatformCard
                        key={p.id}
                        platform={p}
                        isConnected={!!connectedPlatforms[p.id]}
                        connectedAccount={connectedPlatforms[p.id] ?? undefined}
                        onConnect={() => p.connectable && setConnectingPlatform(p.id)}
                        onDisconnect={() => handleDisconnect(p.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Team & Agents ─────────────────────────────── */}
          {activeSection === 'team' && (
            <>
              <div className="flex items-start justify-between mb-8">
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">Team & agents</h1>
                  <p className="text-sm text-gray-500 mt-1">
                    Manage who has access to your OakChat workspace and what they can do.
                  </p>
                </div>
                <button
                  onClick={() => setShowInvite(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors flex-shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  Invite member
                </button>
              </div>

              {/* Members table */}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex-1">
                    Members · {team.length}
                  </p>
                  <p className="text-xs text-gray-400 w-28 text-left hidden sm:block">Role</p>
                  <p className="text-xs text-gray-400 w-20 text-right hidden sm:block">Status</p>
                  <span className="w-8" />
                </div>
                <div className="divide-y divide-gray-50">
                  {team.map(member => (
                    <div key={member.id} className="flex items-center gap-4 px-5 py-3.5">
                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center text-indigo-700 font-semibold text-sm flex-shrink-0">
                        {member.avatar}
                      </div>
                      {/* Name + email */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {member.name}
                          {member.email === 'melvinong1701@gmail.com' && (
                            <span className="ml-1.5 text-xs text-gray-400 font-normal">(you)</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{member.email}</p>
                      </div>
                      {/* Role */}
                      <div className="w-28 flex-shrink-0">
                        <RoleDropdown
                          member={member}
                          onChange={role => handleRoleChange(member.id, role)}
                        />
                      </div>
                      {/* Status */}
                      <div className="w-20 flex-shrink-0 text-right hidden sm:block">
                        {member.status === 'invited' ? (
                          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">Invited</span>
                        ) : (
                          <span className="text-xs text-gray-400">Active</span>
                        )}
                      </div>
                      {/* Actions */}
                      <div className="w-8 flex justify-end">
                        {member.role !== 'owner' && (
                          <button
                            onClick={() => handleRemove(member.id)}
                            className="text-gray-300 hover:text-red-400 transition-colors"
                            title="Remove member"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Role descriptions */}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Role definitions</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {(['owner', 'admin', 'agent', 'viewer'] as Role[]).map(r => {
                    const cfg = roleConfig[r]
                    const Icon = cfg.icon
                    return (
                      <div key={r} className="flex items-start gap-4 px-5 py-4">
                        <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0', cfg.bg)}>
                          <Icon className={cn('w-4 h-4', cfg.color)} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{cfg.label}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{roleDescriptions[r]}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Permissions matrix (collapsible) */}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <button
                  onClick={() => setShowPermissions(p => !p)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                >
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Permissions matrix</p>
                  <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', showPermissions && 'rotate-180')} />
                </button>
                {showPermissions && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-t border-gray-100">
                          <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider w-1/2">Permission</th>
                          {(['owner', 'admin', 'agent', 'viewer'] as Role[]).map(r => (
                            <th key={r} className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              {roleConfig[r].label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {permissions.map((perm, i) => (
                          <tr key={i} className="hover:bg-gray-50/50">
                            <td className="px-5 py-2.5 text-xs text-gray-600">{perm.label}</td>
                            {(['owner', 'admin', 'agent', 'viewer'] as Role[]).map(r => (
                              <td key={r} className="px-3 py-2.5 text-center">
                                {perm[r] ? (
                                  <Check className="w-3.5 h-3.5 text-green-500 mx-auto" />
                                ) : (
                                  <span className="block w-3.5 h-0.5 bg-gray-200 mx-auto rounded-full" />
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Other sections (placeholder) ──────────────── */}
          {activeSection !== 'platforms' && activeSection !== 'team' && (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                {(() => {
                  const item = navItems.find(n => n.id === activeSection)
                  if (!item) return null
                  const Icon = item.icon
                  return <Icon className="w-5 h-5 text-gray-400" />
                })()}
              </div>
              <p className="text-sm font-medium text-gray-700">
                {navItems.find(n => n.id === activeSection)?.label}
              </p>
              <p className="text-xs text-gray-400 mt-1">Coming soon</p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
