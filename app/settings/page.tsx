'use client'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ConnectedPlatformsTab from './stores/[storeId]/components/ConnectedPlatformsTab'
import KnowledgeBaseTab from './stores/[storeId]/components/KnowledgeBaseTab'
import {
  ArrowLeft, Store, Bell, Users, CreditCard,
  Check, X, Plus, Mail, Eye, ChevronDown, ChevronRight,
  Crown, UserCog, MessageSquare, Trash2,
  AlertCircle, Loader2, Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Nav ────────────────────────────────────────────────────────────────────

const navItems = [
  { id: 'stores', label: 'Stores', icon: Store },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'team', label: 'Team & agents', icon: Users },
  { id: 'billing', label: 'Plan & billing', icon: CreditCard },
]

// ─── Store AI config data ────────────────────────────────────────────────────

type ReplyTone = 'professional' | 'friendly' | 'casual'

interface StoreAiConfigFields {
  replyTone: ReplyTone
  autoSendEnabled: boolean
  brandVoice: string
  whatWeSell: string
  returnPolicy: string
  shippingPolicy: string
  commonFaqs: string
  customGuardrails: string[]
}

// ─── Guardrails ──────────────────────────────────────────────────────────────

interface PlatformGuardrail {
  id: string
  label: string
  description: string
}

const PLATFORM_GUARDRAILS_DISPLAY: PlatformGuardrail[] = [
  {
    id: 'ai_disclosure',
    label: 'AI disclosure',
    description: 'If a customer directly asks whether they\'re speaking to a bot or AI, the assistant will answer honestly and never claim to be human.',
  },
  {
    id: 'no_fabricated_orders',
    label: 'No fabricated order data',
    description: 'The AI will never state order statuses, tracking numbers, or delivery dates unless they appear verbatim in the conversation.',
  },
  {
    id: 'no_payment_data',
    label: 'No payment data',
    description: 'The AI will never ask for or repeat payment details, card numbers, bank account information, or passwords.',
  },
  {
    id: 'no_refunds',
    label: 'No refund or compensation promises',
    description: 'The AI will never offer, promise, or approve refunds, replacements, discounts, or compensation. These are always escalated to a human.',
  },
  {
    id: 'no_pricing_commits',
    label: 'No pricing commitments',
    description: 'The AI will never commit to a price not already confirmed in the conversation.',
  },
  {
    id: 'no_competitors',
    label: 'No competitor mentions',
    description: 'The AI will not discuss competitors by name or make comparative claims about other brands or platforms.',
  },
  {
    id: 'language_match',
    label: 'Language matching',
    description: 'The AI always replies in the language the customer used. This cannot be changed.',
  },
  {
    id: 'escalation_triggers',
    label: 'Mandatory escalation triggers',
    description: 'The AI flags for human review when: a customer asks to speak to a human or manager, mentions legal action or regulators, is abusive or threatening, shows signs of fraud, or the same issue appears 3+ times without resolution.',
  },
  {
    id: 'prompt_protection',
    label: 'Prompt injection protection',
    description: 'If a customer attempts to override or rewrite the AI\'s instructions (e.g. "ignore previous instructions"), the message is treated as a normal support query and flagged for human review.',
  },
]

const replyToneOptions: { value: ReplyTone; label: string }[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'casual', label: 'Casual' },
]

const defaultStoreAiConfigFields: StoreAiConfigFields = {
  replyTone: 'friendly',
  autoSendEnabled: false,
  brandVoice: '',
  whatWeSell: '',
  returnPolicy: '',
  shippingPolicy: '',
  commonFaqs: '',
  customGuardrails: [],
}

const customInstructionSections = [
  { label: 'Brand voice', field: 'brandVoice' },
  { label: 'What we sell', field: 'whatWeSell' },
  { label: 'Common FAQs', field: 'commonFaqs' },
] as const

interface ApiStoreAiConfigRow {
  tone: string | null
  return_policy: string | null
  shipping_policy: string | null
  custom_instructions: string | null
  custom_guardrails: string[] | null
  auto_send_enabled: boolean | null
}

function parseCustomInstructions(customInstructions: string | null | undefined): Pick<
  StoreAiConfigFields,
  'brandVoice' | 'whatWeSell' | 'commonFaqs'
