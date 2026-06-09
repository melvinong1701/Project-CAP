import { Channel } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ChannelBadgeConfig {
  label: string
  color: string
  bg: string
  icon: string
}

const channelConfig: Record<Channel, ChannelBadgeConfig> = {
  telegram: { label: 'Telegram', color: 'text-blue-600', bg: 'bg-blue-50', icon: '✈' },
  shopify: { label: 'Shopify', color: 'text-emerald-700', bg: 'bg-emerald-50', icon: 'S' },
  shopee: { label: 'Shopee', color: 'text-orange-600', bg: 'bg-orange-50', icon: '🛍' },
  lazada: { label: 'Lazada', color: 'text-purple-600', bg: 'bg-purple-50', icon: '🏪' },
  tiktok_shop: { label: 'TikTok', color: 'text-pink-600', bg: 'bg-pink-50', icon: '♪' },
  tokopedia: { label: 'Tokopedia', color: 'text-green-700', bg: 'bg-green-50', icon: 'T' },
  whatsapp: { label: 'WhatsApp', color: 'text-green-600', bg: 'bg-green-50', icon: 'W' },
  line: { label: 'Line', color: 'text-lime-700', bg: 'bg-lime-50', icon: 'L' },
  facebook_messenger: { label: 'Messenger', color: 'text-blue-700', bg: 'bg-blue-50', icon: 'M' },
  instagram: { label: 'Instagram', color: 'text-pink-700', bg: 'bg-pink-50', icon: '◈' },
}

interface ChannelBadgeProps {
  channel: Channel | string
  showLabel?: boolean
  size?: 'sm' | 'md'
  className?: string
}

function getFallbackConfig(channel: string): ChannelBadgeConfig {
  const label = channel
    ? channel.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
    : 'Unknown'

  return {
    label,
    color: 'text-gray-600',
    bg: 'bg-gray-100',
    icon: label.charAt(0).toUpperCase() || '?',
  }
}

export function ChannelBadge({ channel, showLabel = false, size = 'sm', className }: ChannelBadgeProps) {
  const config = channelConfig[channel as Channel] ?? getFallbackConfig(channel)
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
      {!showLabel && <span>{config.icon}</span>}
      {showLabel && <span>{config.label}</span>}
    </span>
  )
}
