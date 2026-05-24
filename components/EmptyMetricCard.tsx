import Link from 'next/link'
import { ArrowRight, BarChart3, List } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyMetricCardProps {
  label: string
  message: string
  ctaText?: string
  ctaHref?: string
  variant?: 'kpi' | 'chart' | 'list'
}

function EmptyStateCta({ ctaText, ctaHref }: { ctaText?: string; ctaHref: string }) {
  if (!ctaText) return null

  return (
    <Link
      href={ctaHref}
      className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
    >
      {ctaText}
      <ArrowRight className="h-3 w-3" />
    </Link>
  )
}

function SkeletonRows() {
  return (
    <div className="space-y-2.5">
      {[0, 1, 2].map(row => (
        <div key={row} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2.5">
          <div className="h-7 w-7 rounded-md bg-gray-100" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2 w-2/3 rounded-full bg-gray-100" />
            <div className="h-2 w-1/3 rounded-full bg-gray-100" />
          </div>
          <div className="h-2 w-12 rounded-full bg-gray-100" />
        </div>
      ))}
    </div>
  )
}

export function EmptyMetricCard({
  label,
  message,
  ctaText,
  ctaHref = '/settings',
  variant = 'kpi',
}: EmptyMetricCardProps) {
  if (variant === 'kpi') {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="min-h-[46px] text-sm leading-5 text-gray-500">{message}</p>
        <EmptyStateCta ctaText={ctaText} ctaHref={ctaHref} />
      </div>
    )
  }

  const Icon = variant === 'chart' ? BarChart3 : List

  return (
    <div
      className={cn(
        'rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]',
        variant === 'chart' ? 'min-h-[320px]' : 'min-h-[230px]'
      )}
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-500">{label}</h3>
        </div>
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gray-50">
          <Icon className="h-4 w-4 text-gray-300" />
        </div>
      </div>

      {variant === 'list' ? (
        <div className="space-y-4">
          <SkeletonRows />
          <div className="rounded-xl bg-gray-50 px-4 py-3">
            <p className="text-sm leading-5 text-gray-500">{message}</p>
            <div className="mt-2">
              <EmptyStateCta ctaText={ctaText} ctaHref={ctaHref} />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-[230px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-100 bg-gray-50/60 px-6 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-gray-300 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <Icon className="h-5 w-5" />
          </div>
          <p className="max-w-sm text-sm leading-5 text-gray-500">{message}</p>
          <div className="mt-3">
            <EmptyStateCta ctaText={ctaText} ctaHref={ctaHref} />
          </div>
        </div>
      )}
    </div>
  )
}
