import type { ReactNode } from 'react'

import { cn } from '../../utils/cn'

interface SectionCardProps {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

/** Titled card used for dashboard panels so every panel shares the same chrome. */
export function SectionCard({ title, description, action, children, className }: SectionCardProps) {
  return (
    <section className={cn('rounded-card border border-line bg-card p-5 shadow-card max-sm:p-4', className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-mute">{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}
