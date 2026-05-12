// Mock data for the Manager / Owner snapshot dashboard.
// All currency values in SGD. Multi-tenant: every row scoped to organizationId.

export type Channel =
  | 'shopee'
  | 'lazada'
  | 'tiktok_shop'
  | 'whatsapp'
  | 'instagram'
  | 'facebook_messenger'
  | 'telegram'

export interface DashboardKpi {
  id: string
  label: string
  value: string
  rawValue: number
  deltaPct: number // vs previous period
  format: 'currency' | 'number' | 'percent' | 'duration'
  spark: number[]
}

export interface RevenuePoint {
  date: string // ISO yyyy-mm-dd
  revenue: number
  orders: number
}

export interface ChannelSplit {
  channel: Channel
  label: string
  revenue: number
  orders: number
  color: string // tailwind bg-* class
}

export interface AiBreakdown {
  autoSent: number
  drafted: number
  escalated: number
  totalReplies: number
  avgConfidence: number // 0–1
}

export interface TopicCount {
  topic: string
  count: number
}

export interface BestSeller {
  id: string
  name: string
  channel: Channel
  unitsSold: number
  revenue: number
  stock: number
  trend: number[] // last 7d units
}

export interface InventoryAlert {
  id: string
  product: string
  store: string
  channel: Channel
  status: 'low' | 'out'
  stock: number
  daysOfCover: number
}

export interface StoreLeaderboardRow {
  id: string
  name: string
  channel: Channel
  revenue: number
  orders: number
  conversations: number
  aiHandledPct: number
  avgFirstResponseMin: number
}

export interface AgentRow {
  id: string
  name: string
  initials: string
  conversationsHandled: number
  aiAssistPct: number // % of their replies that started from an AI draft
  avgResponseMin: number
  csat: number // 0–5
}

export interface CustomerSignals {
  newCustomers: number
  returningCustomers: number
  sentiment: { positive: number; neutral: number; negative: number }
  sentimentTrend: number[] // last 14d net sentiment
}

// ─── Mock data ──────────────────────────────────────────────────────────────

export const kpis: DashboardKpi[] = [
  {
    id: 'revenue',
    label: 'Revenue (7d)',
    value: 'S$48,920',
    rawValue: 48920,
    deltaPct: 12.4,
    format: 'currency',
    spark: [4200, 5100, 4800, 7300, 6900, 9100, 11520],
  },
  {
    id: 'orders',
    label: 'Orders (7d)',
    value: '312',
    rawValue: 312,
    deltaPct: 8.1,
    format: 'number',
    spark: [28, 35, 33, 48, 44, 58, 66],
  },
  {
    id: 'conversations',
    label: 'Conversations (7d)',
    value: '1,184',
    rawValue: 1184,
    deltaPct: 21.6,
    format: 'number',
    spark: [110, 132, 148, 167, 175, 198, 254],
  },
  {
    id: 'ai_handle',
    label: 'AI handle rate',
    value: '64%',
    rawValue: 0.64,
    deltaPct: 6.2,
    format: 'percent',
    spark: [0.42, 0.48, 0.51, 0.55, 0.58, 0.61, 0.64],
  },
  {
    id: 'response',
    label: 'Avg first response',
    value: '1m 48s',
    rawValue: 108,
    deltaPct: -34.1, // lower is better
    format: 'duration',
    spark: [320, 280, 240, 200, 165, 130, 108],
  },
  {
    id: 'conversion',
    label: 'Chat → Order',
    value: '18.3%',
    rawValue: 0.183,
    deltaPct: 2.4,
    format: 'percent',
    spark: [0.14, 0.15, 0.16, 0.165, 0.17, 0.178, 0.183],
  },
]

