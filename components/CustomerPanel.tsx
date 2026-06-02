'use client'

import { KeyboardEvent, useEffect, useState } from 'react'
import { Conversation, CustomerContact } from '@/lib/types'
import { ChannelBadge } from './ChannelBadge'
import { Contact, Loader2, Package, Tag, User } from 'lucide-react'

interface CustomerPanelProps {
  conversation: Conversation
  onUpdateCustomer: (convId: string, customer: CustomerContact) => void
}

interface ContactForm {
  displayName: string
  phone: string
  email: string
  notes: string
}

type ContactField = keyof ContactForm
type CustomerOrderStatus = 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'returned'

interface CustomerOrderHistoryOrder {
  id: string
  channel: string
  externalOrderId: string
  status: CustomerOrderStatus
  itemsSummary: string | null
  totalAmount: number
  currency: string
  orderPlacedAt: string | null
  trackingNumber: string | null
}

interface CustomerOrderHistoryResponse {
  customer: {
    totalOrders: number
    totalSpend: number
  } | null
  orders: CustomerOrderHistoryOrder[]
  error?: string
}

function customerToForm(customer?: CustomerContact): ContactForm {
  return {
    displayName: customer?.displayName ?? '',
    phone: customer?.phone ?? '',
    email: customer?.email ?? '',
    notes: customer?.notes ?? '',
  }
}

function formatMoney(amount: number, currency: string) {
  return `${currency} ${new Intl.NumberFormat('en-SG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`
}

function formatOrderDate(value: string | null) {
  if (!value) return 'Date unavailable'
  return new Date(value).toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatOrderRef(value: string) {
  return value.startsWith('#') ? value : `#${value}`
}

function formatStatus(status: CustomerOrderStatus) {
  return status.replace('_', ' ').replace(/^\w/, char => char.toUpperCase())
}

function statusBadgeClass(status: CustomerOrderStatus) {
  if (status === 'delivered') return 'bg-emerald-50 text-emerald-700'
  if (status === 'shipped') return 'bg-blue-50 text-blue-700'
  if (status === 'cancelled' || status === 'returned') return 'bg-rose-50 text-rose-700'
  return 'bg-amber-50 text-amber-700'
}

interface ContactFieldEditorProps {
  label: string
  field: ContactField
  value: string
  placeholder: string
  isEditing: boolean
  multiline?: boolean
  onEdit: (field: ContactField) => void
  onChange: (field: ContactField, value: string) => void
  onCommit: () => void
}

function ContactFieldEditor({
  label,
  field,
  value,
  placeholder,
  isEditing,
  multiline,
  onEdit,
  onChange,
  onCommit,
}: ContactFieldEditorProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (!multiline || !event.shiftKey)) {
      event.preventDefault()
      event.currentTarget.blur()
    }
    if (event.key === 'Escape') {
      event.currentTarget.blur()
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium text-gray-400">{label}</label>
      {isEditing ? (
        multiline ? (
          <textarea
            value={value}
            onChange={event => onChange(field, event.target.value)}
            onBlur={onCommit}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full min-h-[74px] resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs leading-relaxed text-gray-800 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 placeholder:text-gray-300"
            autoFocus
          />
        ) : (
          <input
            value={value}
            onChange={event => onChange(field, event.target.value)}
            onBlur={onCommit}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 placeholder:text-gray-300"
            autoFocus
          />
        )
      ) : (
        <button
          type="button"
          onClick={() => onEdit(field)}
          className="block w-full min-h-9 rounded-lg bg-gray-50 px-3 py-2 text-left text-xs text-gray-700 transition hover:bg-gray-100"
        >
          {value.trim() ? (
            <span className={multiline ? 'whitespace-pre-wrap leading-relaxed' : ''}>{value}</span>
          ) : (
            <span className="text-gray-300">{placeholder}</span>
          )}
        </button>
      )}
    </div>
  )
}

