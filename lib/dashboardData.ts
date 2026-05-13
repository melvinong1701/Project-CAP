// ─── KPIs ────────────────────────────────────────────────────────────────────

export const kpis = [
  {
    id: 'revenue',
    label: 'Revenue (7d)',
    value: 'S$40.9k',
    deltaPct: 12.4,
    spark: [3200, 4100, 3800, 5200, 4800, 6100, 5900, 6400, 5700, 7200, 6800, 7500, 6900, 8100],
  },
  {
    id: 'orders',
    label: 'Orders (7d)',
    value: '261',
    deltaPct: 8.7,
    spark: [18, 22, 19, 28, 24, 31, 29, 33, 28, 36, 34, 38, 35, 41],
  },
  {
    id: 'conversations',
    label: 'Conversations',
    value: '1,284',
    deltaPct: 15.2,
    spark: [80, 95, 88, 112, 104, 128, 119, 134, 122, 148, 141, 156, 143, 162],
  },
  {
    id: 'ai_handled',
    label: 'AI handled',
    value: '68%',
    deltaPct: 4.1,
    spark: [58, 61, 59, 63, 62, 65, 64, 67, 65, 68, 67, 70, 68, 69],
  },
  {
    id: 'response',
    label: 'Avg response',
    value: '3.2m',
    deltaPct: -18.5,
    spark: [7.1, 6.8, 6.4, 5.9, 5.6, 5.2, 4.9, 4.6, 4.3, 4.1, 3.8, 3.6, 3.4, 3.2],
  },
  {
    id: 'csat',
    label: 'CSAT',
    value: '4.7',
    deltaPct: 2.2,
    spark: [4.2, 4.3, 4.2, 4.4, 4.3, 4.5, 4.4, 4.5, 4.6, 4.5, 4.6, 4.7, 4.6, 4.7],
  },
]

// ─── Revenue series (last 14 days) ───────────────────────────────────────────

export const revenueSeries = [
  { date: '2026-04-30', revenue: 3200 },
  { date: '2026-05-01', revenue: 4100 },
  { date: '2026-05-02', revenue: 3800 },
  { date: '2026-05-03', revenue: 5200 },
  { date: '2026-05-04', revenue: 4800 },
  { date: '2026-05-05', revenue: 6100 },
  { date: '2026-05-06', revenue: 5900 },
  { date: '2026-05-07', revenue: 6400 },
  { date: '2026-05-08', revenue: 5700 },
  { date: '2026-05-09', revenue: 7200 },
  { date: '2026-05-10', revenue: 6800 },
  { date: '2026-05-11', revenue: 7500 },
  { date: '2026-05-12', revenue: 6900 },
  { date: '2026-05-13', revenue: 11520 },
]

// ─── Channel mix ─────────────────────────────────────────────────────────────

export const channelSplit = [
  { channel: 'shopee' as const, label: 'Shopee', revenue: 38420, color: 'bg-orange-500' },
  { channel: 'lazada' as const, label: 'Lazada', revenue: 22180, color: 'bg-purple-500' },
  { channel: 'tiktok_shop' as const, label: 'TikTok Shop', revenue: 14760, color: 'bg-pink-500' },
  { channel: 'telegram' as const, label: 'Telegram', revenue: 6490, color: 'bg-blue-500' },
  { channel: 'whatsapp' as const, label: 'WhatsApp', revenue: 2830, color: 'bg-green-500' },
]

// ─── AI breakdown ─────────────────────────────────────────────────────────────

export const aiBreakdown = {
  autoSent: 748,
  drafted: 324,
  escalated: 212,
  avgConfidence: 0.81,
}

// ─── Top question topics ──────────────────────────────────────────────────────

export const topTopics = [
  { topic: 'Shipping & delivery status', count: 412 },
  { topic: 'Return & refund requests', count: 289 },
  { topic: 'Product compatibility', count: 201 },
  { topic: 'Bundle / discount pricing', count: 178 },
  { topic: 'Stock availability', count: 134 },
  { topic: 'Warranty & after-sales', count: 70 },
]

// ─── Best sellers ─────────────────────────────────────────────────────────────

