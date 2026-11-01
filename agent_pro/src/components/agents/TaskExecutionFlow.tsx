import { ArrowDown, ArrowRight, Check } from 'lucide-react'
import { Fragment } from 'react'

import type { TaskFlowStage } from '../../types/agents'
import { cn } from '../../utils/cn'

/** How a request moves through the system: stages in a row on wide screens, a column on narrow ones. */
export function TaskExecutionFlow({ stages }: { stages: TaskFlowStage[] }) {
  return (
    <ol className="flex flex-row items-stretch gap-1 @max-[56rem]:flex-col @max-[56rem]:items-stretch">
      {stages.map((stage, index) => (
        <Fragment key={stage.id}>
          <li
            aria-current={stage.state === 'active' ? 'step' : undefined}
            className={cn(
              'flex min-w-0 flex-1 flex-col rounded-xl border p-3.5 transition',
              stage.state === 'done' && 'border-ok/25 bg-ok/5',
              stage.state === 'active' && 'border-brand/60 bg-brand/8 shadow-glow',
              stage.state === 'pending' && 'border-line bg-surface/60',
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full text-[0.6875rem] font-bold',
                  stage.state === 'done' && 'bg-ok/20 text-ok',
                  stage.state === 'active' && 'bg-brand text-white',
                  stage.state === 'pending' && 'bg-white/8 text-mute',
                )}
              >
                {stage.state === 'done' ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
              </span>
              <p className={cn('text-[0.8125rem] leading-tight font-semibold', stage.state === 'pending' ? 'text-mute' : 'text-ink')}>
                {stage.label}
              </p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-mute">{stage.description}</p>
            {stage.state === 'active' && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold text-brand">
                <span className="size-1.5 animate-pulse-dot rounded-full bg-brand" aria-hidden="true" />
                Current stage
              </p>
            )}
          </li>
          {index < stages.length - 1 && (
            <li aria-hidden="true" className="grid shrink-0 place-items-center text-[#5c5c5c]">
              <ArrowRight className="size-4 @max-[56rem]:hidden" />
              <ArrowDown className="hidden size-4 @max-[56rem]:block" />
            </li>
          )}
        </Fragment>
      ))}
    </ol>
  )
}
