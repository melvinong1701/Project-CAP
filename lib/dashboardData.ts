export type Range = '24h' | '7d' | '30d'

// ─── KPIs ─────────────────────────────────────────────────────────────────────

const kpisData = {
  '24h': [
    { id: 'revenue',       label: 'Revenue (24h)',   value: 'S$5.8k',  deltaPct:  3.2,  spark: [180, 90, 60, 110, 140, 210, 290, 380, 460, 520, 610, 680, 630, 590, 540, 490, 420, 380, 310, 260, 210, 170, 130, 90] },
    { id: 'orders',        label: 'Orders (24h)',    value: '37',      deltaPct:  5.4,  spark: [1, 0, 0, 1, 2, 3, 4, 5, 6, 7, 7, 8, 7, 6, 5, 5, 4, 4, 3, 2, 2, 1, 1, 0] },
    { id: 'conversations', label: 'Conversations',  value: '183',     deltaPct: 11.2,  spark: [4, 2, 1, 3, 6, 10, 14, 18, 20, 22, 21, 19, 17, 15, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3] },
    { id: 'ai_handled',    label: 'AI handled',     value: '66%',     deltaPct:  1.8,  spark: [60, 62, 58, 63, 64, 65, 66, 64, 67, 65, 66, 68, 65, 66, 64, 67, 65, 66, 65, 66, 67, 65, 66, 66] },
    { id: 'response',      label: 'Avg response',   value: '3.4m',    deltaPct: -12.1, spark: [5.8, 6.2, 5.9, 5.4, 5.0, 4.8, 4.6, 4.4, 4.2, 4.1, 3.9, 3.8, 3.7, 3.6, 3.6, 3.5, 3.5, 3.4, 3.4, 3.4, 3.4, 3.4, 3.4, 3.4] },
    { id: 'csat',          label: 'CSAT',           value: '4.7',     deltaPct:  0.9,  spark: [4.5, 4.6, 4.5, 4.6, 4.7, 4.6, 4.7, 4.7, 4.6, 4.7, 4.7, 4.8, 4.7, 4.7, 4.6, 4.7, 4.7, 4.7, 4.8, 4.7, 4.7, 4.7, 4.7, 4.7] },
  ],
  '7d': [
    { id: 'revenue',       label: 'Revenue (7d)',   value: 'S$40.9k', deltaPct: 12.4,  spark: [3200, 4100, 3800, 5200, 4800, 6100, 5900, 6400, 5700, 7200, 6800, 7500, 6900, 8100] },
    { id: 'orders',        label: 'Orders (7d)',    value: '261',     deltaPct:  8.7,  spark: [18, 22, 19, 28, 24, 31, 29, 33, 28, 36, 34, 38, 35, 41] },
    { id: 'conversations', label: 'Conversations', value: '1,284',   deltaPct: 15.2,  spark: [80, 95, 88, 112, 104, 128, 119, 134, 122, 148, 141, 156, 143, 162] },
    { id: 'ai_handled',    label: 'AI handled',    value: '68%',     deltaPct:  4.1,  spark: [58, 61, 59, 63, 62, 65, 64, 67, 65, 68, 67, 70, 68, 69] },
    { id: 'response',      label: 'Avg response',  value: '3.2m',    deltaPct: -18.5, spark: [7.1, 6.8, 6.4, 5.9, 5.6, 5.2, 4.9, 4.6, 4.3, 4.1, 3.8, 3.6, 3.4, 3.2] },
    { id: 'csat',          label: 'CSAT',          value: '4.7',     deltaPct:  2.2,  spark: [4.2, 4.3, 4.2, 4.4, 4.3, 4.5, 4.4, 4.5, 4.6, 4.5, 4.6, 4.7, 4.6, 4.7] },
  ],
  '30d': [
    { id: 'revenue',       label: 'Revenue (30d)',  value: 'S$175k',  deltaPct: 18.6,  spark: [4100, 4400, 3900, 5100, 5400, 5800, 5300, 6200, 5900, 6700, 6400, 7100, 6800, 7600, 7200, 7900, 7500, 8200, 7800, 8500, 8100, 8800, 8400, 9100, 8700, 9400, 9000, 9700, 9300, 11520] },
    { id: 'orders',        label: 'Orders (30d)',   value: '1,120',   deltaPct: 14.3,  spark: [22, 26, 21, 30, 32, 35, 30, 38, 35, 41, 38, 44, 42, 47, 44, 49, 46, 52, 48, 54, 51, 57, 53, 59, 55, 61, 57, 63, 59, 65] },
    { id: 'conversations', label: 'Conversations', value: '5,500',   deltaPct: 22.1,  spark: [110, 125, 108, 142, 148, 162, 138, 174, 163, 188, 175, 202, 192, 215, 204, 224, 211, 238, 221, 246, 234, 261, 245, 274, 258, 287, 271, 300, 283, 310] },
    { id: 'ai_handled',    label: 'AI handled',    value: '69%',     deltaPct:  6.8,  spark: [56, 58, 57, 60, 61, 62, 61, 64, 63, 65, 64, 66, 65, 67, 66, 67, 66, 68, 67, 68, 67, 69, 68, 70, 69, 70, 69, 70, 69, 70] },
    { id: 'response',      label: 'Avg response',  value: '3.0m',    deltaPct: -25.4, spark: [8.2, 7.9, 7.5, 7.1, 6.8, 6.5, 6.2, 5.9, 5.6, 5.4, 5.1, 4.9, 4.7, 4.5, 4.3, 4.2, 4.0, 3.9, 3.8, 3.7, 3.6, 3.5, 3.4, 3.3, 3.2, 3.2, 3.1, 3.1, 3.0, 3.0] },
    { id: 'csat',          label: 'CSAT',          value: '4.7',     deltaPct:  3.1,  spark: [4.1, 4.2, 4.1, 4.3, 4.2, 4.3, 4.3, 4.4, 4.4, 4.5, 4.4, 4.5, 4.5, 4.6, 4.5, 4.6, 4.6, 4.6, 4.6, 4.7, 4.6, 4.7, 4.6, 4.7, 4.7, 4.7, 4.7, 4.7, 4.7, 4.7] },
  ],
}