// 14 days, ending today
export const revenueSeries: RevenuePoint[] = [
  { date: '2026-04-30', revenue: 3850, orders: 24 },
  { date: '2026-05-01', revenue: 4120, orders: 27 },
  { date: '2026-05-02', revenue: 5340, orders: 35 },
  { date: '2026-05-03', revenue: 6020, orders: 41 },
  { date: '2026-05-04', revenue: 4780, orders: 31 },
  { date: '2026-05-05', revenue: 5210, orders: 33 },
  { date: '2026-05-06', revenue: 6450, orders: 42 },
  { date: '2026-05-07', revenue: 4200, orders: 28 },
  { date: '2026-05-08', revenue: 5100, orders: 35 },
  { date: '2026-05-09', revenue: 4800, orders: 33 },
  { date: '2026-05-10', revenue: 7300, orders: 48 },
  { date: '2026-05-11', revenue: 6900, orders: 44 },
  { date: '2026-05-12', revenue: 9100, orders: 58 },
  { date: '2026-05-13', revenue: 11520, orders: 66 },
]

export const channelSplit: ChannelSplit[] = [
  { channel: 'shopee', label: 'Shopee', revenue: 22480, orders: 148, color: 'bg-orange-500' },
  { channel: 'lazada', label: 'Lazada', revenue: 12640, orders: 78, color: 'bg-blue-600' },
  { channel: 'tiktok_shop', label: 'TikTok Shop', revenue: 9320, orders: 61, color: 'bg-gray-900' },
  { channel: 'whatsapp', label: 'WhatsApp', revenue: 3180, orders: 18, color: 'bg-green-600' },
  { channel: 'instagram', label: 'Instagram', revenue: 1300, orders: 7, color: 'bg-pink-500' },
]

export const aiBreakdown: AiBreakdown = {
  autoSent: 482,
  drafted: 273,
  escalated: 116,
  totalReplies: 871,
  avgConfidence: 0.78,
}

export const topTopics: TopicCount[] = [
  { topic: 'Shipping & tracking', count: 312 },
  { topic: 'Product specs', count: 218 },
  { topic: 'Returns & refunds', count: 164 },
  { topic: 'Stock availability', count: 138 },
  { topic: 'Pricing & promo', count: 92 },
  { topic: 'Order changes', count: 71 },
]

export const bestSellers: BestSeller[] = [
  {
    id: 'sku-1',
    name: 'Sony WF-1000XM5 Earbuds',
    channel: 'shopee',
    unitsSold: 87,
    revenue: 25143,
    stock: 42,
    trend: [9, 12, 11, 14, 13, 12, 16],
  },
  {
    id: 'sku-2',
    name: 'Mechanical Keyboard TKL RGB',
    channel: 'lazada',
    unitsSold: 64,
    revenue: 9536,
    stock: 18,
    trend: [7, 9, 8, 10, 9, 11, 10],
  },
  {
    id: 'sku-3',
    name: 'Rattan Pendant Light',
    channel: 'shopee',
    unitsSold: 58,
    revenue: 6322,
    stock: 9,
    trend: [6, 7, 9, 8, 8, 10, 10],
  },
  {
    id: 'sku-4',
    name: 'Linen Throw Cushion (Set of 2)',
    channel: 'tiktok_shop',
    unitsSold: 51,
    revenue: 3060,
    stock: 28,
    trend: [5, 6, 7, 8, 7, 9, 9],
  },
  {
    id: 'sku-5',
    name: 'USB-C 100W Charger',
    channel: 'shopee',
    unitsSold: 44,
    revenue: 2552,
    stock: 0,
    trend: [8, 7, 8, 9, 6, 4, 2],
  },
]

