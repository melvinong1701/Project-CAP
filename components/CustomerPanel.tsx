import { Conversation } from '@/lib/types'
import { ChannelBadge } from './ChannelBadge'
import { Package, Tag, User } from 'lucide-react'

interface CustomerPanelProps {
  conversation: Conversation
}

export function CustomerPanel({ conversation }: CustomerPanelProps) {
  return (
    <div className="flex flex-col gap-5 p-5">
      {/* Buyer */}
      <div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          <User className="w-3.5 h-3.5" />
          Buyer
        </div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center text-indigo-700 font-semibold">
            {conversation.sender.name.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">{conversation.sender.name}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <ChannelBadge channel={conversation.channel} showLabel />
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400">Store: {conversation.storeName}</p>
      </div>

      {/* Order */}
      {conversation.order && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            <Package className="w-3.5 h-3.5" />
            Order
          </div>
          <div className="bg-gray-50 rounded-xl p-3.5 space-y-2">
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">Order ID</span>
              <span className="text-xs font-semibold text-gray-800">#{conversation.order.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">Status</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                conversation.order.status === 'Shipped' ? 'text-blue-700 bg-blue-50' :
                conversation.order.status === 'Delivered' ? 'text-emerald-700 bg-emerald-50' :
                'text-amber-700 bg-amber-50'
              }`}>
                {conversation.order.status}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">Items</span>
              <span className="text-xs font-medium text-gray-700 text-right max-w-[130px]">{conversation.order.items}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">Total</span>
              <span className="text-xs font-semibold text-gray-800">{conversation.order.total}</span>
            </div>
            {conversation.order.trackingNumber && (
              <div className="flex justify-between">
                <span className="text-xs text-gray-500">Tracking</span>
                <span className="text-xs font-mono text-indigo-600">{conversation.order.trackingNumber}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tags */}
      {conversation.tags && conversation.tags.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            <Tag className="w-3.5 h-3.5" />
            Tags
          </div>
          <div className="flex flex-wrap gap-1.5">
            {conversation.tags.map(tag => (
              <span key={tag} className="text-xs text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