// ─── Revenue series ───────────────────────────────────────────────────────────

const revenueSeriesData: Record<Range, { date: string; revenue: number }[]> = {
  '24h': [
    { date: '2026-05-13 00', revenue: 180 }, { date: '2026-05-13 01', revenue: 90 },
    { date: '2026-05-13 02', revenue: 60 },  { date: '2026-05-13 03', revenue: 110 },
    { date: '2026-05-13 04', revenue: 140 }, { date: '2026-05-13 05', revenue: 210 },
    { date: '2026-05-13 06', revenue: 290 }, { date: '2026-05-13 07', revenue: 380 },
    { date: '2026-05-13 08', revenue: 460 }, { date: '2026-05-13 09', revenue: 520 },
    { date: '2026-05-13 10', revenue: 610 }, { date: '2026-05-13 11', revenue: 680 },
    { date: '2026-05-13 12', revenue: 630 }, { date: '2026-05-13 13', revenue: 590 },
    { date: '2026-05-13 14', revenue: 540 }, { date: '2026-05-13 15', revenue: 490 },
    { date: '2026-05-13 16', revenue: 420 }, { date: '2026-05-13 17', revenue: 380 },
    { date: '2026-05-13 18', revenue: 310 }, { date: '2026-05-13 19', revenue: 260 },
    { date: '2026-05-13 20', revenue: 210 }, { date: '2026-05-13 21', revenue: 170 },
    { date: '2026-05-13 22', revenue: 130 }, { date: '2026-05-13 23', revenue: 90 },
  ],
  '7d': [
    { date: '2026-04-30', revenue: 3200 }, { date: '2026-05-01', revenue: 4100 },
    { date: '2026-05-02', revenue: 3800 }, { date: '2026-05-03', revenue: 5200 },
    { date: '2026-05-04', revenue: 4800 }, { date: '2026-05-05', revenue: 6100 },
    { date: '2026-05-06', revenue: 5900 }, { date: '2026-05-07', revenue: 6400 },
    { date: '2026-05-08', revenue: 5700 }, { date: '2026-05-09', revenue: 7200 },
    { date: '2026-05-10', revenue: 6800 }, { date: '2026-05-11', revenue: 7500 },
    { date: '2026-05-12', revenue: 6900 }, { date: '2026-05-13', revenue: 11520 },
  ],
  '30d': [
    { date: '2026-04-14', revenue: 4100 }, { date: '2026-04-15', revenue: 4400 },
    { date: '2026-04-16', revenue: 3900 }, { date: '2026-04-17', revenue: 5100 },
    { date: '2026-04-18', revenue: 5400 }, { date: '2026-04-19', revenue: 5800 },
    { date: '2026-04-20', revenue: 5300 }, { date: '2026-04-21', revenue: 6200 },
    { date: '2026-04-22', revenue: 5900 }, { date: '2026-04-23', revenue: 6700 },
    { date: '2026-04-24', revenue: 6400 }, { date: '2026-04-25', revenue: 7100 },
    { date: '2026-04-26', revenue: 6800 }, { date: '2026-04-27', revenue: 7600 },
    { date: '2026-04-28', revenue: 7200 }, { date: '2026-04-29', revenue: 7900 },
    { date: '2026-04-30', revenue: 7500 }, { date: '2026-05-01', revenue: 8200 },
    { date: '2026-05-02', revenue: 7800 }, { date: '2026-05-03', revenue: 8500 },
    { date: '2026-05-04', revenue: 8100 }, { date: '2026-05-05', revenue: 8800 },
    { date: '2026-05-06', revenue: 8400 }, { date: '2026-05-07', revenue: 9100 },
    { date: '2026-05-08', revenue: 8700 }, { date: '2026-05-09', revenue: 9400 },
    { date: '2026-05-10', revenue: 9000 }, { date: '2026-05-11', revenue: 9700 },
    { date: '2026-05-12', revenue: 9300 }, { date: '2026-05-13', revenue: 11520 },
  ],
}

