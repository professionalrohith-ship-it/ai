import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-row items-end justify-between gap-4 @max-[40rem]:flex-col @max-[40rem]:items-start">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink max-sm:text-xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-mute">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
