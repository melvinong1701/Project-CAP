'use client'

import { useCallback, useEffect, useState } from 'react'
import { Channel, Store } from '@/lib/types'

interface StoreRow {
  id: string
  name: string
}

interface StorePlatformRow {
  store_id: string
  platform_id: string
  account_label: string | null
}

function isChannel(value: string): value is Channel {
  return [
    'telegram',
    'shopify',
    'shopee',
    'lazada',
    'tiktok_shop',
    'whatsapp',
    'facebook_messenger',
    'instagram',
  ].includes(value)
}

export function useStores(organizationId?: string | null): {
  stores: Store[]
  storeNames: Record<string, string>
  rawStores: { id: string; name: string }[]
  fetchStores: () => Promise<void>
} {
  const [stores, setStores] = useState<Store[]>([])
  const [storeNames, setStoreNames] = useState<Record<string, string>>({})
  const [rawStores, setRawStores] = useState<{ id: string; name: string }[]>([])
  const shouldFetch = organizationId === undefined || Boolean(organizationId)

  const fetchStores = useCallback(async () => {
    if (!shouldFetch) {
      setStores([])
      setStoreNames({})
      setRawStores([])
      return
    }

    const response = await fetch('/api/stores')
    if (!response.ok) {
      setStores([])
      setStoreNames({})
      setRawStores([])
      return
    }

    const payload = await response.json() as {
      stores?: StoreRow[]
      platforms?: StorePlatformRow[]
    }
    const storeRows = payload.stores ?? []
    const platformRows = payload.platforms ?? []

    const names: Record<string, string> = {}
    storeRows.forEach(store => {
      names[store.id] = store.name
    })

    const channelsByStore = new Map<string, Channel[]>()
    platformRows.forEach(platform => {
      if (!isChannel(platform.platform_id)) return

      const channels = channelsByStore.get(platform.store_id) ?? []
      if (!channels.includes(platform.platform_id)) channels.push(platform.platform_id)
      channelsByStore.set(platform.store_id, channels)
    })

    const sidebarStores: Store[] = storeRows.map(store => ({
      id: store.id,
      name: store.name,
      channels: channelsByStore.get(store.id) ?? [],
      unreadCount: 0,
    }))

    setStoreNames(names)
    setRawStores(storeRows.map(store => ({ id: store.id, name: store.name })))
    setStores(sidebarStores)
  }, [shouldFetch])

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  return { stores, storeNames, rawStores, fetchStores }
}
