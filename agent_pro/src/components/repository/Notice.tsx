import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '../../utils/cn'

type Tone = 'ok' | 'danger' | 'info' | 'warn'

const STYLES: Record<Tone, string> = {
  ok: 'border-ok/25 bg-ok/10 text-ok',
  danger: 'border-danger/30 bg-danger/10 text-danger',
  info: 'border-brand/25 bg-brand/5 text-brand',
  warn: 'border-warn/30 bg-warn/10 text-warn',
}

const ICONS = { ok: CircleCheck, danger: CircleAlert, info: Info, warn: CircleAlert }

interface NoticeProps {
  tone?: Tone
  children: ReactNode
  onDismiss?: () => void
  className?: string
}

/** Inline message for success, error and information notes. */
export function Notice({ tone = 'info', children, onDismiss, className }: NoticeProps) {
  const Icon = ICONS[tone]
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed', STYLES[tone], className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-ink/90">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="grid size-5 shrink-0 place-items-center rounded text-mute transition hover:text-ink"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
