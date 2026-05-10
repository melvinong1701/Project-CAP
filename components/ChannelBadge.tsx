import { Channel } from '@/lib/types'
import { cn } from '@/lib/utils'

const channelConfig: Record<Channel, { label: string; color: string; bg: string; icon: string }> = {
  telegram: { label: 'Telegram', color: 'text-blue-600', bg: 'bg-blue-50', icon: '✈' },
  shopee: { label: 'Shopee', color: 'text-orange-600', bg: 'bg-orange-50', icon: '🛍' },
  lazada: { label: 'Lazada', color: 'text-purple-600', bg: 'bg-purple-50', icon: '🏪' },
  tiktok_shop: { label: 'TikTok', color: 'text-pink-600', bg: 'bg-pink-50', icon: '♪' },
  whatsapp: { label: 'WhatsApp', color: 'text-green-600', bg: 'bg-green-50', icon: '💬' },
}

interface ChannelBadgeProps {
  channel: Channel
  showLabel?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export function ChannelBadge({ channel, showLabel = false, size = 'sm', className }: ChannelBadgeProps) {
  const config = channelConfig[channel]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium',
        config.bg,
        config.color,
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        className
      )}
    >
      <span>{config.icon}</span>
      {showLabel && <span>{config.label}</span>}
    </span>
  )
}