export const bestSellers = [
  {
    id: 'prod-1',
    name: 'Wireless Earbuds Pro',
    channel: 'shopee' as const,
    unitsSold: 142,
    revenue: 12638,
    stock: 23,
    trend: [8, 11, 9, 14, 12, 18, 16],
  },
  {
    id: 'prod-2',
    name: '20,000mAh Power Bank 65W',
    channel: 'shopee' as const,
    unitsSold: 98,
    revenue: 8722,
    stock: 0,
    trend: [6, 8, 7, 10, 11, 14, 15],
  },
  {
    id: 'prod-3',
    name: 'Oversized Hoodie — Cream',
    channel: 'lazada' as const,
    unitsSold: 87,
    revenue: 6873,
    stock: 11,
    trend: [5, 7, 8, 10, 9, 12, 13],
  },
  {
    id: 'prod-4',
    name: 'Nordic Table Lamp',
    channel: 'tiktok_shop' as const,
    unitsSold: 74,
    revenue: 6586,
    stock: 44,
    trend: [3, 5, 6, 9, 8, 11, 10],
  },
  {
    id: 'prod-5',
    name: 'Skincare Glow Bundle',
    channel: 'shopee' as const,
    unitsSold: 61,
    revenue: 7808,
    stock: 8,
    trend: [4, 4, 5, 7, 8, 9, 11],
  },
]

// ─── Inventory alerts ─────────────────────────────────────────────────────────

export const inventoryAlerts = [
  {
    id: 'inv-1',
    product: '20,000mAh Power Bank 65W',
    channel: 'shopee' as const,
    store: 'TechGadgets SG',
    status: 'out' as const,
    stock: 0,
    daysOfCover: 0,
  },
  {
    id: 'inv-2',
    product: 'Skincare Glow Bundle',
    channel: 'shopee' as const,
    store: 'TechGadgets SG',
    status: 'low' as const,
    stock: 8,
    daysOfCover: 3,
  },
  {
    id: 'inv-3',
    product: 'Oversized Hoodie — Cream (M)',
    channel: 'lazada' as const,
    store: 'StyleHub MY',
    status: 'low' as const,
    stock: 11,
    daysOfCover: 4,
  },
  {
    id: 'inv-4',
    product: 'USB-C Hub 7-in-1',
    channel: 'tiktok_shop' as const,
    store: 'HomeLiving Co',
    status: 'low' as const,
    stock: 6,
    daysOfCover: 2,
  },
]

// ─── Store leaderboard ────────────────────────────────────────────────────────

export const storeLeaderboard = [
  {
    id: 'sl-1',
    name: 'TechGadgets SG',
    channel: 'shopee' as const,
    revenue: 38420,
    orders: 112,
    conversations: 524,
    aiHandledPct: 0.72,
    avgFirstResponseMin: 2.8,
  },
  {
    id: 'sl-2',
    name: 'StyleHub MY',
    channel: 'lazada' as const,
    revenue: 22180,
    orders: 78,
    conversations: 318,
    aiHandledPct: 0.65,
    avgFirstResponseMin: 3.4,
  },
  {
    id: 'sl-3',
    name: 'HomeLiving Co',
    channel: 'tiktok_shop' as const,
    revenue: 14760,
    orders: 54,
    conversations: 291,
    aiHandledPct: 0.70,
    avgFirstResponseMin: 3.1,
  },
  {
    id: 'sl-4',
    name: 'Support Bot',
    channel: 'telegram' as const,
    revenue: 6490,
    orders: 17,
    conversations: 151,
    aiHandledPct: 0.58,
    avgFirstResponseMin: 4.6,
  },
]

// ─── Agent rows ───────────────────────────────────────────────────────────────

export const agentRows = [
  {
    id: 'ag-1',
    initials: 'ML',
    name: 'Melvin',
    conversationsHandled: 148,
    aiAssistPct: 0.74,
    avgResponseMin: 2.9,
    csat: 4.8,
  },
  {
    id: 'ag-2',
    initials: 'RY',
    name: 'Ryan',
    conversationsHandled: 122,
    aiAssistPct: 0.68,
    avgResponseMin: 3.4,
    csat: 4.7,
  },
  {
    id: 'ag-3',
    initials: 'MT',
    name: 'Martin',
    conversationsHandled: 97,
    aiAssistPct: 0.61,
    avgResponseMin: 3.8,
    csat: 4.6,
  },
]

// ─── Customer signals ─────────────────────────────────────────────────────────

export const customerSignals = {
  newCustomers: 312,
  returningCustomers: 488,
  sentiment: {
    positive: 0.62,
    neutral: 0.28,
    negative: 0.10,
  },
  sentimentTrend: [0.54, 0.56, 0.55, 0.57, 0.58, 0.60, 0.59, 0.61, 0.60, 0.62, 0.61, 0.63, 0.62, 0.62],
}
