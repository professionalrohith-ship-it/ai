import { cn } from '../../utils/cn'

interface ProgressBarProps {
  /** 0 to 100. */
  value: number
  label?: string
  tone?: 'brand' | 'ok' | 'danger'
  className?: string
}

const FILL = {
  brand: 'bg-gradient-to-r from-brand-deep via-brand to-brand-hover',
  ok: 'bg-ok',
  danger: 'bg-danger',
}

export function ProgressBar({ value, label, tone = 'brand', className }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div
      role="progressbar"
      aria-label={label ?? 'Progress'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-white/8', className)}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-300 ease-out', FILL[tone])} style={{ width: `${clamped}%` }} />
    </div>
  )
}