// ─── Revenue chart metadata ───────────────────────────────────────────────────

export const revenueMetaData: Record<Range, {
  subtitle: string
  stats: { label: string; value: string; sub?: string }[]
}> = {
  '24h': {
    subtitle: 'Today · SGD',
    stats: [
      { label: 'Avg hourly revenue', value: 'S$243' },
      { label: 'Peak hour', value: 'S$680', sub: '11:00' },
      { label: 'Avg order value', value: 'S$156.78' },
    ],
  },
  '7d': {
    subtitle: 'Last 14 days · SGD',
    stats: [
      { label: 'Avg daily revenue', value: 'S$5,841' },
      { label: 'Best day', value: 'S$11,520', sub: '13 May' },
      { label: 'Avg order value', value: 'S$156.78' },
    ],
  },
  '30d': {
    subtitle: 'Last 30 days · SGD',
    stats: [
      { label: 'Avg daily revenue', value: 'S$5,833' },
      { label: 'Best day', value: 'S$11,520', sub: '13 May' },
      { label: 'Avg order value', value: 'S$156.43' },
    ],
  },
}

// ─── Channel mix ─────────────────────────────────────────────────────────────

const channelSplitData: Record<Range, { channel: 'shopee' | 'lazada' | 'tiktok_shop' | 'telegram' | 'whatsapp'; label: string; revenue: number; color: string }[]> = {
  '24h': [
    { channel: 'shopee',      label: 'Shopee',     revenue: 2760,  color: 'bg-orange-500' },
    { channel: 'lazada',      label: 'Lazada',     revenue: 1595,  color: 'bg-purple-500' },
    { channel: 'tiktok_shop', label: 'TikTok Shop',revenue: 1060,  color: 'bg-pink-500' },
    { channel: 'telegram',    label: 'Telegram',   revenue: 466,   color: 'bg-blue-500' },
    { channel: 'whatsapp',    label: 'WhatsApp',   revenue: 203,   color: 'bg-green-500' },
  ],
  '7d': [
    { channel: 'shopee',      label: 'Shopee',     revenue: 38420, color: 'bg-orange-500' },
    { channel: 'lazada',      label: 'Lazada',     revenue: 22180, color: 'bg-purple-500' },
    { channel: 'tiktok_shop', label: 'TikTok Shop',revenue: 14760, color: 'bg-pink-500' },
    { channel: 'telegram',    label: 'Telegram',   revenue: 6490,  color: 'bg-blue-500' },
    { channel: 'whatsapp',    label: 'WhatsApp',   revenue: 2830,  color: 'bg-green-500' },
  ],
  '30d': [
    { channel: 'shopee',      label: 'Shopee',     revenue: 165000, color: 'bg-orange-500' },
    { channel: 'lazada',      label: 'Lazada',     revenue: 95000,  color: 'bg-purple-500' },
    { channel: 'tiktok_shop', label: 'TikTok Shop',revenue: 63500,  color: 'bg-pink-500' },
    { channel: 'telegram',    label: 'Telegram',   revenue: 27900,  color: 'bg-blue-500' },
    { channel: 'whatsapp',    label: 'WhatsApp',   revenue: 12200,  color: 'bg-green-500' },
  ],
}

