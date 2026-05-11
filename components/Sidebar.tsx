'use client'
import { useState } from 'react'
import { Store } from '@/lib/types'
import { ChannelBadge } from './ChannelBadge'
import { Inbox, BookMarked, UserCheck, Clock, Settings, X, Store as StoreIcon, Bot, Bell, Users, CreditCard } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  stores: Store[]
  activeFilter: string
  onFilterChange: (filter: string) => void
}

const navItems = [
  { id: 'all', label: 'All conversations', icon: Inbox },
  { id: 'unread', label: 'Unread', icon: BookMarked },
  { id: 'assigned', label: 'Assigned to me', icon: UserCheck },
  { id: 'snoozed', label: 'Snoozed', icon: Clock },
]

const settingsSections = [
  {
    icon: StoreIcon,
    label: 'Connected stores',
    description: 'Manage your Shopee, Lazada and TikTok Shop connections',
    badge: 'Coming soon',
  },
  {
    icon: Bot,
    label: 'AI settings',
    description: 'Confidence thresholds, auto-send rules, tone preferences',
    badge: 'Coming soon',
  },
  {
    icon: Bell,
    label: 'Notifications',
    description: 'Alert preferences for new messages and escalations',
    badge: 'Coming soon',
  },
  {
    icon: Users,
    label: 'Team & agents',
    description: 'Invite agents, set roles and assignment rules',
    badge: 'Coming soon',
  },
  {
    icon: CreditCard,
    label: 'Plan & billing',
    description: 'Usage, subscription and overage settings',
    badge: 'Coming soon',
  },
]

export function Sidebar({ stores, activeFilter, onFilterChange }: SidebarProps) {
  const totalUnread = stores.reduce((sum, s) => sum + s.unreadCount, 0)
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="w-60 flex-shrink-0 flex flex-col border-r border-gray-100 bg-white min-h-0 relative">

      {/* Settings panel overlay */}
      {showSettings && (
        <div className="absolute inset-0 z-10 bg-white flex flex-col">
          <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Settings</h2>
            <button
              onClick={() => setShowSettings(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
            {settingsSections.map(({ icon: Icon, label, description, badge }) => (
              <div key={label} className="px-3 py-3 rounded-lg hover:bg-gray-50 cursor-default">
                <div className="flex items-center gap-2.5 mb-1">
                  <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-700">{label}</span>
                  <span className="ml-auto text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                    {badge}
                  </span>
                </div>
                <p className="text-xs text-gray-400 pl-6.5 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center">Project CAP · Early access</p>
          </div>
        </div>
      )}
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">O</span>
          </div>
          <span className="font-semibold text-gray-900 text-[15px]">OakChat</span>
        </div>
      </div>

      {/* Nav */}
      <div className="px-3 py-3 flex-1">
        <nav className="space-y-0.5 mb-6">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onFilterChange(id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                activeFilter === id
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
              {id === 'all' && totalUnread > 0 && (
                <span className="ml-auto text-xs font-semibold text-white bg-indigo-500 w-5 h-5 rounded-full flex items-center justify-center">
                  {totalUnread}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Stores */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
            Stores
          </p>
          <div className="space-y-0.5">
            {stores.map(store => (
              <button
                key={store.id}
                onClick={() => onFilterChange(`store:${store.id}`)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                  activeFilter === `store:${store.id}`
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                )}
              >
                <ChannelBadge channel={store.channel} />
                <span className="truncate">{store.name}</span>
                {store.unreadCount > 0 && (
                  <span className="ml-auto text-xs font-semibold text-indigo-600 bg-indigo-50 w-5 h-5 rounded-full flex items-center justify-center">
                    {store.unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white text-xs font-semibold">
            M
          </div>
          <span className="text-sm text-gray-700 font-medium">Melvin</span>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
