'use client'
import { useState } from 'react'
import { AiConfidence } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Sparkles, Check, Pencil, X, ChevronDown, ChevronUp, FileText } from 'lucide-react'

interface AiSuggestionPanelProps {
  suggestion: string
  confidence: AiConfidence
  reasoning?: string
  sourceCited?: string | null
  onSend: () => void
  onEdit: (text: string) => void
  onDismiss: () => void
}

const confidenceConfig: Record<AiConfidence, { label: string; color: string; bg: string; border: string }> = {
  high: {
    label: 'High confidence',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
  },
  medium: {
    label: 'Review suggested',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  low: {
    label: 'Needs human',
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
  },
}

const SOURCE_LABELS: Record<string, string> = {
  custom_instructions: 'Store instructions',
  product_catalog: 'Product catalogue',
  knowledge_base: 'Knowledge base',
  order_history: 'Order history',
}

export function AiSuggestionPanel({
  suggestion,
  confidence,
  reasoning,
  sourceCited,
  onSend,
  onEdit,
  onDismiss,
}: AiSuggestionPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const config = confidenceConfig[confidence]
  const hasDetail = Boolean(reasoning || sourceCited)
  const sourceLabel = sourceCited ? (SOURCE_LABELS[sourceCited] ?? sourceCited) : null

  return (
    <div className={cn('rounded-xl border p-3.5 mb-3', config.bg, config.border)}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className={cn('w-3.5 h-3.5', config.color)} />
          <span className={cn('text-xs font-semibold', config.color)}>AI Draft</span>
          <button
            type="button"
            onClick={() => hasDetail && setExpanded(p => !p)}
            aria-expanded={hasDetail ? expanded : undefined}
            className={cn(
              'text-xs px-1.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1',
              config.color,
              'bg-white/60 border',
              config.border,
              hasDetail ? 'cursor-pointer hover:bg-white/80 transition-colors' : 'cursor-default'
            )}
            title={hasDetail ? 'Why this reply?' : undefined}
          >
            {config.label}
            {hasDetail && (
              expanded
                ? <ChevronUp className="w-3 h-3" />
                : <ChevronDown className="w-3 h-3" />
            )}
          </button>
        </div>
        <button type="button" onClick={onDismiss} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <p className="text-sm text-gray-700 mb-3 leading-relaxed">{suggestion}</p>

      {expanded && hasDetail && (
        <div className={cn('mb-3 rounded-lg border p-3 text-xs space-y-2', 'bg-white/60', config.border)}>
          {reasoning && (
            <p className="text-gray-600 leading-relaxed">{reasoning}</p>
          )}
          {sourceLabel ? (
            <div className="flex items-center gap-1.5 text-gray-500">
              <FileText className="w-3 h-3 flex-shrink-0" />
              <span>Source: <span className="font-medium text-gray-700">{sourceLabel}</span></span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-gray-400">
              <FileText className="w-3 h-3 flex-shrink-0" />
              <span>No store data referenced</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSend}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          Send
        </button>
        <button
          type="button"
          onClick={() => onEdit(suggestion)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 bg-white hover:bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
      </div>
    </div>
  )
}
