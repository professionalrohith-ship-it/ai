import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

import { useLockBodyScroll } from '../../hooks/useLockBodyScroll'
import { cn } from '../../utils/cn'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  side?: 'left' | 'right'
  className?: string
}

/** Slide-in panel used for secondary content on small screens (file tree, details, agent activity). */
export function Drawer({ open, onClose, title, children, side = 'right', className }: DrawerProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useLockBodyScroll(open)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[65]">
      <div className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'absolute inset-y-0 flex w-[min(24rem,92vw)] animate-fade-in flex-col border-line bg-surface outline-none',
          'shadow-[0_0_60px_rgba(0,0,0,0.7)]',
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
          className,
        )}
      >
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
          <h2 id={titleId} className="truncate text-sm font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="grid size-8 place-items-center rounded-lg text-mute transition hover:bg-white/10 hover:text-ink"
          >
            <X className="size-[1.1rem]" aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
