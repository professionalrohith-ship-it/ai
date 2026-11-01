import type { ReactNode } from 'react'

import { cn } from '../../utils/cn'

export type BadgeTone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'info'

const TONES: Record<BadgeTone, string> = {
  neutral: 'border-line bg-white/5 text-mute',
  brand: 'border-brand/30 bg-brand/10 text-brand',
  ok: 'border-ok/25 bg-ok/10 text-ok',
  warn: 'border-warn/25 bg-warn/10 text-warn',
  danger: 'border-danger/25 bg-danger/10 text-danger',
  info: 'border-info/25 bg-info/10 text-info',
}

interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
  icon?: ReactNode
  /** Adds a pulsing dot (for "in progress" states). */
  pulse?: boolean
  className?: string
}

/** Small status / category pill used across all modules. */
export function Badge({ tone = 'neutral', children, icon, pulse, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {pulse && <span className="size-1.5 animate-pulse-dot rounded-full bg-current" aria-hidden="true" />}
      {icon}
      {children}
    </span>
  )
}