export function CustomerPanel({ conversation, onUpdateCustomer }: CustomerPanelProps) {
  const [form, setForm] = useState<ContactForm>(() => customerToForm(conversation.customer))
  const [editingField, setEditingField] = useState<ContactField | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [orderHistory, setOrderHistory] = useState<CustomerOrderHistoryResponse | null>(null)
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [ordersError, setOrdersError] = useState<string | null>(null)

  useEffect(() => {
    setForm(customerToForm(conversation.customer))
    setEditingField(null)
    setSaveError('')
  }, [conversation.id, conversation.customer])

  useEffect(() => {
    let active = true
    setOrdersLoading(true)
    setOrdersError(null)
    setOrderHistory(null)

    fetch(`/api/conversations/${conversation.id}/orders`)
      .then(async res => {
        const data = await res.json() as CustomerOrderHistoryResponse
        if (!res.ok) {
          throw new Error(data.error ?? 'Failed to load order history')
        }
        return data
      })
      .then(data => {
        if (!active) return
        setOrderHistory({
          customer: data.customer,
          orders: data.orders ?? [],
        })
      })
      .catch(() => {
        if (active) setOrdersError('Failed to load order history')
      })
      .finally(() => {
        if (active) setOrdersLoading(false)
      })

    return () => {
      active = false
    }
  }, [conversation.id])

  const hasContactDetails = Object.values(form).some(value => value.trim())
  const orderHistoryCurrency = orderHistory?.orders[0]?.currency ?? 'SGD'

  const updateField = (field: ContactField, value: string) => {
    setForm(current => ({ ...current, [field]: value }))
  }

  const saveContact = async () => {
    setEditingField(null)
    setSaveError('')
    if (!conversation.customer && !Object.values(form).some(value => value.trim())) return

    setIsSaving(true)

    try {
      const res = await fetch(`/api/conversations/${conversation.id}/customer`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json() as { customer?: CustomerContact; error?: string }

      if (!res.ok || !data.customer) {
        setSaveError(data.error ?? 'Could not save contact')
        return
      }

      onUpdateCustomer(conversation.id, data.customer)
    } catch {
      setSaveError('Could not save contact')
    } finally {
      setIsSaving(false)
    }
  }

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
            {(conversation.customer?.displayName ?? conversation.sender.name).charAt(0)}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">{conversation.customer?.displayName ?? conversation.sender.name}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <ChannelBadge channel={conversation.channel} showLabel />
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400">Store: {conversation.storeName}</p>
      </div>

      {/* Contact Card */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            <Contact className="w-3.5 h-3.5" />
            Contact Card
          </div>
          {isSaving && <Loader2 className="w-3.5 h-3.5 text-gray-300 animate-spin" />}
        </div>
        <div className="space-y-3">
          {!hasContactDetails && (
            <button
              type="button"
              onClick={() => setEditingField('displayName')}
              className="w-full rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-left text-xs font-medium text-gray-400 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-500"
            >
              Add contact details
            </button>
          )}
          <ContactFieldEditor
            label="Display Name"
            field="displayName"
            value={form.displayName}
            placeholder="Add name"
            isEditing={editingField === 'displayName'}
            onEdit={setEditingField}
            onChange={updateField}
            onCommit={saveContact}
          />
          <ContactFieldEditor
            label="Phone"
            field="phone"
            value={form.phone}
            placeholder="Add phone"
            isEditing={editingField === 'phone'}
            onEdit={setEditingField}
            onChange={updateField}
            onCommit={saveContact}
          />
          <ContactFieldEditor
            label="Email"
            field="email"
            value={form.email}
            placeholder="Add email"
            isEditing={editingField === 'email'}
            onEdit={setEditingField}
            onChange={updateField}
            onCommit={saveContact}
          />
          <ContactFieldEditor
            label="Notes"
            field="notes"
            value={form.notes}
            placeholder="Add notes"
            isEditing={editingField === 'notes'}
            multiline
            onEdit={setEditingField}
            onChange={updateField}
            onCommit={saveContact}
          />
          {saveError && <p className="text-xs text-red-500">{saveError}</p>}
        </div>
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

      {/* Order History */}
      <div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          <Package className="w-3.5 h-3.5" />
          Order History
        </div>
        <div className="rounded-xl bg-gray-50 p-3.5">
          {ordersLoading ? (
            <div className="flex h-20 items-center justify-center text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : ordersError ? (
            <p className="py-3 text-xs text-gray-400">{ordersError}</p>
          ) : (
            <>
              {orderHistory?.customer && (
                <p className="mb-3 text-xs font-medium text-gray-500">
                  {orderHistory.customer.totalOrders} orders · {formatMoney(orderHistory.customer.totalSpend, orderHistoryCurrency)}
                </p>
              )}
              {orderHistory?.orders.length ? (
                <div className="space-y-3">
                  {orderHistory.orders.map(order => (
                    <div key={order.id} className="border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
                      <div className="mb-1.5 flex items-start justify-between gap-2">
                        <span className="min-w-0 truncate text-xs font-semibold text-gray-800">
                          {formatOrderRef(order.externalOrderId)}
                        </span>
                        <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(order.status)}`}>
                          {formatStatus(order.status)}
                        </span>
                      </div>
                      <p className="truncate text-xs font-medium text-gray-700">{order.itemsSummary ?? 'Items unavailable'}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-gray-400">
                        <span>{formatOrderDate(order.orderPlacedAt)}</span>
                        <span className="font-semibold text-gray-800">{formatMoney(order.totalAmount, order.currency)}</span>
                      </div>
                      {order.trackingNumber && (
                        <p className="mt-1.5 truncate text-xs text-gray-500">
                          Tracking <span className="font-mono text-indigo-600">{order.trackingNumber}</span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-3 text-xs text-gray-400">No past orders</p>
              )}
            </>
          )}
        </div>
      </div>

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
