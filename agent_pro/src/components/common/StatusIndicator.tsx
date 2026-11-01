import type { ServiceState } from '../../types'
import { cn } from '../../utils/cn'

interface StatusIndicatorProps {
  state: ServiceState
  label?: string
  className?: string
}

const DOT: Record<ServiceState, string> = {
  online: 'bg-ok',
  pending: 'bg-warn',
  offline: 'bg-[#6b6b6b]',
}

const TEXT: Record<ServiceState, string> = {
  online: 'text-ok',
  pending: 'text-warn',
  offline: 'text-mute',
}

const DEFAULT_LABEL: Record<ServiceState, string> = {
  online: 'Online',
  pending: 'Pending',
  offline: 'Offline',
}

export function StatusIndicator({ state, label, className }: StatusIndicatorProps) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-xs font-medium', TEXT[state], className)}>
      <span className="relative flex size-2">
        {state === 'online' && (
          <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-60', DOT[state])} />
        )}
        <span className={cn('relative inline-flex size-2 rounded-full', DOT[state])} />
      </span>
      {label ?? DEFAULT_LABEL[state]}
    </span>
  )
}
