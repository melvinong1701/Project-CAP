'use client'
import { Conversation, isAiError } from '@/lib/types'
import { cn, formatRelativeTime } from '@/lib/utils'
import { ChannelBadge } from './ChannelBadge'
import { Sparkles } from 'lucide-react'

interface ConversationRowProps {
  conversation: Conversation
  isActive: boolean
  onClick: () => void
}

export function ConversationRow({ conversation, isActive, onClick }: ConversationRowProps) {
  const hasPendingAi = conversation.aiSuggestion && !isAiError(conversation.aiSuggestion) && !conversation.aiSuggestion.autoSent

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3.5 border-b border-gray-100 hover:bg-gray-50 transition-colors',
        isActive && 'bg-gray-50 border-l-2 border-l-indigo-500',
        !conversation.isRead && !isActive && 'bg-white'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center text-indigo-700 font-semibold text-sm flex-shrink-0 mt-0.5">
          {conversation.sender.name.charAt(0)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={cn(
                'text-sm truncate',
                conversation.isRead ? 'text-gray-700 font-normal' : 'text-gray-900 font-semibold'
              )}>
                {conversation.sender.name}
              </span>
              <ChannelBadge channel={conversation.channel} />
            </div>
            <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
              {formatRelativeTime(conversation.lastMessageAt)}
            </span>
          </div>

          <p className="text-xs text-gray-500 truncate mb-1">
            {conversation.storeName}
          </p>

          <p className={cn(
            'text-sm truncate',
            conversation.isRead ? 'text-gray-400' : 'text-gray-600'
          )}>
            {conversation.lastMessage}
          </p>

          {/* Badges */}
          <div className="flex items-center gap-1.5 mt-1.5">
            {!conversation.isRead && (
              <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
            )}
            {hasPendingAi && (
              <span className="inline-flex items-center gap-1 text-xs text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full font-medium">
                <Sparkles className="w-3 h-3" />
                AI draft
              </span>
            )}
            {conversation.tags?.includes('escalated') && (
              <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full font-medium">
                Escalated
              </span>
            )}
            {conversation.tags?.includes('urgent') && (
              <span className="text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full font-medium">
                Urgent
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
