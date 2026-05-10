'use client'
import { useState } from 'react'
import { Conversation, Message } from '@/lib/types'
import { MessageThread } from './MessageThread'
import { AiSuggestionPanel } from './AiSuggestionPanel'
import { ReplyBox } from './ReplyBox'
import { CustomerPanel } from './CustomerPanel'
import { ChannelBadge } from './ChannelBadge'
import { ChevronRight, SidebarClose } from 'lucide-react'

interface ConversationDetailProps {
  conversation: Conversation
  onMarkRead: (id: string) => void
  onSendMessage: (convId: string, message: Message) => void
  onDismissAi: (convId: string) => void
}

export function ConversationDetail({
  conversation,
  onMarkRead,
  onSendMessage,
  onDismissAi,
}: ConversationDetailProps) {
  const [replyValue, setReplyValue] = useState('')
  const [showCustomerPanel, setShowCustomerPanel] = useState(true)

  const handleSend = (text: string) => {
    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      conversationId: conversation.id,
      sender: 'agent',
      content: text,
      timestamp: new Date(),
    }
    onSendMessage(conversation.id, newMessage)
    onMarkRead(conversation.id)
    setReplyValue('')
  }

  const handleSendAi = () => {
    if (!conversation.aiSuggestion) return
    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      conversationId: conversation.id,
      sender: 'ai',
      content: conversation.aiSuggestion.text,
      timestamp: new Date(),
      aiSuggestion: { ...conversation.aiSuggestion, autoSent: true },
    }
    onSendMessage(conversation.id, newMessage)
    onMarkRead(conversation.id)
    onDismissAi(conversation.id)
  }

  const handleEditAi = (text: string) => {
    setReplyValue(text)
    onDismissAi(conversation.id)
  }

  return (
    <div className="flex flex-1 min-w-0 min-h-0">
      {/* Main detail */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center text-indigo-700 font-semibold text-sm flex-shrink-0">
              {conversation.sender.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900">{conversation.sender.name}</h3>
                <ChannelBadge channel={conversation.channel} showLabel />
              </div>
              <p className="text-xs text-gray-400 truncate">{conversation.storeName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {conversation.assignedTo && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1.5 rounded-lg">
                <div className="w-4 h-4 rounded-full bg-indigo-200 flex items-center justify-center text-indigo-700 text-[10px] font-bold">
                  {conversation.assignedTo.charAt(0)}
                </div>
                {conversation.assignedTo}
                <ChevronRight className="w-3 h-3 text-gray-400" />
              </div>
            )}
            <button
              onClick={() => setShowCustomerPanel(p => !p)}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
              title="Toggle customer panel"
            >
              <SidebarClose className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-white">
          <MessageThread messages={conversation.messages} />
        </div>

        {/* AI suggestion + Reply */}
        <div className="flex-shrink-0 bg-white">
          {conversation.aiSuggestion && !conversation.aiSuggestion.autoSent && (
            <div className="px-4 pt-3">
              <AiSuggestionPanel
                suggestion={conversation.aiSuggestion.text}
                confidence={conversation.aiSuggestion.confidence}
                onSend={handleSendAi}
                onEdit={handleEditAi}
                onDismiss={() => onDismissAi(conversation.id)}
              />
            </div>
          )}
          <ReplyBox onSend={handleSend} initialValue={replyValue} />
        </div>
      </div>

      {/* Customer panel */}
      {showCustomerPanel && (
        <div className="w-60 flex-shrink-0 border-l border-gray-100 bg-white overflow-y-auto">
          <CustomerPanel conversation={conversation} />
        </div>
      )}
    </div>
  )
}
