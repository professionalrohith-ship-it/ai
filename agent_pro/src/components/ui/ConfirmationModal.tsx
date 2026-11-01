import { TriangleAlert } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { useLockBodyScroll } from '../../hooks/useLockBodyScroll'
import { PrimaryButton } from './PrimaryButton'

interface ConfirmationModalProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmationModal({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useLockBodyScroll(open)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
        className="relative w-full max-w-md animate-fade-up rounded-2xl border border-line bg-card p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] max-sm:p-5"
      >
        <div className="flex gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
            <TriangleAlert className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-base font-semibold text-ink">
              {title}
            </h2>
            <p id="confirm-description" className="mt-1.5 text-sm leading-relaxed text-mute">
              {description}
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-row justify-end gap-2 max-sm:flex-col-reverse">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-line px-4 text-sm font-medium text-ink transition hover:bg-white/5"
          >
            {cancelLabel}
          </button>
          <PrimaryButton variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}
