export type PlatformCapability = {
  key: string
  label: string
  description: string
  status: 'active' | 'coming_soon'
}

export type PlatformDef = {
  id: 'telegram' | 'shopee' | 'lazada' | 'tiktok_shop' | 'tokopedia' | 'whatsapp' | 'line' | 'meta'
  label: string
  logo: string
  color: string
  connectAvailable: boolean
  capabilities: PlatformCapability[]
}

export const PLATFORMS: PlatformDef[] = [
  {
    id: 'telegram',
    label: 'Telegram',
    logo: '/logos/telegram.svg',
    color: '#2CA5E0',
    connectAvailable: true,
    capabilities: [
      {
        key: 'messages',
        label: 'Messages',
        description: 'Receive and reply to customer messages',
        status: 'active',
      },
      {
        key: 'ai_suggest',
        label: 'AI Suggestions',
        description: 'AI drafts replies for agent review',
        status: 'active',
      },
    ],
  },
  {
    id: 'shopee',
    label: 'Shopee',
    logo: '/logos/shopee.svg',
    color: '#EE4D2D',
    connectAvailable: false,
    capabilities: [
      {
        key: 'messages',
        label: 'Messages',
        description: 'Receive and reply to buyer messages',
        status: 'coming_soon',
      },
      {
        key: 'orders',
        label: 'Orders',
        description: 'Look up order status for AI context',
        status: 'coming_soon',
      },
      {
        key: 'products',
        label: 'Product Catalogue',
        description: 'Sync products for AI product queries',
        status: 'coming_soon',
      },
    ],
  },
  {
    id: 'lazada',
    label: 'Lazada',
    logo: '/logos/lazada.svg',
    color: '#0F146D',
    connectAvailable: false,
    capabilities: [
      {
        key: 'messages',
        label: 'Messages',
        description: 'Receive and reply to buyer messages',
        status: 'coming_soon',
      },
      {
        key: 'orders',
        label: 'Orders',
        description: 'Look up order status for AI context',
        status: 'coming_soon',
      },
      {
        key: 'products',
        label: 'Product Catalogue',
        description: 'Sync products for AI product queries',
        status: 'coming_soon',
      },
    ],
  },
  {
    id: 'tiktok_shop',
    label: 'TikTok Shop',
    logo: '/logos/tiktok.svg',
    color: '#010101',
    connectAvailable: false,
    capabilities: [
      {
        key: 'messages',
        label: 'Messages',
        description: 'Receive and reply to buyer messages',
        status: 'coming_soon',
      },
      {
        key: 'orders',
        label: 'Orders',
        description: 'Look up order status for AI context',
        status: 'coming_soon',
      },
    ],
  },
  {
    id: 'tokopedia',
    label: 'Tokopedia',
    logo: '/logos/tokopedia.svg',
    color: '#42B549',
    connectAvailable: false,
    capabilities: [
      {
        key: 'messages',
        label: 'Messages',
        description: 'Receive and reply to buyer messages',
        status: 'coming_soon',
      },
      {
        key: 'orders',
        label: 'Orders',
        description: 'Look up order status for AI context',
        status: 'coming_soon',
      },
      {
        key: 'products',
        label: 'Product Catalogue',
        description: 'Sync products for AI product queries',
        status: 'coming_soon',
      },
    ],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    logo: '/logos/whatsapp.svg',
    color: '#25D366',
    connectAvailable: false,
    capabilities: [
      {
        key: 'messages',
        label: 'Messages',
        description: 'Receive and reply to customer messages',
        status: 'coming_soon',
      },
      {
        key: 'ai_suggest',
        label: 'AI Suggestions',
        description: 'AI drafts replies for agent review',
        status: 'coming_soon',
      },
    ],
  },
  {
    id: 'line',
    label: 'Line',
    logo: '/logos/line.svg',
    color: '#06C755',
    connectAvailable: false,
    capabilities: [
      {
        key: 'messages',
        label: 'Messages',
        description: 'Receive and reply to customer messages',
        status: 'coming_soon',
      },
      {
        key: 'ai_suggest',
        label: 'AI Suggestions',
        description: 'AI drafts replies for agent review',
        status: 'coming_soon',
      },
    ],
  },
  {
    id: 'meta',
    label: 'Meta (Facebook & Instagram)',
    logo: '/logos/meta.svg',
    color: '#0866FF',
    connectAvailable: false,
    capabilities: [
      {
        key: 'messages',
        label: 'Messages',
        description: 'Receive and reply to Facebook and Instagram DMs',
        status: 'coming_soon',
      },
      {
        key: 'comments',
        label: 'Comments',
        description: 'Monitor and reply to post comments',
        status: 'coming_soon',
      },
    ],
  },
]
