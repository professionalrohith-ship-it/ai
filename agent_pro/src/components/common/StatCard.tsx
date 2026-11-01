import type { LucideIcon } from 'lucide-react'

import { Skeleton } from './LoadingState'

interface StatCardProps {
  label: string
  value: string
  hint?: string
  icon: LucideIcon
  loading?: boolean
}

export function StatCard({ label, value, hint, icon: Icon, loading = false }: StatCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-card border border-line bg-card p-5 shadow-card transition duration-300 hover:-translate-y-0.5 hover:border-[#454545] max-sm:p-4">
      <div
        className="pointer-events-none absolute -top-10 -right-10 size-28 rounded-full bg-brand/0 blur-2xl transition duration-500 group-hover:bg-brand/15"
        aria-hidden="true"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[0.8125rem] font-medium text-mute">{label}</p>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-20" />
          ) : (
            <p className="mt-2 text-[1.75rem] font-semibold tracking-tight text-ink max-sm:text-2xl">{value}</p>
          )}
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/12 text-brand ring-1 ring-brand/20">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
      {hint && !loading && <p className="mt-3 truncate text-xs text-mute">{hint}</p>}
    </div>
  )
}
