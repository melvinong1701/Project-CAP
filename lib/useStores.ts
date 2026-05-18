'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Store } from '@/lib/types'

const ORG_ID = '00000000-0000-0000-0000-000000000001'

interface StoreRow {
  id: string
  name: string
}

interface StorePlatformRow {
  store_id: string
  platform_id: string
  account_label: string | null
}

export function useStores(): {
  stores: Store[]
  storeNames: Record<string, string>
  rawStores: { id: string; name: string }[]
  fetchStores: () => Promise<void>
} {
  const [stores, setStores] = useState<Store[]>([])
  const [storeNames, setStoreNames] = useState<Record<string, string>>({})
  const [rawStores, setRawStores] = useState<{ id: string; name: string }[]>([])

  const fetchStores = useCallback(async () => {
    const { data: storeRows } = await supabase
      .from('stores')
      .select('id, name')
      .eq('organization_id', ORG_ID)
      .returns<StoreRow[]>()

    const storeIds = (storeRows ?? []).map(store => store.id)
    const { data: platformRows } = storeIds.length
      ? await supabase
          .from('store_platforms')
          .select('store_id, platform_id, account_label')
          .eq('organization_id', ORG_ID)
          .in('store_id', storeIds)
          .returns<StorePlatformRow[]>()
      : { data: [] as StorePlatformRow[] }

    const names: Record<string, string> = {}
    ;(storeRows ?? []).forEach(store => {
      names[store.id] = store.name
    })
    setStoreNames(names)
    setRawStores((storeRows ?? []).map(store => ({ id: store.id, name: store.name })))

    const sidebarStores: Store[] = (platformRows ?? []).map(platform => ({
      id: `${platform.store_id}:${platform.platform_id}`,
      name: names[platform.store_id] ?? platform.account_label ?? 'Store',
      channel: platform.platform_id as Store['channel'],
      unreadCount: 0,
    }))

    setStores(sidebarStores)
  }, [])

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  return { stores, storeNames, rawStores, fetchStores }
}
