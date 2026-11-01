import { Check, Circle, Loader2 } from 'lucide-react'

import type { AgentStepRecord } from '../../types/chat'
import { cn } from '../../utils/cn'
import { AGENT_META } from './agentMeta'

interface ExecutionProgressProps {
  steps: AgentStepRecord[]
  className?: string
}

/** Vertical list of the agent steps with pending / running / done markers. */
export function ExecutionProgress({ steps, className }: ExecutionProgressProps) {
  return (
    <ol className={cn('space-y-0.5', className)}>
      {steps.map((step, index) => {
        const meta = AGENT_META[step.agentId]
        const Icon = meta.icon
        return (
          <li key={step.id} className="relative flex gap-3 pb-3 last:pb-0">
            {index < steps.length - 1 && (
              <span
                className={cn('absolute top-6 bottom-0 left-[0.6875rem] w-px', step.state === 'done' ? 'bg-ok/40' : 'bg-line')}
                aria-hidden="true"
              />
            )}
            <span
              className={cn(
                'relative z-10 mt-0.5 grid size-[1.375rem] shrink-0 place-items-center rounded-full border',
                step.state === 'done' && 'border-ok/40 bg-ok/15 text-ok',
                step.state === 'running' && 'border-brand/50 bg-brand/15 text-brand',
                step.state === 'pending' && 'border-line bg-surface text-[#5c5c5c]',
              )}
            >
              {step.state === 'done' && <Check className="size-3" aria-hidden="true" />}
              {step.state === 'running' && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
              {step.state === 'pending' && <Circle className="size-2" aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn('flex items-center gap-1.5 text-xs font-semibold', step.state === 'pending' ? 'text-mute' : 'text-ink')}>
                <Icon className="size-3.5 shrink-0 text-brand/90" aria-hidden="true" />
                <span className="truncate">{meta.name}</span>
              </p>
              <p className={cn('mt-0.5 text-xs leading-relaxed', step.state === 'running' ? 'text-ink/90' : 'text-mute')}>
                {step.label}
                {step.state === 'running' && '…'}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