// ─── AI breakdown ─────────────────────────────────────────────────────────────

const aiBreakdownData: Record<Range, { autoSent: number; drafted: number; escalated: number; avgConfidence: number }> = {
  '24h': { autoSent: 107, drafted: 46, escalated: 30, avgConfidence: 0.80 },
  '7d':  { autoSent: 748, drafted: 324, escalated: 212, avgConfidence: 0.81 },
  '30d': { autoSent: 3205, drafted: 1390, escalated: 910, avgConfidence: 0.82 },
}

// ─── Top question topics ──────────────────────────────────────────────────────

const topTopicsData: Record<Range, { topic: string; count: number }[]> = {
  '24h': [
    { topic: 'Shipping & delivery status',  count: 59 },
    { topic: 'Return & refund requests',    count: 41 },
    { topic: 'Product compatibility',       count: 29 },
    { topic: 'Bundle / discount pricing',   count: 25 },
    { topic: 'Stock availability',          count: 19 },
    { topic: 'Warranty & after-sales',      count: 10 },
  ],
  '7d': [
    { topic: 'Shipping & delivery status',  count: 412 },
    { topic: 'Return & refund requests',    count: 289 },
    { topic: 'Product compatibility',       count: 201 },
    { topic: 'Bundle / discount pricing',   count: 178 },
    { topic: 'Stock availability',          count: 134 },
    { topic: 'Warranty & after-sales',      count: 70 },
  ],
  '30d': [
    { topic: 'Shipping & delivery status',  count: 1770 },
    { topic: 'Return & refund requests',    count: 1240 },
    { topic: 'Product compatibility',       count: 864 },
    { topic: 'Bundle / discount pricing',   count: 765 },
    { topic: 'Stock availability',          count: 576 },
    { topic: 'Warranty & after-sales',      count: 301 },
  ],
}

// ─── Best sellers ─────────────────────────────────────────────────────────────