> {
  const text = (customInstructions ?? '').replace(/\r\n/g, '\n')
  const fields = {
    brandVoice: '',
    whatWeSell: '',
    commonFaqs: '',
  }

  customInstructionSections.forEach(({ label, field }) => {
    const header = `${label}:\n`
    const startIndex = text.indexOf(header)
    if (startIndex === -1) return

    const contentStart = startIndex + header.length
    const nextHeaderIndex = customInstructionSections.reduce<number | null>((nearest, section) => {
      const candidate = text.indexOf(`${section.label}:\n`, contentStart)
      if (candidate === -1) return nearest
      return nearest === null || candidate < nearest ? candidate : nearest
    }, null)

    fields[field] = text.slice(contentStart, nextHeaderIndex ?? undefined).trim()
  })

  return fields
}

function deserializeAiConfig(row: ApiStoreAiConfigRow | null): StoreAiConfigFields {
  if (!row) return defaultStoreAiConfigFields

  const replyTone = ['professional', 'friendly', 'casual'].includes(String(row.tone))
    ? row.tone as ReplyTone
    : defaultStoreAiConfigFields.replyTone

  return {
    ...defaultStoreAiConfigFields,
    ...parseCustomInstructions(row.custom_instructions),
    replyTone,
    autoSendEnabled: typeof row.auto_send_enabled === 'boolean' ? row.auto_send_enabled : false,
    returnPolicy: row.return_policy ?? '',
    shippingPolicy: row.shipping_policy ?? '',
    customGuardrails: Array.isArray(row.custom_guardrails) ? row.custom_guardrails : [],
  }
}

function serializeAiConfig(fields: StoreAiConfigFields, store: StoreRecord) {
  const parts: string[] = []

  if (fields.brandVoice.trim()) parts.push(`Brand voice:\n${fields.brandVoice.trim()}`)
  if (fields.whatWeSell.trim()) parts.push(`What we sell:\n${fields.whatWeSell.trim()}`)
  if (fields.commonFaqs.trim()) parts.push(`Common FAQs:\n${fields.commonFaqs.trim()}`)

  return {
    storeId: store.id,
    storeName: store.name,
    tone: fields.replyTone,
    primaryLanguage: store.language,
    returnPolicy: fields.returnPolicy,
    shippingPolicy: fields.shippingPolicy,
    customInstructions: parts.join('\n\n'),
    customGuardrails: fields.customGuardrails,
    autoSendEnabled: fields.autoSendEnabled,
  }
}

// ─── Platform data ───────────────────────────────────────────────────────────

type PlatformId = 'whatsapp' | 'facebook_messenger' | 'instagram' | 'line' | 'telegram' | 'zalo'

// ─── Store / country data ────────────────────────────────────────────────────

type Country = 'SG' | 'MY' | 'ID' | 'TH' | 'PH' | 'VN'
type Language = 'en' | 'ms' | 'id' | 'th' | 'tl' | 'vi'
type Currency = 'SGD' | 'MYR' | 'IDR' | 'THB' | 'PHP' | 'VND'

const countries: { value: Country; label: string; flag: string }[] = [
  { value: 'SG', label: 'Singapore', flag: '🇸🇬' },
  { value: 'MY', label: 'Malaysia', flag: '🇲🇾' },
  { value: 'ID', label: 'Indonesia', flag: '🇮🇩' },
  { value: 'TH', label: 'Thailand', flag: '🇹🇭' },
  { value: 'PH', label: 'Philippines', flag: '🇵🇭' },
  { value: 'VN', label: 'Vietnam', flag: '🇻🇳' },
]

const languages: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ms', label: 'Bahasa Malaysia' },
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'th', label: 'Thai' },
  { value: 'tl', label: 'Filipino (Tagalog)' },
  { value: 'vi', label: 'Vietnamese' },
]

const currencies: { value: Currency; label: string }[] = [
  { value: 'SGD', label: 'SGD – Singapore Dollar' },
  { value: 'MYR', label: 'MYR – Malaysian Ringgit' },
  { value: 'IDR', label: 'IDR – Indonesian Rupiah' },
  { value: 'THB', label: 'THB – Thai Baht' },
  { value: 'PHP', label: 'PHP – Philippine Peso' },
  { value: 'VND', label: 'VND – Vietnamese Dong' },
]

const countryDefaults: Record<Country, { language: Language; currency: Currency }> = {
  SG: { language: 'en', currency: 'SGD' },
  MY: { language: 'ms', currency: 'MYR' },
  ID: { language: 'id', currency: 'IDR' },
  TH: { language: 'th', currency: 'THB' },
  PH: { language: 'tl', currency: 'PHP' },
  VN: { language: 'vi', currency: 'VND' },
}

