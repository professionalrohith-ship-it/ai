import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '../../utils/cn'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
  tone?: 'neutral' | 'error'
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, tone = 'neutral', className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-card border border-dashed border-line bg-surface/60 px-6 py-12 text-center',
        className,
      )}
    >
      <span
        className={cn(
          'grid size-14 place-items-center rounded-2xl ring-1',
          tone === 'error' ? 'bg-danger/10 text-danger ring-danger/25' : 'bg-brand/10 text-brand ring-brand/20',
        )}
      >
        <Icon className="size-7" aria-hidden="true" />
      </span>
      <h3 className="mt-5 text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-mute">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
