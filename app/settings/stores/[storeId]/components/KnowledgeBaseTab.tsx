'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Check,
  FileText,
  HelpCircle,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type KnowledgeKind = 'policy' | 'faq'

interface KnowledgeRow {
  id: string
  kind: KnowledgeKind
  title: string
  body: string
  tags: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

interface KnowledgeFormState {
  kind: KnowledgeKind
  title: string
  body: string
  tags: string
}

interface KnowledgeBaseTabProps {
  storeId: string
}

const emptyForm: KnowledgeFormState = {
  kind: 'policy',
  title: '',
  body: '',
  tags: '',
}

const kindLabels: Record<KnowledgeKind, string> = {
  policy: 'Policy',
  faq: 'FAQ',
}

async function fetchKnowledge(storeId: string): Promise<KnowledgeRow[]> {
  const res = await fetch(`/api/ai/knowledge?storeId=${encodeURIComponent(storeId)}`)
  const json = await res.json() as { data?: KnowledgeRow[]; error?: string }

  if (!res.ok) {
    throw new Error(json.error ?? 'Failed to load knowledge')
  }

  return json.data ?? []
}

function parseTagInput(value: string) {
  return value
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
    .slice(0, 20)
}

function formatTags(tags: string[]) {
  return tags.join(', ')
}

function formatUpdatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Updated recently'

  return `Updated ${new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)}`
}

function buildPreview(body: string) {
  const compact = body.replace(/\s+/g, ' ').trim()
  if (compact.length <= 180) return compact
  return `${compact.slice(0, 180).trim()}...`
}

function KindPill({ kind }: { kind: KnowledgeKind }) {
  const Icon = kind === 'policy' ? FileText : HelpCircle

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
        kind === 'policy' ? 'bg-indigo-50 text-indigo-700' : 'bg-sky-50 text-sky-700'
      )}
    >
      <Icon className="h-3 w-3" />
      {kindLabels[kind]}
    </span>
  )
}

function KindSelector({
  value,
  onChange,
}: {
  value: KnowledgeKind
  onChange: (value: KnowledgeKind) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(['policy', 'faq'] as KnowledgeKind[]).map(kind => (
        <button
          key={kind}
          type="button"
          onClick={() => onChange(kind)}
          className={cn(
            'rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors',
            value === kind
              ? 'bg-indigo-600 text-white'
              : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
          )}
        >
          {kindLabels[kind]}
        </button>
      ))}
    </div>
  )
}

function KnowledgeForm({
  value,
  onChange,
  onSubmit,
  submitLabel,
  saving,
  onCancel,
}: {
  value: KnowledgeFormState
  onChange: (value: KnowledgeFormState) => void
  onSubmit: () => void
  submitLabel: string
  saving: boolean
  onCancel?: () => void
}) {
  const canSubmit = value.title.trim().length > 0 && value.body.trim().length > 0 && !saving

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-medium text-gray-900">Kind</p>
        <KindSelector
          value={value.kind}
          onChange={kind => onChange({ ...value, kind })}
        />
      </div>

      <div>
        <label htmlFor={onCancel ? 'knowledge-edit-title' : 'knowledge-new-title'} className="mb-1 block text-sm font-medium text-gray-900">
          Title
        </label>
        <input
          id={onCancel ? 'knowledge-edit-title' : 'knowledge-new-title'}
          value={value.title}
          maxLength={200}
          onChange={event => onChange({ ...value, title: event.target.value })}
          className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm placeholder:text-gray-300 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Return window"
        />
      </div>

      <div>
        <label htmlFor={onCancel ? 'knowledge-edit-body' : 'knowledge-new-body'} className="mb-1 block text-sm font-medium text-gray-900">
          Body
        </label>
        <textarea
          id={onCancel ? 'knowledge-edit-body' : 'knowledge-new-body'}
          value={value.body}
          rows={onCancel ? 7 : 5}
          maxLength={8000}
          onChange={event => onChange({ ...value, body: event.target.value })}
          className="w-full resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm placeholder:text-gray-300 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Customers can return unopened items within 7 days..."
        />
      </div>

      <div>
        <label htmlFor={onCancel ? 'knowledge-edit-tags' : 'knowledge-new-tags'} className="mb-1 block text-sm font-medium text-gray-900">
          Tags
        </label>
        <input
          id={onCancel ? 'knowledge-edit-tags' : 'knowledge-new-tags'}
          value={value.tags}
          onChange={event => onChange({ ...value, tags: event.target.value })}
          className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm placeholder:text-gray-300 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="returns, warranty, shipping"
        />
      </div>

      <div className="flex items-center justify-end gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {saving ? 'Saving...' : submitLabel}
        </button>
      </div>
    </div>
  )
}

