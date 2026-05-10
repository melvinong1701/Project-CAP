'use client'
import { useState } from 'react'
import { Conversation } from '@/lib/types'
import { ConversationRow } from './ConversationRow'
import { Search } from 'lucide-react'

interface ConversationListProps {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
}

const filters = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'ai-draft', label: 'AI drafted' },
  { id: 'needs-review', label: 'Needs review' },
]

export function ConversationList({ conversations, activeId, onSelect }: ConversationListProps) {
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')

  const filtered = conversations.filter(c => {
    const matchesSearch =
      !search ||
      c.sender.name.toLowerCase().includes(search.toLowerCase()) ||
      c.lastMessage.toLowerCase().includes(search.toLowerCase())

    const matchesFilter =
      activeFilter === 'all' ||
      (activeFilter === 'unread' && !c.isRead) ||
      (activeFilter === 'ai-draft' && c.aiSuggestion && !c.aiSuggestion.autoSent) ||
      (activeFilter === 'needs-review' && c.tags?.includes('escalated'))

    return matchesSearch && matchesFilter
  })

  return (
    <div className="w-[340px] flex-shrink-0 flex flex-col border-r border-gray-100 bg-white min-h-0">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Inbox</h2>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all placeholder:text-gray-400"
          />
        </div>

        {/* Filter chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
          {filters.map(f => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                activeFilter === f.id
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">
            No conversations found
          </div>
        ) : (
          filtered.map(conv => (
            <ConversationRow
              key={conv.id}
              conversation={conv}
              isActive={conv.id === activeId}
              onClick={() => onSelect(conv.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
