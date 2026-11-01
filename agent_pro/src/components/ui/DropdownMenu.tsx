import { useCallback, useRef, useState, type ReactNode } from 'react'

import { useClickOutside } from '../../hooks/useClickOutside'
import { cn } from '../../utils/cn'

interface DropdownMenuProps {
  /** Content of the trigger button. */
  trigger: ReactNode
  ariaLabel: string
  align?: 'left' | 'right'
  /** Panel content; receives `close` so items can dismiss the menu. */
  children: (helpers: { close: () => void }) => ReactNode
  triggerClassName?: string
  panelClassName?: string
}

export function DropdownMenu({
  trigger,
  ariaLabel,
  align = 'right',
  children,
  triggerClassName,
  panelClassName,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])

  useClickOutside(rootRef, close, open)

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={triggerClassName}
      >
        {trigger}
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-full z-50 mt-2 w-72 max-w-[calc(100vw-1.5rem)] animate-fade-up overflow-hidden rounded-xl',
            'border border-line bg-card shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)]',
            align === 'right' ? 'right-0' : 'left-0',
            panelClassName,
          )}
        >
          {children({ close })}
        </div>
      )}
    </div>
  )
}

interface DropdownItemProps {
  icon?: ReactNode
  children: ReactNode
  onClick?: () => void
  active?: boolean
  danger?: boolean
  trailing?: ReactNode
}

export function DropdownItem({ icon, children, onClick, active, danger, trailing }: DropdownItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm transition',
        danger ? 'text-danger hover:bg-danger/10' : 'text-ink hover:bg-white/5',
        active && 'bg-brand/10',
      )}
    >
      {icon && <span className={cn('shrink-0', danger ? 'text-danger' : 'text-mute')}>{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </button>
  )
}
