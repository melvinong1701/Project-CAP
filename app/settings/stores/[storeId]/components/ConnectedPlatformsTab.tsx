'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import {
  AlertCircle,
  Check,
  ChevronDown,
  Loader2,
  Plug,
  X,
} from 'lucide-react'
import { PLATFORMS, PlatformDef } from '@/lib/platformRegistry'
import { cn } from '@/lib/utils'

interface StorePlatformRow {
  id: string
  store_id: string
  platform_id: string
  account_label: string | null
  organization_id: string
  created_at: string
}

interface ConnectedPlatformsTabProps {
  storeId: string
}

type PlatformWithConnection = {
  platform: PlatformDef
  connection: StorePlatformRow | null
}

function StatusBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
      <Check className="h-3 w-3" />
      Connected
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">
      Not Connected
    </span>
  )
}

function PlatformLogo({ platform }: { platform: PlatformDef }) {
  return (
    <div
      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
      style={{ backgroundColor: `${platform.color}14` }}
    >
      <Image
        src={platform.logo}
        alt=""
        width={32}
        height={32}
        className="h-8 w-8"
      />
      <span className="sr-only">{platform.label}</span>
    </div>
  )
}

function CapabilityStatus({ status }: { status: 'active' | 'coming_soon' }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
        <Check className="h-3 w-3" />
        Active
      </span>
    )
  }

  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
      Coming Soon
    </span>
  )
}