export const inventoryAlerts: InventoryAlert[] = [
  {
    id: 'inv-1',
    product: 'USB-C 100W Charger',
    store: 'TechGear SG',
    channel: 'shopee',
    status: 'out',
    stock: 0,
    daysOfCover: 0,
  },
  {
    id: 'inv-2',
    product: 'Rattan Pendant Light',
    store: 'HomeDecor MY',
    channel: 'shopee',
    status: 'low',
    stock: 9,
    daysOfCover: 4,
  },
  {
    id: 'inv-3',
    product: 'Mechanical Keyboard TKL RGB',
    store: 'TechGear SG',
    channel: 'lazada',
    status: 'low',
    stock: 18,
    daysOfCover: 6,
  },
  {
    id: 'inv-4',
    product: 'Wireless Mouse Pro',
    store: 'TechGear SG',
    channel: 'tiktok_shop',
    status: 'low',
    stock: 12,
    daysOfCover: 5,
  },
  {
    id: 'inv-5',
    product: 'Ceramic Vase Small',
    store: 'HomeDecor MY',
    channel: 'lazada',
    status: 'out',
    stock: 0,
    daysOfCover: 0,
  },
]

export const storeLeaderboard: StoreLeaderboardRow[] = [
  {
    id: 'store-1',
    name: 'TechGear SG',
    channel: 'shopee',
    revenue: 18420,
    orders: 112,
    conversations: 486,
    aiHandledPct: 0.71,
    avgFirstResponseMin: 1.6,
  },
  {
    id: 'store-2',
    name: 'TechGear SG',
    channel: 'lazada',
    revenue: 9240,
    orders: 56,
    conversations: 218,
    aiHandledPct: 0.66,
    avgFirstResponseMin: 2.1,
  },
  {
    id: 'store-3',
    name: 'HomeDecor MY',
    channel: 'shopee',
    revenue: 6840,
    orders: 41,
    conversations: 174,
    aiHandledPct: 0.58,
    avgFirstResponseMin: 2.4,
  },
  {
    id: 'store-4',
    name: 'TechGear SG',
    channel: 'tiktok_shop',
    revenue: 6120,
    orders: 38,
    conversations: 142,
    aiHandledPct: 0.61,
    avgFirstResponseMin: 1.9,
  },
  {
    id: 'store-5',
    name: 'HomeDecor MY',
    channel: 'lazada',
    revenue: 4760,
    orders: 31,
    conversations: 92,
    aiHandledPct: 0.54,
    avgFirstResponseMin: 3.2,
  },
  {
    id: 'store-6',
    name: 'TechGear SG',
    channel: 'whatsapp',
    revenue: 3180,
    orders: 18,
    conversations: 48,
    aiHandledPct: 0.49,
    avgFirstResponseMin: 2.8,
  },
  {
    id: 'store-7',
    name: 'HomeDecor MY',
    channel: 'instagram',
    revenue: 1300,
    orders: 7,
    conversations: 24,
    aiHandledPct: 0.42,
    avgFirstResponseMin: 4.1,
  },
]

export const agentRows: AgentRow[] = [
  { id: 'a1', name: 'Melvin Ong', initials: 'MO', conversationsHandled: 184, aiAssistPct: 0.82, avgResponseMin: 1.4, csat: 4.8 },
  { id: 'a2', name: 'Ryan Tan', initials: 'RT', conversationsHandled: 142, aiAssistPct: 0.74, avgResponseMin: 1.9, csat: 4.6 },
  { id: 'a3', name: 'Martin Lee', initials: 'ML', conversationsHandled: 96, aiAssistPct: 0.68, avgResponseMin: 2.2, csat: 4.5 },
  { id: 'a4', name: 'Siti Aishah', initials: 'SA', conversationsHandled: 88, aiAssistPct: 0.79, avgResponseMin: 1.7, csat: 4.7 },
]

export const customerSignals: CustomerSignals = {
  newCustomers: 142,
  returningCustomers: 78,
  sentiment: { positive: 0.71, neutral: 0.22, negative: 0.07 },
  sentimentTrend: [0.58, 0.61, 0.63, 0.62, 0.65, 0.64, 0.67, 0.69, 0.68, 0.7, 0.71, 0.7, 0.72, 0.71],
}
