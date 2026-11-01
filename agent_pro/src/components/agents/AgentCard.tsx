import { CircleCheck, Clock } from 'lucide-react'

import type { Agent } from '../../types/agents'
import { cn } from '../../utils/cn'
import { formatNumber, timeAgo } from '../../utils/format'
import { AGENT_ICONS } from './agentMeta'
import { AgentStatus } from './AgentStatus'

interface AgentCardProps {
  agent: Agent
  selected: boolean
  onSelect: (id: Agent['id']) => void
}

export function AgentCard({ agent, selected, onSelect }: AgentCardProps) {
  const Icon = AGENT_ICONS[agent.icon]
  return (
    <button
      type="button"
      onClick={() => onSelect(agent.id)}
      aria-pressed={selected}
      aria-label={`${agent.name}, ${agent.status}${selected ? ', selected' : ''}`}
      className={cn(
        'group flex w-full min-w-0 flex-col rounded-card border bg-card p-4 text-left shadow-card transition duration-300',
        'hover:-translate-y-0.5 hover:bg-card-hover',
        selected ? 'border-brand/70 shadow-glow' : 'border-line hover:border-[#454545]',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-xl ring-1 transition',
            selected ? 'bg-brand text-white ring-brand' : 'bg-brand/10 text-brand ring-brand/20',
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-ink">{agent.name}</h3>
          <p className="truncate text-xs text-mute">{agent.role}</p>
        </div>
        <AgentStatus status={agent.status} />
      </div>
      <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-mute">{agent.description}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-line pt-3 text-xs text-mute">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-3.5" aria-hidden="true" />
          Last run {timeAgo(agent.lastActivity)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CircleCheck className="size-3.5 text-ok" aria-hidden="true" />
          {formatNumber(agent.tasksCompleted)} tasks
        </span>
      </div>
    </button>
  )
}