interface StoreRecord {
  id: string
  name: string
  country: Country
  language: Language
  currency: Currency
  connectedPlatforms: Record<PlatformId, string | null>
}

interface ApiStoreRow {
  id: string
  name: string
  country: string
  language: string
  currency: string
}

interface ApiStorePlatformRow {
  store_id: string
  platform_id: string
  account_label: string | null
}

const emptyPlatforms = (): Record<PlatformId, string | null> => ({
  telegram: null,
  whatsapp: null,
  facebook_messenger: null,
  instagram: null,
  line: null,
  zalo: null,
})


// ─── Team data ───────────────────────────────────────────────────────────────

type Role = 'owner' | 'admin' | 'agent' | 'viewer'

interface AccountRoleResponse {
  data?: {
    role?: unknown
    storedRole?: unknown
    account?: {
      role?: unknown
      storedRole?: unknown
    }
  } | null
}

interface TeamMember {
  id: string
  name: string
  email: string
  role: Role
  status: 'active' | 'invited'
  avatar: string
  isCurrentUser?: boolean
}

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

function isUserRole(value: unknown): value is Role {
  return value === 'owner' || value === 'admin' || value === 'agent' || value === 'viewer'
}

interface ApiTeamMember {
  id: string
  email: string
  role: string
  status?: string
  displayName: string
  avatarUrl: string | null
  isCurrentUser: boolean
}

type InviteResult = { ok: boolean; error?: string }

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

