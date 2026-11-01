import { Check, CircleAlert, Loader2, Minus } from 'lucide-react'

import type { AgentActivity, AgentExecutionStatus } from '../../types/agents'
import { cn } from '../../utils/cn'
import { AGENT_META } from './agentMeta'

const MARKER: Record<AgentExecutionStatus, { box: string; icon: typeof Check; spin?: boolean }> = {
  completed: { box: 'border-ok/40 bg-ok/15 text-ok', icon: Check },
  working: { box: 'border-brand/50 bg-brand/15 text-brand', icon: Loader2, spin: true },
  failed: { box: 'border-danger/40 bg-danger/15 text-danger', icon: CircleAlert },
  idle: { box: 'border-line bg-surface text-mute', icon: Minus },
}

/** Chronological list of recorded agent activity. */
export function AgentTimeline({ items }: { items: AgentActivity[] }) {
  return (
    <ol>
      {items.map((item, index) => {
        const marker = MARKER[item.status]
        const MarkerIcon = marker.icon
        const meta = AGENT_META[item.agentId]
        return (
          <li key={item.id} className="relative flex gap-3.5 pb-5 last:pb-0">
            {index < items.length - 1 && <span className="absolute top-7 bottom-0 left-[0.8125rem] w-px bg-line" aria-hidden="true" />}
            <span className={cn('relative z-10 grid size-[1.75rem] shrink-0 place-items-center rounded-full border', marker.box)}>
              <MarkerIcon className={cn('size-3.5', marker.spin && 'animate-spin')} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <time className="font-mono text-xs font-semibold text-brand">{item.time}</time>
                <span className="text-xs font-semibold text-ink">{meta.name}</span>
              </div>
              <p className="mt-0.5 text-sm leading-relaxed text-mute">{item.message}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
