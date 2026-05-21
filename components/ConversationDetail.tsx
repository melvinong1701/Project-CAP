'use client'
import { useEffect, useRef, useState } from 'react'
import { Conversation, ConversationStatus, CustomerContact, Message, isAiError } from '@/lib/types'
import { MessageThread } from './MessageThread'
import { AiSuggestionPanel } from './AiSuggestionPanel'
import { ReplyBox } from './ReplyBox'
import { CustomerPanel } from './CustomerPanel'
import { ShopifyOrderPanel } from './ShopifyOrderPanel'
import { ChannelBadge } from './ChannelBadge'
import { AlertCircle, CheckCircle2, ChevronRight, Clock3, RotateCcw, SidebarClose, Sparkles } from 'lucide-react'

interface ConversationDetailProps {
  conversation: Conversation
  onMarkRead: (id: string) => void
  onSendMessage: (convId: string, message: Message) => void
  onDismissAi: (convId: string) => void
  onShowAi: (convId: string) => void
  onClearAi: (convId: string) => void
  onRetryAi: (convId: string) => void
  onStatusChange: (convId: string, status: ConversationStatus) => void
  onUpdateCustomer: (convId: string, customer: CustomerContact) => void
}

export function ConversationDetail({
  conversation,
  onMarkRead,
  onSendMessage,
  onDismissAi,
  onShowAi,
  onClearAi,
  onRetryAi,
  onStatusChange,
  onUpdateCustomer,
}: ConversationDetailProps) {
  const [replyValue, setReplyValue] = useState('')
  const [showCustomerPanel, setShowCustomerPanel] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const prevSuggestionKeyRef = useRef<string | null>(null)

  // Scroll to bottom when conversation changes or new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [conversation.id, conversation.messages])

  // Scroll to bottom when a NEW AI suggestion first appears — but only if the user
  // is already near the bottom (i.e. hasn't manually scrolled up to read old messages)
  useEffect(() => {
    const suggestionKey = conversation.aiSuggestion && !isAiError(conversation.aiSuggestion)
      ? conversation.aiSuggestion.text
      : null
    const isNewSuggestion = suggestionKey !== null && suggestionKey !== prevSuggestionKeyRef.current
    prevSuggestionKeyRef.current = suggestionKey

    if (!isNewSuggestion) return

    const el = scrollContainerRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (isNearBottom) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
    }
  }, [conversation.aiSuggestion])

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
    if (!conversation.aiSuggestion || isAiError(conversation.aiSuggestion)) return
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
    onClearAi(conversation.id)
  }

  const handleEditAi = (text: string) => {
    setReplyValue(text)
    onDismissAi(conversation.id)
  }

  const statusActions = conversation.status === 'open'
    ? [
        { label: 'Mark Pending', status: 'pending' as const, icon: Clock3 },
        { label: 'Resolve', status: 'closed' as const, icon: CheckCircle2 },
      ]
    : conversation.status === 'pending'
      ? [
          { label: 'Reopen', status: 'open' as const, icon: RotateCcw },
          { label: 'Resolve', status: 'closed' as const, icon: CheckCircle2 },
        ]
      : [
          { label: 'Reopen', status: 'open' as const, icon: RotateCcw },
        ]
  const isClosed = conversation.status === 'closed'
  const isShopifyOrder = conversation.channel === 'shopify'

  return (
    <div className="flex flex-1 min-w-0 min-h-0">
      {/* Main detail */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center text-indigo-700 font-semibold text-sm flex-shrink-0">
              {(conversation.customer?.displayName ?? conversation.sender.name).charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900">{conversation.customer?.displayName ?? conversation.sender.name}</h3>
                <ChannelBadge channel={conversation.channel} showLabel />
              </div>
              <p className="text-xs text-gray-400 truncate">{conversation.storeName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {statusActions.map(action => {
              const Icon = action.icon
              return (
                <button
                  key={action.status}
                  onClick={() => onStatusChange(conversation.id, action.status)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {action.label}
                </button>
              )
            })}
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
        <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto bg-white">
          <MessageThread messages={conversation.messages} />
          <div ref={messagesEndRef} />
        </div>

        {/* AI suggestion + Reply */}
        <div className="flex-shrink-0 bg-white">
          {isShopifyOrder ? (
            <div className="border-t border-gray-100 px-4 py-4 flex items-center gap-2 text-xs text-gray-400">
              <span>Shopify orders are view-only.</span>
              <span className="text-gray-300">·</span>
              <span>Contact this customer via another channel.</span>
            </div>
          ) : isClosed ? (
            <div className="border-t border-gray-100 px-4 py-4">
              <button
                onClick={() => onStatusChange(conversation.id, 'open')}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-white hover:text-gray-900"
              >
                <RotateCcw className="h-4 w-4" />
                Reopen to reply
              </button>
            </div>
          ) : (
            <>
              {conversation.aiSuggestion && (
                isAiError(conversation.aiSuggestion) ? (
                  <div className="px-4 pt-2 pb-1 flex items-center gap-2">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-amber-400" />
                      AI couldn&apos;t generate a suggestion
                    </span>
                    <button
                      onClick={() => onRetryAi(conversation.id)}
                      className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                ) : conversation.aiSuggestion.autoSent ? null : conversation.aiSuggestion.dismissed ? (
                  <div className="px-4 pt-2 pb-1">
                    <button
                      onClick={() => onShowAi(conversation.id)}
                      className="text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1 transition-colors"
                    >
                      <Sparkles className="w-3 h-3" />
                      Show AI draft
                    </button>
                  </div>
                ) : (
                  <div className="px-4 pt-3">
                    <AiSuggestionPanel
                      suggestion={conversation.aiSuggestion.text}
                      confidence={conversation.aiSuggestion.confidence}
                      reasoning={conversation.aiSuggestion.reasoning}
                      sourceCited={conversation.aiSuggestion.sourceCited}
                      onSend={handleSendAi}
                      onEdit={handleEditAi}
                      onDismiss={() => onDismissAi(conversation.id)}
                    />
                  </div>
                )
              )}
              <ReplyBox onSend={handleSend} initialValue={replyValue} />
            </>
          )}
        </div>
      </div>

      {/* Customer panel */}
      {showCustomerPanel && (
        <div className="w-60 flex-shrink-0 border-l border-gray-100 bg-white overflow-y-auto">
          {isShopifyOrder ? (
            <ShopifyOrderPanel conversationId={conversation.id} />
          ) : (
            <CustomerPanel conversation={conversation} onUpdateCustomer={onUpdateCustomer} />
          )}
        </div>
      )}
    </div>
  )
}
