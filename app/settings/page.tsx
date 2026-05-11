'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Store, Bot, Bell, Users, CreditCard,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { id: 'platforms', label: 'Connected platforms', icon: Store },
  { id: 'ai', label: 'AI settings', icon: Bot },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'team', label: 'Team & agents', icon: Users },
  { id: 'billing', label: 'Plan & billing', icon: CreditCard },
]

const marketplaces = [
  {
    id: 'shopee',
    name: 'Shopee',
    description: 'SG · MY · TH · ID · PH · VN · TW',
    color: 'bg-orange-500',
    letter: 'S',
  },
  {
    id: 'lazada',
    name: 'Lazada',
    description: 'SG · MY · TH · ID · PH · VN',
    color: 'bg-blue-600',
    letter: 'L',
  },
  {
    id: 'tiktok_shop',
    name: 'TikTok Shop',
    description: 'SG · MY · TH · ID · PH · VN',
    color: 'bg-black',
    letter: 'T',
  },
  {
    id: 'tokopedia',
    name: 'Tokopedia',
    description: 'ID',
    color: 'bg-green-500',
    letter: 'T',
  },
]

const messagingPlatforms = [
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    description: 'All of SEA · Most widely used',
    color: 'bg-green-600',
    letter: 'W',
  },
  {
    id: 'fb_messenger',
    name: 'Facebook Messenger',
    description: 'All of SEA · Meta',
    color: 'bg-blue-500',
    letter: 'M',
  },
  {
    id: 'instagram',
    name: 'Instagram Direct',
    description: 'All of SEA · Meta',
    color: 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400',
    letter: 'I',
  },
  {
    id: 'line',
    name: 'LINE',
    description: 'TH · TW · JP',
    color: 'bg-green-400',
    letter: 'L',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'All regions · Popular with tech-savvy sellers',
    color: 'bg-sky-500',
    letter: 'T',
  },
  {
    id: 'zalo',
    name: 'Zalo',
    description: 'VN · Dominant messaging app',
    color: 'bg-blue-700',
    letter: 'Z',
  },
]

function PlatformCard({ name, description, color, letter }: {
  name: string; description: string; color: string; letter: string
}) {
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

export default function SettingsPage() {
  const router = useRouter()
  const [activeSection, setActiveSection] = useState('platforms')

  return (
    <div className="flex bg-gray-50" style={{ height: '100dvh' }}>

      {/* Settings sidebar */}
      <div className="w-60 flex-shrink-0 flex flex-col bg-white border-r border-gray-100">
        {/* Header */}
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
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
            Settings
          </p>
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
          <p className="text-xs text-gray-400 text-center">Project CAP · Early access</p>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-8 py-8">

          {activeSection === 'platforms' && (
            <>
              <div className="mb-8">
                <h1 className="text-lg font-semibold text-gray-900">Connected platforms</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Connect your marketplaces and messaging channels. All conversations flow into one inbox.
                </p>
              </div>

              <div className="space-y-8">
                {/* Marketplaces */}
                <div>
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Marketplaces
                  </h2>
                  <div className="space-y-2">
                    {marketplaces.map(p => (
                      <PlatformCard key={p.id} {...p} />
                    ))}
                  </div>
                </div>

                {/* Messaging & Social */}
                <div>
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Messaging & Social
                  </h2>
                  <div className="space-y-2">
                    {messagingPlatforms.map(p => (
                      <PlatformCard key={p.id} {...p} />
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeSection !== 'platforms' && (
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
