import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

import { useLockBodyScroll } from '../../hooks/useLockBodyScroll'
import { cn } from '../../utils/cn'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  /** Buttons row pinned to the bottom of the dialog. */
  footer?: ReactNode
  size?: 'md' | 'lg' | 'xl'
  /** Clicking the dark backdrop closes the dialog (default true). */
  closeOnBackdrop?: boolean
}

const SIZES = { md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

/** Accessible dialog: Esc closes, focus moves in and is restored, body scroll is locked.
 *  On phones it becomes a bottom sheet. */
export function Modal({ open, onClose, title, description, children, footer, size = 'md', closeOnBackdrop = true }: ModalProps) {
  const titleId = useId()
  const descriptionId = useId()
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 max-sm:items-end max-sm:p-0">
      <div
        className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'relative flex max-h-[calc(90dvh/var(--zf,1))] w-full animate-fade-up flex-col overflow-hidden rounded-2xl border border-line bg-card outline-none',
          'shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] max-sm:max-h-[calc(94dvh/var(--zf,1))] max-sm:rounded-b-none',
          SIZES[size],
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4 max-sm:px-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-mute">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-mute transition hover:bg-white/10 hover:text-ink"
          >
            <X className="size-[1.1rem]" aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 max-sm:px-4">{children}</div>
        {footer && (
          <footer className="flex flex-row flex-wrap items-center justify-end gap-2 border-t border-line bg-surface/60 px-6 py-3.5 max-sm:flex-col-reverse max-sm:items-stretch max-sm:px-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