const bestSellersData: Record<Range, {
  id: string; name: string; channel: 'shopee' | 'lazada' | 'tiktok_shop'; unitsSold: number; revenue: number; stock: number; trend: number[]
}[]> = {
  '24h': [
    { id: 'prod-1', name: 'Wireless Earbuds Pro',       channel: 'shopee',      unitsSold: 20,  revenue: 1780,  stock: 23, trend: [1,2,1,3,2,4,3,2,3,4,3,5,4,3,4,5,4,5,5,4,4,3,2,1] },
    { id: 'prod-2', name: '20,000mAh Power Bank 65W',   channel: 'shopee',      unitsSold: 14,  revenue: 1246,  stock: 0,  trend: [0,0,0,1,1,2,2,1,2,2,2,3,2,2,1,2,1,2,2,1,1,1,0,0] },
    { id: 'prod-3', name: 'Oversized Hoodie — Cream',   channel: 'lazada',      unitsSold: 12,  revenue: 948,   stock: 11, trend: [0,0,1,0,1,1,2,1,2,1,1,2,1,2,2,1,1,2,1,1,1,1,0,0] },
    { id: 'prod-4', name: 'Nordic Table Lamp',          channel: 'tiktok_shop', unitsSold: 11,  revenue: 979,   stock: 44, trend: [0,0,0,1,1,1,1,1,1,2,1,2,1,1,1,1,1,1,1,1,1,0,0,0] },
    { id: 'prod-5', name: 'Skincare Glow Bundle',       channel: 'shopee',      unitsSold: 9,   revenue: 1152,  stock: 8,  trend: [0,0,1,0,1,1,1,1,1,1,1,2,1,1,1,1,1,1,1,1,0,0,0,0] },
  ],
  '7d': [
    { id: 'prod-1', name: 'Wireless Earbuds Pro',       channel: 'shopee',      unitsSold: 142, revenue: 12638, stock: 23, trend: [8, 11, 9, 14, 12, 18, 16] },
    { id: 'prod-2', name: '20,000mAh Power Bank 65W',   channel: 'shopee',      unitsSold: 98,  revenue: 8722,  stock: 0,  trend: [6, 8, 7, 10, 11, 14, 15] },
    { id: 'prod-3', name: 'Oversized Hoodie — Cream',   channel: 'lazada',      unitsSold: 87,  revenue: 6873,  stock: 11, trend: [5, 7, 8, 10, 9, 12, 13] },
    { id: 'prod-4', name: 'Nordic Table Lamp',          channel: 'tiktok_shop', unitsSold: 74,  revenue: 6586,  stock: 44, trend: [3, 5, 6, 9, 8, 11, 10] },
    { id: 'prod-5', name: 'Skincare Glow Bundle',       channel: 'shopee',      unitsSold: 61,  revenue: 7808,  stock: 8,  trend: [4, 4, 5, 7, 8, 9, 11] },
  ],
  '30d': [
    { id: 'prod-1', name: 'Wireless Earbuds Pro',       channel: 'shopee',      unitsSold: 612, revenue: 54468, stock: 23, trend: [28, 35, 40, 48, 52, 58, 66] },
    { id: 'prod-2', name: '20,000mAh Power Bank 65W',   channel: 'shopee',      unitsSold: 422, revenue: 37558, stock: 0,  trend: [22, 28, 33, 41, 47, 55, 61] },
    { id: 'prod-3', name: 'Oversized Hoodie — Cream',   channel: 'lazada',      unitsSold: 374, revenue: 29546, stock: 11, trend: [18, 24, 30, 38, 44, 51, 58] },
    { id: 'prod-4', name: 'Nordic Table Lamp',          channel: 'tiktok_shop', unitsSold: 318, revenue: 28302, stock: 44, trend: [14, 19, 25, 32, 38, 46, 53] },
    { id: 'prod-5', name: 'Skincare Glow Bundle',       channel: 'shopee',      unitsSold: 262, revenue: 33536, stock: 8,  trend: [12, 16, 21, 28, 35, 43, 51] },
  ],
}

// ─── Inventory alerts (point-in-time — same for all ranges) ──────────────────

