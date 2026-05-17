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

function customerToForm(customer?: CustomerContact): ContactForm {
  return {
    displayName: customer?.displayName ?? '',
    phone: customer?.phone ?? '',
    email: customer?.email ?? '',
    notes: customer?.notes ?? '',
  }
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

  useEffect(() => {
    setForm(customerToForm(conversation.customer))
    setEditingField(null)
    setSaveError('')
  }, [conversation.id, conversation.customer])

  const hasContactDetails = Object.values(form).some(value => value.trim())

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