function KnowledgeEntryCard({
  entry,
  busy,
  onEdit,
  onToggle,
  onDelete,
}: {
  entry: KnowledgeRow
  busy: boolean
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <KindPill kind={entry.kind} />
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold',
                entry.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
              )}
            >
              {entry.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <h3 className="mt-3 text-sm font-semibold text-gray-900">{entry.title}</h3>
          <p className="mt-2 text-sm leading-6 text-gray-500">{buildPreview(entry.body)}</p>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700 disabled:opacity-40"
            aria-label={`Edit ${entry.title}`}
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
            aria-label={`Delete ${entry.title}`}
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {entry.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {entry.tags.map(tag => (
                <span key={tag} className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500">
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">No tags</p>
          )}
          <p className="mt-2 text-xs text-gray-400">{formatUpdatedAt(entry.updated_at)}</p>
        </div>

        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          aria-pressed={entry.is_active}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40',
            entry.is_active
              ? 'border border-gray-200 text-gray-600 hover:bg-gray-50'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {entry.is_active ? 'Set inactive' : 'Set active'}
        </button>
      </div>
    </div>
  )
}

function EditModal({
  form,
  saving,
  onChange,
  onSave,
  onClose,
}: {
  form: KnowledgeFormState
  saving: boolean
  onChange: (value: KnowledgeFormState) => void
  onSave: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={saving ? undefined : onClose} />
      <div className="relative mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Edit knowledge entry</h2>
            <p className="mt-1 text-xs text-gray-400">Changes affect future AI retrieval when the entry is active.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700 disabled:opacity-40"
            aria-label="Close edit modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <KnowledgeForm
          value={form}
          onChange={onChange}
          onSubmit={onSave}
          submitLabel="Save changes"
          saving={saving}
          onCancel={onClose}
        />
      </div>
    </div>
  )
}

function DeleteModal({
  entry,
  deleting,
  onCancel,
  onConfirm,
}: {
  entry: KnowledgeRow
  deleting: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={deleting ? undefined : onCancel} />
      <div className="relative mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-sm font-semibold text-gray-900">Delete {entry.title}?</h2>
        <p className="mt-2 text-sm text-gray-500">This removes the entry from this store.</p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-40"
          >
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export default function KnowledgeBaseTab({ storeId }: KnowledgeBaseTabProps) {
  const [entries, setEntries] = useState<KnowledgeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingNew, setSavingNew] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [newForm, setNewForm] = useState<KnowledgeFormState>(emptyForm)
  const [editingEntry, setEditingEntry] = useState<KnowledgeRow | null>(null)
  const [editForm, setEditForm] = useState<KnowledgeFormState>(emptyForm)
  const [deleteEntry, setDeleteEntry] = useState<KnowledgeRow | null>(null)

  const groupedEntries = useMemo(() => ({
    policy: entries.filter(entry => entry.kind === 'policy'),
    faq: entries.filter(entry => entry.kind === 'faq'),
  }), [entries])

  useEffect(() => {
    let cancelled = false

    async function loadKnowledge() {
      setLoading(true)
      setError(null)

      try {
        const rows = await fetchKnowledge(storeId)
        if (!cancelled) setEntries(rows)
      } catch {
        if (!cancelled) {
          setEntries([])
          setError('Could not load knowledge entries for this store.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadKnowledge()

    return () => {
      cancelled = true
    }
  }, [storeId])

  useEffect(() => {
    if (!notice) return undefined

    const timeoutId = window.setTimeout(() => setNotice(null), 2500)
    return () => window.clearTimeout(timeoutId)
  }, [notice])

  const refreshEntries = async () => {
    const rows = await fetchKnowledge(storeId)
    setEntries(rows)
  }

  const handleCreate = async () => {
    setSavingNew(true)
    setError(null)

    try {
      const res = await fetch('/api/ai/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          kind: newForm.kind,
          title: newForm.title,
          body: newForm.body,
          tags: parseTagInput(newForm.tags),
        }),
      })
      const json = await res.json() as { error?: string }

      if (!res.ok) {
        throw new Error(json.error ?? 'Failed to create knowledge entry')
      }

      setNewForm(emptyForm)
      await refreshEntries()
      setNotice('Knowledge entry added')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create knowledge entry.')
    } finally {
      setSavingNew(false)
    }
  }

  const openEdit = (entry: KnowledgeRow) => {
    setEditingEntry(entry)
    setEditForm({
      kind: entry.kind,
      title: entry.title,
      body: entry.body,
      tags: formatTags(entry.tags),
    })
  }

  const handleEdit = async () => {
    if (!editingEntry) return

    setSavingEdit(true)
    setError(null)

    try {
      const res = await fetch('/api/ai/knowledge', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingEntry.id,
          kind: editForm.kind,
          title: editForm.title,
          body: editForm.body,
          tags: parseTagInput(editForm.tags),
        }),
      })
      const json = await res.json() as { error?: string }

      if (!res.ok) {
        throw new Error(json.error ?? 'Failed to update knowledge entry')
      }

      setEditingEntry(null)
      await refreshEntries()
      setNotice('Knowledge entry saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update knowledge entry.')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleToggle = async (entry: KnowledgeRow) => {
    setBusyEntryId(entry.id)
    setError(null)

    try {
      const res = await fetch('/api/ai/knowledge', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entry.id,
          isActive: !entry.is_active,
        }),
      })
      const json = await res.json() as { data?: KnowledgeRow; error?: string }

      if (!res.ok || !json.data) {
        throw new Error(json.error ?? 'Failed to update knowledge entry')
      }

      const updatedEntry = json.data
      setEntries(prev => prev.map(row => row.id === entry.id ? updatedEntry : row))
      setNotice(updatedEntry.is_active ? 'Knowledge entry activated' : 'Knowledge entry deactivated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update knowledge entry.')
    } finally {
      setBusyEntryId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteEntry) return

    setBusyEntryId(deleteEntry.id)
    setError(null)

    try {
      const res = await fetch(`/api/ai/knowledge?id=${encodeURIComponent(deleteEntry.id)}`, {
        method: 'DELETE',
      })
      const json = await res.json() as { error?: string }

      if (!res.ok) {
        throw new Error(json.error ?? 'Failed to delete knowledge entry')
      }

      setDeleteEntry(null)
      await refreshEntries()
      setNotice('Knowledge entry deleted')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete knowledge entry.')
    } finally {
      setBusyEntryId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
          <Check className="h-4 w-4 flex-shrink-0" />
          {notice}
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 bg-white p-6">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Add knowledge</p>
          <h2 className="mt-1 text-sm font-semibold text-gray-900">New policy or FAQ</h2>
        </div>

        <KnowledgeForm
          value={newForm}
          onChange={setNewForm}
          onSubmit={handleCreate}
          submitLabel="Add entry"
          saving={savingNew}
        />
      </div>

      {entries.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 text-center">
          <FileText className="mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">No knowledge entries yet</p>
          <p className="mt-1 text-xs text-gray-400">Add a policy or FAQ above.</p>
        </div>
      ) : (
        (['policy', 'faq'] as KnowledgeKind[]).map(kind => (
          groupedEntries[kind].length > 0 && (
            <section key={kind} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {kindLabels[kind]}s · {groupedEntries[kind].length}
                </p>
              </div>
              <div className="space-y-3">
                {groupedEntries[kind].map(entry => (
                  <KnowledgeEntryCard
                    key={entry.id}
                    entry={entry}
                    busy={busyEntryId === entry.id}
                    onEdit={() => openEdit(entry)}
                    onToggle={() => handleToggle(entry)}
                    onDelete={() => setDeleteEntry(entry)}
                  />
                ))}
              </div>
            </section>
          )
        ))
      )}

      {editingEntry && (
        <EditModal
          form={editForm}
          saving={savingEdit}
          onChange={setEditForm}
          onSave={handleEdit}
          onClose={() => setEditingEntry(null)}
        />
      )}

      {deleteEntry && (
        <DeleteModal
          entry={deleteEntry}
          deleting={busyEntryId === deleteEntry.id}
          onCancel={() => setDeleteEntry(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}