export const inventoryAlerts = [
  { id: 'inv-1', product: '20,000mAh Power Bank 65W',    channel: 'shopee'      as const, store: 'TechGadgets SG', status: 'out' as const, stock: 0,  daysOfCover: 0 },
  { id: 'inv-2', product: 'Skincare Glow Bundle',         channel: 'shopee'      as const, store: 'TechGadgets SG', status: 'low' as const, stock: 8,  daysOfCover: 3 },
  { id: 'inv-3', product: 'Oversized Hoodie — Cream (M)', channel: 'lazada'      as const, store: 'StyleHub MY',    status: 'low' as const, stock: 11, daysOfCover: 4 },
  { id: 'inv-4', product: 'USB-C Hub 7-in-1',             channel: 'tiktok_shop' as const, store: 'HomeLiving Co',  status: 'low' as const, stock: 6,  daysOfCover: 2 },
]

// ─── Store leaderboard ────────────────────────────────────────────────────────

const storeLeaderboardData: Record<Range, {
  id: string; name: string; channel: 'shopee' | 'lazada' | 'tiktok_shop' | 'telegram';
  revenue: number; orders: number; conversations: number; aiHandledPct: number; avgFirstResponseMin: number
}[]> = {
  '24h': [
    { id: 'sl-1', name: 'TechGadgets SG', channel: 'shopee',      revenue: 2760,  orders: 16, conversations: 75, aiHandledPct: 0.71, avgFirstResponseMin: 2.9 },
    { id: 'sl-2', name: 'StyleHub MY',    channel: 'lazada',      revenue: 1595,  orders: 11, conversations: 45, aiHandledPct: 0.64, avgFirstResponseMin: 3.5 },
    { id: 'sl-3', name: 'HomeLiving Co',  channel: 'tiktok_shop', revenue: 1060,  orders: 8,  conversations: 42, aiHandledPct: 0.69, avgFirstResponseMin: 3.2 },
    { id: 'sl-4', name: 'Support Bot',    channel: 'telegram',    revenue: 466,   orders: 2,  conversations: 21, aiHandledPct: 0.57, avgFirstResponseMin: 4.8 },
  ],
  '7d': [
    { id: 'sl-1', name: 'TechGadgets SG', channel: 'shopee',      revenue: 38420, orders: 112, conversations: 524, aiHandledPct: 0.72, avgFirstResponseMin: 2.8 },
    { id: 'sl-2', name: 'StyleHub MY',    channel: 'lazada',      revenue: 22180, orders: 78,  conversations: 318, aiHandledPct: 0.65, avgFirstResponseMin: 3.4 },
    { id: 'sl-3', name: 'HomeLiving Co',  channel: 'tiktok_shop', revenue: 14760, orders: 54,  conversations: 291, aiHandledPct: 0.70, avgFirstResponseMin: 3.1 },
    { id: 'sl-4', name: 'Support Bot',    channel: 'telegram',    revenue: 6490,  orders: 17,  conversations: 151, aiHandledPct: 0.58, avgFirstResponseMin: 4.6 },
  ],
  '30d': [
    { id: 'sl-1', name: 'TechGadgets SG', channel: 'shopee',      revenue: 165000, orders: 482, conversations: 2250, aiHandledPct: 0.74, avgFirstResponseMin: 2.7 },
    { id: 'sl-2', name: 'StyleHub MY',    channel: 'lazada',      revenue: 95000,  orders: 335, conversations: 1365, aiHandledPct: 0.67, avgFirstResponseMin: 3.2 },
    { id: 'sl-3', name: 'HomeLiving Co',  channel: 'tiktok_shop', revenue: 63500,  orders: 232, conversations: 1249, aiHandledPct: 0.72, avgFirstResponseMin: 2.9 },
    { id: 'sl-4', name: 'Support Bot',    channel: 'telegram',    revenue: 27900,  orders: 71,  conversations: 648,  aiHandledPct: 0.60, avgFirstResponseMin: 4.3 },
  ],
}

// ─── Agent rows ───────────────────────────────────────────────────────────────

