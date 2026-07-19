'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { Store } from '@/lib/types'
import { ChannelBadge } from './ChannelBadge'
import { Inbox, BookMarked, UserCheck, Clock, Settings, BarChart3, Users, Store as StoreIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  stores: Store[]
  activeFilter: string
  onFilterChange: (filter: string) => void
}

interface AccountResponse {
  data?: {
    account?: {
      fullName?: string
    }
  }
}

const navItems = [
  { id: 'all', label: 'All conversations', icon: Inbox },
  { id: 'unread', label: 'Unread', icon: BookMarked },
  { id: 'assigned', label: 'Assigned to me', icon: UserCheck },
  { id: 'snoozed', label: 'Snoozed', icon: Clock },
]

export function Sidebar({ stores, activeFilter, onFilterChange }: SidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const totalUnread = stores.reduce((sum, s) => sum + s.unreadCount, 0)
  const [userName, setUserName] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch('/api/account')
      .then(res => (res.ok ? res.json() : null))
      .then((payload: AccountResponse | null) => {
        if (cancelled) return

        const name = payload?.data?.account?.fullName
        if (name) setUserName(name)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  const userInitial = userName ? userName.trim().charAt(0).toUpperCase() : ''

  return (
    <div className="w-60 flex-shrink-0 flex flex-col border-r border-gray-100 bg-white min-h-0">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">C</span>
          </div>
          <span className="font-semibold text-gray-900 text-[15px]">Project CAP</span>
        </div>
      </div>

      {/* Nav */}
      <div className="px-3 py-3 flex-1 min-h-0 overflow-y-auto">
        {/* Top-level: Snapshot (manager view) */}
        <nav className="space-y-0.5 mb-3">
          <button
            onClick={() => router.push('/dashboard')}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname === '/dashboard'
                ? 'bg-indigo-50 text-indigo-700 font-medium'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
            )}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Snapshot</span>
          </button>
        </nav>

        <nav className="space-y-0.5 mb-3">
          <button
            onClick={() => router.push('/customers')}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname === '/customers'
                ? 'bg-indigo-50 text-indigo-700 font-medium'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
            )}
          >
            <Users className="w-4 h-4" />
            <span>Customers</span>
          </button>
        </nav>

        <nav className="space-y-0.5 mb-1">
          <button
            onClick={() => router.push('/')}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname === '/'
                ? 'bg-indigo-50 text-indigo-700 font-medium'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
            )}
          >
            <Inbox className="w-4 h-4" />
            <span>Inbox</span>
            {totalUnread > 0 && (
              <span className="ml-auto text-xs font-semibold text-white bg-indigo-500 w-5 h-5 rounded-full flex items-center justify-center">
                {totalUnread}
              </span>
            )}
          </button>
        </nav>
        <nav className="space-y-0.5 mb-6 pl-3">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onFilterChange(id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                pathname === '/' && activeFilter === id
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
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
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border',
                    activeFilter === `store:${store.id}`
                      ? 'border-indigo-100 bg-white text-indigo-600'
                      : 'border-gray-100 bg-gray-50 text-gray-400'
                  )}
                >
                  <StoreIcon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-left">{store.name}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {store.channels.map(channel => (
                    <ChannelBadge key={channel} channel={channel} className="shrink-0" />
                  ))}
                </span>
                {store.unreadCount > 0 && (
                  <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 w-5 h-5 rounded-full flex items-center justify-center">
                    {store.unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
        <button
          type="button"
          onClick={() => router.push('/account')}
          className="flex min-w-0 items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors hover:bg-gray-50"
        >
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white text-xs font-semibold">
            {userInitial}
          </div>
          {userName ? (
            <span className="truncate text-sm text-gray-700 font-medium">{userName}</span>
          ) : (
            <span className="h-3.5 w-16 animate-pulse rounded bg-gray-100" />
          )}
        </button>
        <button
          onClick={() => router.push('/settings')}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