function ToggleSwitch({
  enabled,
  onChange,
  label,
  disabled = false,
}: {
  enabled: boolean
  onChange: (enabled: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      disabled={disabled}
      aria-pressed={enabled}
      aria-label={label}
      className={cn(
        'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
        enabled ? 'bg-indigo-600' : 'bg-gray-200',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
          enabled ? 'translate-x-5' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}

function AiTextArea({
  id,
  label,
  hint,
  value,
  rows,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: string
  rows: number
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-gray-900 mb-1 block">{label}</label>
      <p className="text-xs text-gray-400 mb-2">{hint}</p>
      <textarea
        id={id}
        value={value}
        rows={rows}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none placeholder:text-gray-300"
      />
    </div>
  )
}

// ─── Store Card ───────────────────────────────────────────────────────────────

function StoreCard({ store, onClick, onDelete }: { store: StoreRecord; onClick: () => void; onDelete: () => void }) {
  const connectedCount = Object.values(store.connectedPlatforms).filter(Boolean).length
  const country = countries.find(c => c.value === store.country)
  const language = languages.find(l => l.value === store.language)

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 px-5 py-4 border border-gray-100 rounded-xl bg-white hover:border-indigo-200 hover:shadow-sm transition-all cursor-pointer group"
    >
      <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
        <Store className="w-5 h-5 text-indigo-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{store.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-400">{country?.flag} {country?.label}</span>
          <span className="text-gray-200">·</span>
          <span className="text-xs text-gray-400">{language?.label}</span>
          <span className="text-gray-200">·</span>
          <span className="text-xs text-gray-400">{store.currency}</span>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {connectedCount > 0 ? (
          <span className="text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
            {connectedCount} connected
          </span>
        ) : (
          <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
            No channels yet
          </span>
        )}
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="text-gray-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
          title="Delete store"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 transition-colors" />
      </div>
    </div>
  )
}

// ─── Add Store Form ───────────────────────────────────────────────────────────

interface AddStoreFormProps {
  onBack: () => void
  onSave: (store: StoreRecord) => Promise<boolean>
}

function AddStoreForm({ onBack, onSave }: AddStoreFormProps) {
  const [name, setName] = useState('')
  const [country, setCountry] = useState<Country>('SG')
  const [language, setLanguage] = useState<Language>('en')
  const [currency, setCurrency] = useState<Currency>('SGD')
  const [isSaving, setIsSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleCountryChange = (c: Country) => {
    setCountry(c)
    setLanguage(countryDefaults[c].language)
    setCurrency(countryDefaults[c].currency)
  }

  const handleSave = async () => {
    if (!name.trim() || isSaving) return
    setIsSaving(true)
    setErrorMsg('')
    const saved = await onSave({
      id: `store-${Date.now()}`,
      name: name.trim(),
      country,
      language,
      currency,
      connectedPlatforms: emptyPlatforms(),
    })
    if (!saved) {
      setErrorMsg('Failed to save store. Please try again.')
      setIsSaving(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Stores
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-900">Add store</span>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5 max-w-lg">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1.5 block">Store name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. My Shopee SG Store"
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-300"
            autoFocus
          />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 mb-1.5 block">Country / Market</label>
          <select
            value={country}
            onChange={e => handleCountryChange(e.target.value as Country)}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
          >
            {countries.map(c => (
              <option key={c.value} value={c.value}>{c.flag} {c.label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Primary language</label>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value as Language)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
            >
              {languages.map(l => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Currency</label>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value as Currency)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
            >
              {currencies.map(c => (
                <option key={c.value} value={c.value}>{c.value}</option>
              ))}
            </select>
          </div>
        </div>

        {errorMsg && (
          <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p>{errorMsg}</p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={onBack}
            disabled={isSaving}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || isSaving}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSaving ? 'Saving...' : 'Add store'}
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────

interface InviteModalProps {
  onClose: () => void
  onInvite: (email: string, role: Role) => Promise<InviteResult>
}

function InviteModal({ onClose, onInvite }: InviteModalProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('agent')
  const [sent, setSent] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!email.includes('@') || inviting) return
    setInviting(true)
    setInviteError(null)
    const result = await onInvite(email, role)
    setInviting(false)

    if (result.ok) {
      setSent(true)
    } else {
      setInviteError(result.error ?? 'Something went wrong.')
    }
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
            {inviteError && (
              <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p>{inviteError}</p>
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={!email.includes('@') || inviting}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              {inviting ? 'Sending...' : 'Send invite'}
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
  const [activeSection, setActiveSection] = useState('stores')
  const [currentUserRole, setCurrentUserRole] = useState<Role | null>(null)
  const isOwner = currentUserRole === 'owner'

  useEffect(() => {
    let cancelled = false

    async function fetchCurrentUserRole() {
      try {
        const res = await fetch('/api/account')
        if (!res.ok) return

        const { data } = await res.json() as AccountRoleResponse
        const role = data?.account?.storedRole ?? data?.account?.role ?? data?.storedRole ?? data?.role
        if (!cancelled && isUserRole(role)) {
          setCurrentUserRole(role)
        }
      } catch {
      }
    }

    fetchCurrentUserRole()

    return () => {
      cancelled = true
    }
  }, [])

  // Stores state — fetched from Supabase
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [storesLoading, setStoresLoading] = useState(true)
  const [team, setTeam] = useState<TeamMember[]>([])
  const [teamLoading, setTeamLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [showPermissions, setShowPermissions] = useState(false)

  useEffect(() => {
    async function fetchStores() {
      setStoresLoading(true)
      const res = await fetch('/api/stores')
      if (!res.ok) {
        setStoresLoading(false)
        return
      }

      const { stores: storesData, platforms: platformsData } = await res.json() as {
        stores: ApiStoreRow[]
        platforms: ApiStorePlatformRow[]
      }
      const records: StoreRecord[] = storesData.map(s => ({
        id: s.id,
        name: s.name,
        country: s.country as Country,
        language: s.language as Language,
        currency: s.currency as Currency,
        connectedPlatforms: emptyPlatforms(),
      }))

      platformsData.forEach(p => {
        const store = records.find(s => s.id === p.store_id)
        if (store) store.connectedPlatforms[p.platform_id as PlatformId] = p.account_label
      })

      setStores(records)
      setStoresLoading(false)
    }
    fetchStores()
  }, [])

  useEffect(() => {
    let cancelled = false

    async function fetchMembers() {
      setTeamLoading(true)
      try {
        const res = await fetch('/api/org/members')
        if (!res.ok) return

        const { data } = await res.json() as { data: { members: ApiTeamMember[] } | null }
        if (cancelled || !data) return

        setTeam(data.members.map(member => {
          const name = member.displayName || member.email.split('@')[0] || 'User'
          const status: TeamMember['status'] = member.status === 'invited' ? 'invited' : 'active'
          return {
            id: member.id,
            name,
            email: member.email,
            role: isUserRole(member.role) ? member.role : 'agent',
            status,
            avatar: name.charAt(0).toUpperCase(),
            isCurrentUser: member.isCurrentUser,
          }
        }))
      } catch {
      } finally {
        if (!cancelled) setTeamLoading(false)
      }
    }

    fetchMembers()
    return () => {
      cancelled = true
    }
  }, [])

  const [storesView, setStoresView] = useState<'list' | 'add' | 'platforms'>('list')
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null)
  const [storeTab, setStoreTab] = useState<'platforms' | 'ai' | 'knowledge'>('platforms')
  const [storeAiConfig, setStoreAiConfig] = useState<StoreAiConfigFields>(defaultStoreAiConfigFields)
  const [storeAiConfigLoading, setStoreAiConfigLoading] = useState(false)
  const [storeAiConfigSaving, setStoreAiConfigSaving] = useState(false)
  const [storeAiSaved, setStoreAiSaved] = useState(false)
  const [storeAiConfigError, setStoreAiConfigError] = useState<string | null>(null)
  const [guardrailDraft, setGuardrailDraft] = useState('')
  const [guardrailChecking, setGuardrailChecking] = useState(false)
  const [guardrailError, setGuardrailError] = useState<string | null>(null)

  const selectedStore = stores.find(s => s.id === selectedStoreId) ?? null

  useEffect(() => {
    if (storesView !== 'platforms' || storeTab !== 'ai' || !selectedStore) return undefined

    let cancelled = false
    const storeId = selectedStore.id

    async function fetchStoreAiConfig() {
      setStoreAiConfigLoading(true)
      setStoreAiConfigError(null)

      try {
        const res = await fetch(`/api/ai/config?storeId=${encodeURIComponent(storeId)}`)
        if (!res.ok) {
          throw new Error('Failed to load AI context')
        }

        const { data } = await res.json() as { data: ApiStoreAiConfigRow | null }
        if (!cancelled) {
          setStoreAiConfig(deserializeAiConfig(data))
        }
      } catch {
        if (!cancelled) {
          setStoreAiConfig(defaultStoreAiConfigFields)
          setStoreAiConfigError('Could not load AI context for this store.')
        }
      } finally {
        if (!cancelled) {
          setStoreAiConfigLoading(false)
        }
      }
    }

    fetchStoreAiConfig()

    return () => {
      cancelled = true
    }
  }, [storesView, storeTab, selectedStore])

  const handleAddStore = async (store: StoreRecord) => {
    try {
      const res = await fetch('/api/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: store.name,
          country: store.country,
          language: store.language,
          currency: store.currency,
        }),
      })

      if (!res.ok) return false

      const { store: savedStore } = await res.json() as { store: ApiStoreRow }
      setStores(prev => [...prev, {
        id: savedStore.id,
        name: savedStore.name,
        country: savedStore.country as Country,
        language: savedStore.language as Language,
        currency: savedStore.currency as Currency,
        connectedPlatforms: emptyPlatforms(),
      }])
      setStoresView('list')
      return true
    } catch {
      return false
    }
  }

  const handleDeleteStore = async (storeId: string) => {
    await fetch(`/api/stores?storeId=${encodeURIComponent(storeId)}`, { method: 'DELETE' })
    setStores(prev => prev.filter(s => s.id !== storeId))
  }

  const handleSelectStore = (storeId: string) => {
    setSelectedStoreId(storeId)
    setStoreTab('platforms')
    setStoreAiConfig(defaultStoreAiConfigFields)
    setStoreAiSaved(false)
    setStoresView('platforms')
  }

  useEffect(() => {
    if (!storeAiSaved) return undefined

    const timeoutId = window.setTimeout(() => setStoreAiSaved(false), 2000)
    return () => window.clearTimeout(timeoutId)
  }, [storeAiSaved])

  const handleInvite = async (email: string, role: Role): Promise<InviteResult> => {
    const normalizedEmail = email.trim().toLowerCase()

    try {
      const res = await fetch('/api/org/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, role }),
      })
      const json = await res.json() as { data: { ok: boolean } | null; error: string | null }

      if (!res.ok || json.error) {
        return { ok: false, error: json.error ?? 'Failed to send invite' }
      }

      const name = normalizedEmail.split('@')[0] || 'User'
      const displayName = name.charAt(0).toUpperCase() + name.slice(1)
      setTeam(prev => [...prev, {
        id: `pending-${Date.now()}`,
        name: displayName,
        email: normalizedEmail,
        role,
        status: 'invited',
        avatar: displayName.charAt(0).toUpperCase(),
        isCurrentUser: false,
      }])
      return { ok: true }
    } catch {
      return { ok: false, error: 'Network error. Please try again.' }
    }
  }

  const handleRoleChange = (memberId: string, role: Role) => {
    setTeam(prev => prev.map(m => m.id === memberId ? { ...m, role } : m))
  }

  const handleRemove = (memberId: string) => {
    setTeam(prev => prev.filter(m => m.id !== memberId))
  }

  const updateStoreAiConfig = <Key extends keyof StoreAiConfigFields>(key: Key, value: StoreAiConfigFields[Key]) => {
    setStoreAiConfig(prev => ({ ...prev, [key]: value }))
  }

  const handleSaveStoreAiConfig = async () => {
    if (!selectedStore) return

    setStoreAiConfigSaving(true)
    setStoreAiConfigError(null)

    try {
      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serializeAiConfig(storeAiConfig, selectedStore)),
      })

      if (!res.ok) {
        throw new Error('Failed to save AI context')
      }

      setStoreAiSaved(true)
    } catch {
      setStoreAiConfigError('Could not save AI context. Please try again.')
    } finally {
      setStoreAiConfigSaving(false)
    }
  }

  const handleAddGuardrail = async () => {
    const text = guardrailDraft.trim()
    if (!text) return

    setGuardrailChecking(true)
    setGuardrailError(null)

    try {
      const res = await fetch('/api/ai/guardrail-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposed: text }),
      })
      const data = await res.json() as { ok?: boolean; reason?: string | null; error?: string }

      if (!res.ok || data.error) {
        setGuardrailError('Could not verify this guardrail. Please try again.')
        return
      }

      if (!data.ok) {
        setGuardrailError(data.reason ?? 'This guardrail conflicts with platform rules and cannot be added.')
        return
      }

      setStoreAiConfig(prev => ({
        ...prev,
        customGuardrails: [...prev.customGuardrails, text],
      }))
      setGuardrailDraft('')
      setGuardrailError(null)
    } catch {
      setGuardrailError('Network error. Please try again.')
    } finally {
      setGuardrailChecking(false)
    }
  }

  const handleRemoveGuardrail = (index: number) => {
    setStoreAiConfig(prev => ({
      ...prev,
      customGuardrails: prev.customGuardrails.filter((_, i) => i !== index),
    }))
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* Modals */}
      {showInvite && (
        <InviteModal onClose={() => setShowInvite(false)} onInvite={handleInvite} />
      )}

      {/* Sidebar */}
      <div className="w-60 h-screen overflow-y-auto flex-shrink-0 flex flex-col bg-white border-r border-gray-100">
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
                onClick={() => {
                  setActiveSection(id)
                  if (id === 'stores') setStoresView('list')
                }}
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
          <p className="text-xs text-gray-400 text-center">Project CAP · Early access</p>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-8 py-8">

          {/* ── Stores list ───────────────────────────────────── */}
          {activeSection === 'stores' && storesView === 'list' && (
            <>
              <div className="flex items-start justify-between mb-8">
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">Stores</h1>
                  <p className="text-sm text-gray-500 mt-1">
                    Each store has its own connected channels. Select a store to manage its platforms.
                  </p>
                </div>
                <button
                  onClick={() => setStoresView('add')}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors flex-shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  Add store
                </button>
              </div>

              {storesLoading ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                </div>
              ) : stores.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center border-2 border-dashed border-gray-200 rounded-2xl">
                  <Store className="w-8 h-8 text-gray-300 mb-3" />
                  <p className="text-sm font-medium text-gray-500">No stores yet</p>
                  <p className="text-xs text-gray-400 mt-1">Add your first store to connect channels</p>
                  <button
                    onClick={() => setStoresView('add')}
                    className="mt-4 text-sm text-indigo-600 font-medium hover:underline"
                  >
                    Add store
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {stores.map(store => (
                    <StoreCard
                      key={store.id}
                      store={store}
                      onClick={() => handleSelectStore(store.id)}
                      onDelete={() => handleDeleteStore(store.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Add store ─────────────────────────────────────── */}
          {activeSection === 'stores' && storesView === 'add' && (
            <AddStoreForm
              onBack={() => setStoresView('list')}
              onSave={handleAddStore}
            />
          )}

          {/* ── Store → Connected platforms ───────────────────── */}
          {activeSection === 'stores' && storesView === 'platforms' && selectedStore && (
            <>
              {/* Breadcrumb */}
              <div className="flex items-center gap-3 mb-8">
                <button
                  onClick={() => {
                    setStoreTab('platforms')
                    setStoresView('list')
                  }}
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Stores
                </button>
                <span className="text-gray-300">/</span>
                <span className="text-sm font-medium text-gray-900">{selectedStore.name}</span>
              </div>

              {/* Store meta bar */}
              <div className="flex items-center gap-3 mb-6 bg-white border border-gray-100 rounded-xl px-5 py-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                  <Store className="w-4 h-4 text-indigo-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{selectedStore.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">
                      {countries.find(c => c.value === selectedStore.country)?.flag}{' '}
                      {countries.find(c => c.value === selectedStore.country)?.label}
                    </span>
                    <span className="text-gray-200">·</span>
                    <span className="text-xs text-gray-400">
                      {languages.find(l => l.value === selectedStore.language)?.label}
                    </span>
                    <span className="text-gray-200">·</span>
                    <span className="text-xs text-gray-400">{selectedStore.currency}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6 mb-6 border-b border-gray-100">
                {[
                  { id: 'platforms', label: 'Connected Platforms' },
                  { id: 'ai', label: 'AI context' },
                  { id: 'knowledge', label: 'Knowledge' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStoreTab(tab.id as 'platforms' | 'ai' | 'knowledge')}
                    className={cn(
                      'pb-3 text-sm font-semibold border-b-2 transition-colors',
                      storeTab === tab.id
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-gray-400 hover:text-gray-700'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {storeTab === 'platforms' && (
                <ConnectedPlatformsTab storeId={selectedStore.id} />
              )}

              {storeTab === 'knowledge' && (
                <KnowledgeBaseTab storeId={selectedStore.id} />
              )}

              {storeTab === 'ai' && (
                storeAiConfigLoading ? (
                  <div className="flex items-center justify-center h-48">
                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-6">
                    {storeAiConfigError && (
                      <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {storeAiConfigError}
                      </div>
                    )}

                    <div className="bg-white rounded-2xl border border-gray-100 p-6">
                      <div className="flex items-start justify-between gap-6">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Auto-send high confidence replies</p>
                          <p className="text-xs text-gray-400 mt-1">
                            When enabled, Project CAP sends high-confidence AI replies for this store without agent review.
                          </p>
                          {currentUserRole && !isOwner && (
                            <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                              <Lock className="w-3.5 h-3.5" />
                              Owner permission required
                            </p>
                          )}
                        </div>
                        <ToggleSwitch
                          enabled={storeAiConfig.autoSendEnabled}
                          label="Toggle auto-send high confidence replies"
                          disabled={!isOwner}
                          onChange={enabled => updateStoreAiConfig('autoSendEnabled', enabled)}
                        />
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 p-6">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">
                        Reply tone
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {replyToneOptions.map(option => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => updateStoreAiConfig('replyTone', option.value)}
                            className={cn(
                              'rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors',
                              storeAiConfig.replyTone === option.value
                                ? 'bg-indigo-600 text-white'
                                : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 p-6">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">
                        Business context
                      </p>
                      <div className="space-y-5">
                        <AiTextArea
                          id="store-ai-brand-voice"
                          label="Brand voice"
                          hint={'How do you want to sound? E.g. "Warm but professional. Never use slang. Always end with a call to action."'}
                          value={storeAiConfig.brandVoice}
                          rows={3}
                          onChange={value => updateStoreAiConfig('brandVoice', value)}
                        />
                        <AiTextArea
                          id="store-ai-what-we-sell"
                          label="What we sell"
                          hint="Describe your product range so the AI knows what you carry."
                          value={storeAiConfig.whatWeSell}
                          rows={3}
                          onChange={value => updateStoreAiConfig('whatWeSell', value)}
                        />
                        <AiTextArea
                          id="store-ai-return-policy"
                          label="Return & refund policy"
                          hint="Paste your standard policy. Per-store overrides coming later."
                          value={storeAiConfig.returnPolicy}
                          rows={3}
                          onChange={value => updateStoreAiConfig('returnPolicy', value)}
                        />
                        <AiTextArea
                          id="store-ai-shipping-policy"
                          label="Shipping policy"
                          hint="Your standard shipping terms."
                          value={storeAiConfig.shippingPolicy}
                          rows={3}
                          onChange={value => updateStoreAiConfig('shippingPolicy', value)}
                        />
                        <AiTextArea
                          id="store-ai-common-faqs"
                          label="Common FAQs"
                          hint="Questions and answers you get most often. The AI will use these to respond."
                          value={storeAiConfig.commonFaqs}
                          rows={5}
                          onChange={value => updateStoreAiConfig('commonFaqs', value)}
                        />
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 p-6">
                      {/* Section A — Platform guardrails */}
                      <div className="flex items-center gap-2 mb-1">
                        <Lock className="w-3.5 h-3.5 text-indigo-500" />
                        <p className="text-xs font-semibold text-gray-900">Platform guardrails</p>
                      </div>
                      <p className="text-xs text-gray-400 mb-4">Set by Project CAP · Cannot be changed</p>
                      <div className="rounded-xl bg-indigo-50/40 border border-indigo-100 divide-y divide-indigo-100">
                        {PLATFORM_GUARDRAILS_DISPLAY.map(guardrail => (
                          <div key={guardrail.id} className="flex items-start justify-between gap-4 px-4 py-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">{guardrail.label}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{guardrail.description}</p>
                            </div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 flex-shrink-0 mt-0.5">
                              <Lock className="w-2.5 h-2.5" />
                              Protected
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Section B — Custom guardrails */}
                      <div className="border-t border-gray-100 mt-6 pt-6">
                        <p className="text-xs font-semibold text-gray-900 mb-1">Your guardrails</p>
                        <p className="text-xs text-gray-400 mb-4">Additive rules screened against platform guardrails before saving</p>

                        {storeAiConfig.customGuardrails.length === 0 ? (
                          <p className="text-xs text-gray-400 italic mb-4">No custom guardrails added yet.</p>
                        ) : (
                          <div className="space-y-2 mb-4">
                            {storeAiConfig.customGuardrails.map((g, i) => (
                              <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-xl border border-gray-100 bg-gray-50">
                                <p className="text-sm text-gray-700 flex-1">{g}</p>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveGuardrail(i)}
                                  className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
                                  title="Remove guardrail"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {storeAiConfig.customGuardrails.length < 20 && (
                          <div className="space-y-2">
                            <textarea
                              value={guardrailDraft}
                              rows={2}
                              onChange={e => setGuardrailDraft(e.target.value)}
                              placeholder='E.g. "Always escalate if the customer mentions they are a business buyer."'
                              maxLength={500}
                              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none placeholder:text-gray-300"
                            />
                            {guardrailError && (
                              <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 rounded-lg p-3">
                                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                                <p>{guardrailError}</p>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={handleAddGuardrail}
                              disabled={guardrailChecking || !guardrailDraft.trim()}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold transition-colors"
                            >
                              {guardrailChecking && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                              {guardrailChecking ? 'Checking…' : 'Add guardrail'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveStoreAiConfig}
                        disabled={storeAiConfigSaving}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-semibold rounded-xl py-2.5 px-5 transition-colors inline-flex items-center gap-2"
                      >
                        {storeAiConfigSaving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          storeAiSaved && <Check className="w-4 h-4" />
                        )}
                        {storeAiSaved ? 'Saved' : 'Save'}
                      </button>
                    </div>
                  </div>
                )
              )}
            </>
          )}

          {/* ── Team & Agents ─────────────────────────────── */}
          {activeSection === 'team' && (
            <>
              <div className="flex items-start justify-between mb-8">
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">Team & agents</h1>
                  <p className="text-sm text-gray-500 mt-1">
                    Manage who has access to your workspace and what they can do.
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
              <div className="bg-white rounded-2xl border border-gray-100 mb-6">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center rounded-t-2xl overflow-hidden">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex-1">
                    Members · {team.length}
                  </p>
                  <p className="text-xs text-gray-400 w-28 text-left hidden sm:block">Role</p>
                  <p className="text-xs text-gray-400 w-20 text-right hidden sm:block">Status</p>
                  <span className="w-8" />
                </div>
                {teamLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {team.map(member => (
                      <div key={member.id} className="flex items-center gap-4 px-5 py-3.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center text-indigo-700 font-semibold text-sm flex-shrink-0">
                          {member.avatar}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {member.name}
                            {member.isCurrentUser && (
                              <span className="ml-1.5 text-xs text-gray-400 font-normal">(you)</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400 truncate">{member.email}</p>
                        </div>
                        <div className="w-28 flex-shrink-0">
                          <RoleDropdown
                            member={member}
                            onChange={role => handleRoleChange(member.id, role)}
                          />
                        </div>
                        <div className="w-20 flex-shrink-0 text-right hidden sm:block">
                          {member.status === 'invited' ? (
                            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">Invited</span>
                          ) : (
                            <span className="text-xs text-gray-400">Active</span>
                          )}
                        </div>
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
                )}
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
          {activeSection !== 'stores' && activeSection !== 'team' && (
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