const agentRowsData: Record<Range, { id: string; initials: string; name: string; conversationsHandled: number; aiAssistPct: number; avgResponseMin: number; csat: number }[]> = {
  '24h': [
    { id: 'ag-1', initials: 'ML', name: 'Melvin', conversationsHandled: 21, aiAssistPct: 0.73, avgResponseMin: 3.0, csat: 4.8 },
    { id: 'ag-2', initials: 'RY', name: 'Ryan',   conversationsHandled: 17, aiAssistPct: 0.67, avgResponseMin: 3.5, csat: 4.7 },
    { id: 'ag-3', initials: 'MT', name: 'Martin', conversationsHandled: 14, aiAssistPct: 0.60, avgResponseMin: 3.9, csat: 4.6 },
  ],
  '7d': [
    { id: 'ag-1', initials: 'ML', name: 'Melvin', conversationsHandled: 148, aiAssistPct: 0.74, avgResponseMin: 2.9, csat: 4.8 },
    { id: 'ag-2', initials: 'RY', name: 'Ryan',   conversationsHandled: 122, aiAssistPct: 0.68, avgResponseMin: 3.4, csat: 4.7 },
    { id: 'ag-3', initials: 'MT', name: 'Martin', conversationsHandled: 97,  aiAssistPct: 0.61, avgResponseMin: 3.8, csat: 4.6 },
  ],
  '30d': [
    { id: 'ag-1', initials: 'ML', name: 'Melvin', conversationsHandled: 635, aiAssistPct: 0.76, avgResponseMin: 2.7, csat: 4.8 },
    { id: 'ag-2', initials: 'RY', name: 'Ryan',   conversationsHandled: 524, aiAssistPct: 0.70, avgResponseMin: 3.2, csat: 4.7 },
    { id: 'ag-3', initials: 'MT', name: 'Martin', conversationsHandled: 416, aiAssistPct: 0.63, avgResponseMin: 3.6, csat: 4.6 },
  ],
}

// ─── Customer signals ─────────────────────────────────────────────────────────

const customerSignalsData: Record<Range, {
  newCustomers: number; returningCustomers: number;
  sentiment: { positive: number; neutral: number; negative: number };
  sentimentTrend: number[]
}> = {
  '24h': {
    newCustomers: 44, returningCustomers: 70,
    sentiment: { positive: 0.61, neutral: 0.29, negative: 0.10 },
    sentimentTrend: [0.58, 0.60, 0.59, 0.61, 0.60, 0.62, 0.61, 0.60, 0.62, 0.61, 0.62, 0.60, 0.61, 0.62, 0.61, 0.62, 0.60, 0.61, 0.62, 0.61, 0.62, 0.61, 0.61, 0.61],
  },
  '7d': {
    newCustomers: 312, returningCustomers: 488,
    sentiment: { positive: 0.62, neutral: 0.28, negative: 0.10 },
    sentimentTrend: [0.54, 0.56, 0.55, 0.57, 0.58, 0.60, 0.59, 0.61, 0.60, 0.62, 0.61, 0.63, 0.62, 0.62],
  },
  '30d': {
    newCustomers: 1340, returningCustomers: 2095,
    sentiment: { positive: 0.63, neutral: 0.27, negative: 0.10 },
    sentimentTrend: [0.50, 0.52, 0.51, 0.53, 0.54, 0.55, 0.54, 0.56, 0.55, 0.57, 0.56, 0.58, 0.57, 0.59, 0.58, 0.60, 0.59, 0.61, 0.60, 0.62, 0.61, 0.62, 0.62, 0.63, 0.62, 0.63, 0.63, 0.63, 0.63, 0.63],
  },
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function getDashboardData(range: Range) {
  return {
    kpis:             kpisData[range],
    revenueSeries:    revenueSeriesData[range],
    revenueMeta:      revenueMetaData[range],
    channelSplit:     channelSplitData[range],
    aiBreakdown:      aiBreakdownData[range],
    topTopics:        topTopicsData[range],
    bestSellers:      bestSellersData[range],
    inventoryAlerts,
    storeLeaderboard: storeLeaderboardData[range],
    agentRows:        agentRowsData[range],
    customerSignals:  customerSignalsData[range],
  }
}
