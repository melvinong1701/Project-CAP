'use client'
import { useState } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { ConversationList } from '@/components/ConversationList'
import { ConversationDetail } from '@/components/ConversationDetail'
import { mockConversations, mockStores } from '@/lib/mockData'
import { Conversation, Message } from '@/lib/types'

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>(mockConversations)
  const [activeConvId, setActiveConvId] = useState<string | null>(mockConversations[0].id)
  const [activeFilter, setActiveFilter] = useState('all')

  const activeConv = conversations.find(c => c.id === activeConvId) ?? null

  const filteredConversations = conversations.filter(c => {
    if (activeFilter === 'unread') return !c.isRead
    if (activeFilter === 'assigned') return c.assignedTo === 'You'
    if (activeFilter === 'snoozed') return false
    if (activeFilter.startsWith('store:')) return c.storeId === activeFilter.replace('store:', '')
    return true
  })

  const handleSelect = (id: string) => {
    setActiveConvId(id)
    setConversations(prev =>
      prev.map(c => (c.id === id ? { ...c, isRead: true } : c))
    )
  }

  const handleMarkRead = (id: string) => {
    setConversations(prev =>
      prev.map(c => (c.id === id ? { ...c, isRead: true } : c))
    )
  }

  const handleSendMessage = (convId: string, message: Message) => {
    setConversations(prev =>
      prev.map(c => {
        if (c.id !== convId) return c
        return {
          ...c,
          messages: [...c.messages, message],
          lastMessage: message.content,
          lastMessageAt: message.timestamp,
          isRead: true,
        }
      })
    )
  }

  const handleDismissAi = (convId: string) => {
    setConversations(prev =>
      prev.map(c => (c.id === convId ? { ...c, aiSuggestion: undefined } : c))
    )
  }

  const storesWithCounts = mockStores.map(store => ({
    ...store,
    unreadCount: conversations.filter(c => c.storeId === store.id && !c.isRead).length,
  }))

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar
        stores={storesWithCounts}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />
      <ConversationList
        conversations={filteredConversations}
        activeId={activeConvId}
        onSelect={handleSelect}
      />
      {activeConv ? (
        <ConversationDetail
          key={activeConv.id}
          conversation={activeConv}
          onMarkRead={handleMarkRead}
          onSendMessage={handleSendMessage}
          onDismissAi={handleDismissAi}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Select a conversation
        </div>
      )}
    </div>
  )
}