function PlatformCard({
  item,
  onSelect,
  onConnectPlaceholder,
  onDisconnect,
  isDisconnecting,
}: {
  item: PlatformWithConnection
  onSelect: () => void
  onConnectPlaceholder: () => void
  onDisconnect: () => void
  isDisconnecting: boolean
}) {
  const { platform, connection } = item
  const connected = Boolean(connection)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'group flex min-h-[278px] cursor-pointer flex-col rounded-2xl border bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
        connected ? 'border-green-200' : 'border-gray-100 hover:border-gray-200'
      )}
      style={{ borderTopColor: platform.color, borderTopWidth: 3 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <PlatformLogo platform={platform} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">{platform.label}</p>
            {connected ? (
              <p className="mt-0.5 truncate text-xs font-medium text-green-700">
                {connection?.account_label ?? 'Connected account'}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-gray-400">Ready to configure</p>
            )}
          </div>
        </div>
        <StatusBadge connected={connected} />
      </div>

      <div className="mt-5 flex-1 space-y-2.5">
        {platform.capabilities.map(capability => (
          <div
            key={capability.key}
            className={cn(
              'flex items-start justify-between gap-3 rounded-xl px-3 py-2.5',
              connected && capability.status === 'active' ? 'bg-green-50/60' : 'bg-gray-50'
            )}
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-900">{capability.label}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{capability.description}</p>
            </div>
            <CapabilityStatus status={connected ? capability.status : 'coming_soon'} />
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        {connected ? (
          <button
            type="button"
            disabled={isDisconnecting}
            onClick={event => {
              event.stopPropagation()
              onDisconnect()
            }}
            className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-500 transition-colors hover:bg-red-50 disabled:opacity-40"
          >
            {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        ) : platform.connectAvailable ? (
          <button
            type="button"
            onClick={event => {
              event.stopPropagation()
              onConnectPlaceholder()
            }}
            className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition-colors group-hover:bg-indigo-700"
          >
            Connect
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-400"
          >
            Coming Soon
          </button>
        )}
      </div>
    </div>
  )
}

function PlatformDrawer({
  item,
  onClose,
  onConnectPlaceholder,
  onDisconnect,
  isDisconnecting,
}: {
  item: PlatformWithConnection
  onClose: () => void
  onConnectPlaceholder: () => void
  onDisconnect: () => void
  isDisconnecting: boolean
}) {
  const { platform, connection } = item
  const connected = Boolean(connection)
  const syncedAt = connection?.created_at
    ? new Intl.DateTimeFormat('en-SG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(connection.created_at))
    : null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/25" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="border-b border-gray-100 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <PlatformLogo platform={platform} />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-gray-900">{platform.label}</p>
                <div className="mt-1">
                  <StatusBadge connected={connected} />
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700"
              aria-label="Close platform details"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Account</p>
            <p className="mt-1 text-sm font-medium text-gray-900">
              {connection?.account_label ?? 'No account connected'}
            </p>
            {syncedAt && (
              <p className="mt-1 text-xs text-gray-500">Last synced: {syncedAt}</p>
            )}
          </div>

          <div className="mt-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Capabilities</p>
            <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100">
              {platform.capabilities.map(capability => (
                <details key={capability.key} className="group bg-white">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{capability.label}</p>
                      <p className="mt-0.5 text-xs text-gray-400">Data access and automation scope</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <CapabilityStatus status={connected ? capability.status : 'coming_soon'} />
                      <ChevronDown className="h-4 w-4 text-gray-300 transition-transform group-open:rotate-180" />
                    </div>
                  </summary>
                  <div className="px-4 pb-4 text-sm text-gray-600">
                    {capability.description}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 px-6 py-4">
          {connected ? (
            <button
              type="button"
              disabled={isDisconnecting}
              onClick={onDisconnect}
              className="w-full rounded-xl border border-red-200 py-2.5 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50 disabled:opacity-40"
            >
              {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          ) : platform.connectAvailable ? (
            <button
              type="button"
              onClick={onConnectPlaceholder}
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              Connect
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="w-full rounded-xl bg-gray-100 py-2.5 text-sm font-semibold text-gray-400"
            >
              Coming Soon
            </button>
          )}
        </div>
      </aside>
    </div>
  )
}

export default function ConnectedPlatformsTab({ storeId }: ConnectedPlatformsTabProps) {
  const [connections, setConnections] = useState<StorePlatformRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPlatformId, setSelectedPlatformId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchConnectedPlatforms() {
      setLoading(true)
      setError(null)

      try {
        const res = await fetch(`/api/stores/${encodeURIComponent(storeId)}/platforms`)
        const data = await res.json() as { platforms?: StorePlatformRow[]; error?: string }

        if (!res.ok) {
          throw new Error(data.error ?? 'Failed to load connected platforms')
        }

        if (!cancelled) {
          setConnections(data.platforms ?? [])
        }
      } catch {
        if (!cancelled) {
          setError('Could not load connected platforms for this store.')
          setConnections([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchConnectedPlatforms()

    return () => {
      cancelled = true
    }
  }, [storeId])

  const platformItems = useMemo<PlatformWithConnection[]>(
    () => PLATFORMS.map(platform => ({
      platform,
      connection: connections.find(row => row.platform_id === platform.id) ?? null,
    })),
    [connections]
  )

  const selectedItem = platformItems.find(item => item.platform.id === selectedPlatformId) ?? null

  const showConnectPlaceholder = () => {
    setNotice('OAuth coming soon. Contact Project CAP support to connect this platform manually for now.')
    window.setTimeout(() => setNotice(null), 3500)
  }

  const handleDisconnect = async (platformId: string) => {
    setDisconnecting(platformId)
    setConfirmDisconnect(null)
    setError(null)

    try {
      const res = await fetch(
        `/api/stores/${encodeURIComponent(storeId)}/platforms/${encodeURIComponent(platformId)}`,
        { method: 'DELETE' }
      )

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setError(data.error ?? 'Failed to disconnect platform')
        return
      }

      setConnections(prev => prev.filter(connection => connection.platform_id !== platformId))
      setSelectedPlatformId(null)
    } catch {
      setError('Could not disconnect platform. Please try again.')
    } finally {
      setDisconnecting(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <Plug className="h-4 w-4 flex-shrink-0" />
          {notice}
        </div>
      )}

      {confirmDisconnect && (() => {
        const platformLabel = PLATFORMS.find(platform => platform.id === confirmDisconnect)?.label ?? confirmDisconnect

        return (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-800">
              Disconnect <span className="font-semibold">{platformLabel}</span>? Messages will stop flowing into CAP immediately.
            </p>
            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmDisconnect(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-red-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDisconnect(confirmDisconnect)}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700"
              >
                Disconnect
              </button>
            </div>
          </div>
        )
      })()}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {platformItems.map(item => (
          <PlatformCard
            key={item.platform.id}
            item={item}
            onSelect={() => setSelectedPlatformId(item.platform.id)}
            onConnectPlaceholder={showConnectPlaceholder}
            onDisconnect={() => setConfirmDisconnect(item.platform.id)}
            isDisconnecting={disconnecting === item.platform.id}
          />
        ))}
      </div>

      {selectedItem && (
        <PlatformDrawer
          item={selectedItem}
          onClose={() => setSelectedPlatformId(null)}
          onConnectPlaceholder={showConnectPlaceholder}
          onDisconnect={() => {
            setConfirmDisconnect(selectedItem.platform.id)
            setSelectedPlatformId(null)
          }}
          isDisconnecting={disconnecting === selectedItem.platform.id}
        />
      )}
    </div>
  )
}
