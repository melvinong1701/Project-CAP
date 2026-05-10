'use client'
import { AiConfidence } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Sparkles, Check, Pencil, X } from 'lucide-react'

interface AiSuggestionPanelProps {
  suggestion: string
  confidence: AiConfidence
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

export function AiSuggestionPanel({ suggestion, confidence, onSend, onEdit, onDismiss }: AiSuggestionPanelProps) {
  const config = confidenceConfig[confidence]

  return (
    <div className={cn('rounded-xl border p-3.5 mb-3', config.bg, config.border)}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className={cn('w-3.5 h-3.5', config.color)} />
          <span className={cn('text-xs font-semibold', config.color)}>AI Draft</span>
          <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', config.color, 'bg-white/60 border', config.border)}>
            {config.label}
          </span>
        </div>
        <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <p className="text-sm text-gray-700 mb-3 leading-relaxed">{suggestion}</p>

      <div className="flex items-center gap-2">
        <button
          onClick={onSend}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          Send
        </button>
        <button
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
