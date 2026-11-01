import type { RepositoryStatus } from '../../types'
import { cn } from '../../utils/cn'

const CONFIG: Record<RepositoryStatus, { label: string; className: string; dot: string }> = {
  indexed: { label: 'Indexed', className: 'border-ok/25 bg-ok/10 text-ok', dot: 'bg-ok' },
  indexing: { label: 'Indexing', className: 'border-warn/25 bg-warn/10 text-warn', dot: 'bg-warn animate-pulse-dot' },
  'not-indexed': { label: 'Not indexed', className: 'border-line bg-white/5 text-mute', dot: 'bg-[#6b6b6b]' },
  error: { label: 'Needs attention', className: 'border-danger/25 bg-danger/10 text-danger', dot: 'bg-danger' },
}

export function RepositoryStatusBadge({ status }: { status: RepositoryStatus }) {
  const { label, className, dot } = CONFIG[status]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-semibold',
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', dot)} aria-hidden="true" />
      {label}
    </span>
  )
}
