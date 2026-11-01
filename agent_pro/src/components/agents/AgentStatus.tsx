import type { AgentExecutionStatus } from '../../types/agents'
import { cn } from '../../utils/cn'
import { Badge } from '../ui/Badge'
import { STATUS_META } from './agentMeta'

/** Status pill: Idle, Working (pulsing), Completed or Failed. */
export function AgentStatus({ status, className }: { status: AgentExecutionStatus; className?: string }) {
  const { label, tone } = STATUS_META[status]
  return (
    <Badge tone={tone} pulse={status === 'working'} className={className}>
      {label}
    </Badge>
  )
}

/** Compact dot + label for tight spaces such as diagram nodes. */
export function AgentStatusDot({ status, className }: { status: AgentExecutionStatus; className?: string }) {
  const { label, dot } = STATUS_META[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[0.6875rem] font-medium text-mute', className)}>
      <span className={cn('size-2 rounded-full', dot, status === 'working' && 'animate-pulse-dot')} aria-hidden="true" />
      {label}
    </span>
  )
}
