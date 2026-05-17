'use client'
import { Message, isAiError } from '@/lib/types'
import { cn, formatRelativeTime } from '@/lib/utils'
import { Sparkles } from 'lucide-react'

interface MessageThreadProps {
  messages: Message[]
}

export function MessageThread({ messages }: MessageThreadProps) {
  return (
    <div className="flex flex-col gap-4 py-4 px-4">
      {messages.map((message, index) => {
        const isOutgoing = message.sender === 'agent' || message.sender === 'ai'
        const showTimestamp =
          index === 0 ||
          message.timestamp.getTime() - messages[index - 1].timestamp.getTime() > 30 * 60 * 1000

        return (
          <div key={message.id}>
            {showTimestamp && (
              <div className="flex items-center justify-center my-2">
                <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
                  {formatRelativeTime(message.timestamp)}
                </span>
              </div>
            )}
            <div className={cn('flex', isOutgoing ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[72%] flex flex-col gap-1', isOutgoing && 'items-end')}>
                <div
                  className={cn(
                    'px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
                    isOutgoing
                      ? 'bg-indigo-600 text-white rounded-tr-sm'
                      : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                  )}
                >
                  {message.content}
                </div>
                {message.sender === 'ai' && message.aiSuggestion && !isAiError(message.aiSuggestion) && message.aiSuggestion.autoSent && (
                  <div className="flex items-center gap-1 text-xs text-violet-500">
                    <Sparkles className="w-3 h-3" />
                    <span>AI · auto-sent</span>
                  </div>
                )}
                {message.sender === 'agent' && (
                  <span className="text-xs text-gray-400">You</span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
