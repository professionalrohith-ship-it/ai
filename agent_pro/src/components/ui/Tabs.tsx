import type { LucideIcon } from 'lucide-react'
import { useRef, type KeyboardEvent } from 'react'

import { cn } from '../../utils/cn'

export interface TabItem {
  id: string
  label: string
  icon?: LucideIcon
  count?: number
}

interface TabsProps {
  tabs: TabItem[]
  value: string
  onChange: (id: string) => void
  ariaLabel: string
  className?: string
}

/** Underline tabs with arrow-key navigation; scrolls sideways instead of wrapping on narrow screens. */
export function Tabs({ tabs, value, onChange, ariaLabel, className }: TabsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const handleKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    onChange(tabs[next].id)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex max-w-full gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]', className)}
    >
      {tabs.map((tab, index) => {
        const Icon = tab.icon
        const active = tab.id === value
        return (
          <button
            key={tab.id}
            ref={(element) => {
              refs.current[index] = element
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKey(event, index)}
            className={cn(
              'relative inline-flex h-10 shrink-0 items-center gap-2 px-3.5 text-sm font-medium whitespace-nowrap transition-colors',
              active ? 'text-ink' : 'text-mute hover:text-ink',
            )}
          >
            {Icon && <Icon className={cn('size-4', active && 'text-brand')} aria-hidden="true" />}
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn('rounded-full px-1.5 py-px text-[0.6875rem] font-semibold', active ? 'bg-brand/15 text-brand' : 'bg-white/5 text-mute')}>
                {tab.count}
              </span>
            )}
            <span
              aria-hidden="true"
              className={cn('absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand transition-opacity', active ? 'opacity-100' : 'opacity-0')}
            />
          </button>
        )
      })}
    </div>
  )
}
