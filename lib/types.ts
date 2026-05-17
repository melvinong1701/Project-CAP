export type Channel =
  | 'telegram'
  | 'shopee'
  | 'lazada'
  | 'tiktok_shop'
  | 'whatsapp'
  | 'facebook_messenger'
  | 'instagram'

export type AiConfidence = 'high' | 'medium' | 'low'

export type AiSuggestion =
  | {
      text: string
      confidence: AiConfidence
      autoSent: boolean
      dismissed: boolean
    }
  | {
      error: string
      dismissed: false
    }

// AI error codes: pipeline_error, timeout, no_messages.
export function isAiError(s: AiSuggestion): s is { error: string; dismissed: false } {
  return 'error' in s
}

export interface Message {
  id: string
  conversationId: string
  sender: 'agent' | 'ai' | 'customer'
  content: string
  timestamp: Date
  aiSuggestion?: AiSuggestion
}

export interface Order {
  id: string
  status: 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled'
  items: string
  total: string
  trackingNumber?: string
}

export interface Conversation {
  id: string
  organizationId: string
  channel: Channel
  externalId: string
  sender: {
    name: string
    avatarUrl?: string
  }
  storeName: string
  storeId: string
  lastMessage: string
  lastMessageAt: Date
  isRead: boolean
  messages: Message[]
  aiSuggestion?: AiSuggestion
  order?: Order
  tags?: string[]
  assignedTo?: string
}

export interface Store {
  id: string
  name: string
  channel: Channel
  unreadCount: number
}
