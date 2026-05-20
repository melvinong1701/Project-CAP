'use client'

import { useEffect, useState } from 'react'
import { Loader2, MapPin, Package, User } from 'lucide-react'

interface ShopifyMoney {
  amount: string
  currencyCode: string
}

interface ShopifyLineItem {
  title: string
  quantity: number
  originalUnitPriceSet: { shopMoney: ShopifyMoney }
  variant: { image: { url: string } | null } | null
}

interface ShopifyOrder {
  name: string
  displayFinancialStatus: string
  displayFulfillmentStatus: string
  createdAt: string
  totalPriceSet: { shopMoney: ShopifyMoney }
  customer: { firstName?: string; lastName?: string; email?: string; phone?: string } | null
  shippingAddress: { address1?: string; city?: string; country?: string } | null
  lineItems: { edges: { node: ShopifyLineItem }[] }
}

interface ShopifyOrderPanelProps {
  conversationId: string
}

export function ShopifyOrderPanel({ conversationId }: ShopifyOrderPanelProps) {
  const [order, setOrder] = useState<ShopifyOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    fetch(`/api/shopify/order?conversationId=${encodeURIComponent(conversationId)}`)
      .then(res => res.json())
      .then((data: { order?: ShopifyOrder; error?: string }) => {
        if (data.order) {
          setOrder(data.order)
        } else {
          setError(data.error ?? 'Failed to load order')
        }
      })
      .catch(() => setError('Failed to load order'))
      .finally(() => setLoading(false))
  }, [conversationId])

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="px-4 py-4 text-xs text-gray-400">{error ?? 'Order not found'}</div>
    )
  }

  const money = order.totalPriceSet.shopMoney
  const items = order.lineItems.edges.map(edge => edge.node)

  return (
    <div className="divide-y divide-gray-100 text-xs text-gray-700">
      <div className="px-4 py-3">
        <div className="mb-2 flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5 text-gray-400" />
          <span className="font-semibold text-gray-900">{order.name}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
            {order.displayFinancialStatus}
          </span>
          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
            {order.displayFulfillmentStatus}
          </span>
        </div>
        <p className="mt-2 text-gray-400">
          {new Date(order.createdAt).toLocaleDateString('en-SG', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </p>
      </div>

      <div className="px-4 py-3">
        <p className="mb-2 text-[10px] uppercase tracking-wide text-gray-400">Items</p>
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={`${item.title}-${index}`} className="flex items-start gap-2">
              {item.variant?.image?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.variant.image.url}
                  alt={item.title}
                  className="h-8 w-8 flex-shrink-0 rounded bg-gray-100 object-cover"
                />
              ) : (
                <div className="h-8 w-8 flex-shrink-0 rounded bg-gray-100" />
              )}
              <div className="min-w-0">
                <p className="truncate leading-snug text-gray-800">{item.title}</p>
                <p className="text-gray-400">
                  x {item.quantity} · {item.originalUnitPriceSet.shopMoney.currencyCode}{' '}
                  {item.originalUnitPriceSet.shopMoney.amount}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between font-semibold text-gray-900">
          <span>Total</span>
          <span>
            {money.currencyCode} {money.amount}
          </span>
        </div>
      </div>

      {order.customer && (
        <div className="px-4 py-3">
          <p className="mb-2 text-[10px] uppercase tracking-wide text-gray-400">Customer</p>
          <div className="flex items-start gap-1.5">
            <User className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
            <div>
              <p className="text-gray-800">
                {[order.customer.firstName, order.customer.lastName].filter(Boolean).join(' ') || '-'}
              </p>
              {order.customer.email && <p className="text-gray-400">{order.customer.email}</p>}
              {order.customer.phone && <p className="text-gray-400">{order.customer.phone}</p>}
            </div>
          </div>
        </div>
      )}

      {order.shippingAddress && (
        <div className="px-4 py-3">
          <p className="mb-2 text-[10px] uppercase tracking-wide text-gray-400">Ship to</p>
          <div className="flex items-start gap-1.5">
            <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
            <p className="text-gray-600">
              {[order.shippingAddress.address1, order.shippingAddress.city, order.shippingAddress.country]
                .filter(Boolean)
                .join(', ')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
