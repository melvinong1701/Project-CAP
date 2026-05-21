'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
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
  const [profileOrganizationId, setProfileOrganizationId] = useState<string | null>(organizationId ?? null)
  const [stores, setStores] = useState<Store[]>([])
  const [storeNames, setStoreNames] = useState<Record<string, string>>({})
  const [rawStores, setRawStores] = useState<{ id: string; name: string }[]>([])
  const activeOrganizationId = organizationId === undefined ? profileOrganizationId : organizationId

  useEffect(() => {
    if (organizationId !== undefined) {
      setProfileOrganizationId(organizationId)
      return
    }

    let cancelled = false

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single<{ organization_id: string }>()

      if (!cancelled) setProfileOrganizationId(profile?.organization_id ?? null)
    })

    return () => {
      cancelled = true
    }
  }, [organizationId])

  const fetchStores = useCallback(async () => {
    if (!activeOrganizationId) {
      setStores([])
      setStoreNames({})
      setRawStores([])
      return
    }

    const { data: storeRows } = await supabase
      .from('stores')
      .select('id, name')
      .eq('organization_id', activeOrganizationId)
      .returns<StoreRow[]>()

    const storeIds = (storeRows ?? []).map(store => store.id)
    const { data: platformRows } = storeIds.length
      ? await supabase
          .from('store_platforms')
          .select('store_id, platform_id, account_label')
          .eq('organization_id', activeOrganizationId)
          .in('store_id', storeIds)
          .returns<StorePlatformRow[]>()
      : { data: [] as StorePlatformRow[] }

    const names: Record<string, string> = {}
    ;(storeRows ?? []).forEach(store => {
      names[store.id] = store.name
    })
    setStoreNames(names)
    setRawStores((storeRows ?? []).map(store => ({ id: store.id, name: store.name })))

    const channelsByStore = new Map<string, Channel[]>()
    ;(platformRows ?? []).forEach(platform => {
      if (!isChannel(platform.platform_id)) return

      const channels = channelsByStore.get(platform.store_id) ?? []
      if (!channels.includes(platform.platform_id)) channels.push(platform.platform_id)
      channelsByStore.set(platform.store_id, channels)
    })

    const sidebarStores: Store[] = (storeRows ?? []).map(store => ({
      id: store.id,
      name: store.name,
      channels: channelsByStore.get(store.id) ?? [],
      unreadCount: 0,
    }))

    setStores(sidebarStores)
  }, [activeOrganizationId])

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  return { stores, storeNames, rawStores, fetchStores }
}
