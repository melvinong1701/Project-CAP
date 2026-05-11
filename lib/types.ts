export type Channel = 'telegram' | 'shopee' | 'lazada' | 'tiktok_shop' | 'whatsapp' | 'facebook_messenger' | 'instagram'

export type AiConfidence = 'high' | 'medium' | 'low'

export interface AiSuggestion {
  text: string
  confidence: AiConfidence
  autoSent: boolean
}

export interface Message {
  id: string
  conversationId: string
  sender: 'buyer' | 'agent' | 'ai'
  content: string
  timestamp: Date
  aiSuggestion?: AiSuggestion
}

export interface Conversation {
  id: string
  organizationId: string
  channel: Channel
  storeId: string
  storeName: string
  externalId: string
  sender: {
    name: string
    avatarUrl?: string
  }
  lastMessage: string
  lastMessageAt: Date
  isRead: boolean
  messages: Message[]
  aiSuggestion?: AiSuggestion
  tags?: string[]
  assignedTo?: string
  order?: {
    id: string
    status: string
    items: string
    total: string
    trackingNumber?: string
  }
}

export interface Store {
  id: string
  name: string
  channel: Channel
  unreadCount: number
}
