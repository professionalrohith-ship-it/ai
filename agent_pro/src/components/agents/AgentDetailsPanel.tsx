import { ArrowDownToLine, ArrowUpFromLine, Clock } from 'lucide-react'

import type { Agent, AgentTask } from '../../types/agents'
import { formatNumber, timeAgo } from '../../utils/format'
import { AGENT_ICONS } from './agentMeta'
import { AgentStatus } from './AgentStatus'

interface AgentDetailsPanelProps {
  agent: Agent
  tasks: AgentTask[]
}

function duration(ms: number | null): string {
  if (ms === null) return 'in progress'
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

/** Everything about one agent: description, responsibilities, status, tasks and history. */
export function AgentDetailsPanel({ agent, tasks }: AgentDetailsPanelProps) {
  const Icon = AGENT_ICONS[agent.icon]
  const recent = [...tasks].sort((a, b) => b.startedAt.localeCompare(a.startedAt))

  return (
    <div className="space-y-5 p-5 max-sm:p-4">
      <header className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand/12 text-brand ring-1 ring-brand/20">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-ink">{agent.name}</h2>
          <p className="text-xs text-mute">{agent.role}</p>
        </div>
        <AgentStatus status={agent.status} />
      </header>

      <p className="text-sm leading-relaxed text-mute">{agent.description}</p>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-line bg-surface/70 px-2 py-2.5">
          <dt className="text-[0.6875rem] text-mute">Completed</dt>
          <dd className="mt-0.5 text-sm font-semibold text-ink">{formatNumber(agent.tasksCompleted)}</dd>
        </div>
        <div className="rounded-lg border border-line bg-surface/70 px-2 py-2.5">
          <dt className="text-[0.6875rem] text-mute">Failed</dt>
          <dd className="mt-0.5 text-sm font-semibold text-ink">{formatNumber(agent.tasksFailed)}</dd>
        </div>
        <div className="rounded-lg border border-line bg-surface/70 px-2 py-2.5">
          <dt className="text-[0.6875rem] text-mute">Last run</dt>
          <dd className="mt-0.5 truncate text-sm font-semibold text-ink">{timeAgo(agent.lastActivity)}</dd>
        </div>
      </dl>

      <section aria-label="Responsibilities">
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-mute uppercase">Responsibilities</h3>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink/90 marker:text-brand">
          {agent.responsibilities.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section aria-label="Input and output" className="grid grid-cols-1 gap-3">
        <div className="rounded-xl border border-line bg-surface/70 p-3.5">
          <p className="flex items-center gap-2 text-xs font-semibold text-ink">
            <ArrowDownToLine className="size-3.5 text-brand" aria-hidden="true" />
            Input
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-mute">{agent.inputSummary}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface/70 p-3.5">
          <p className="flex items-center gap-2 text-xs font-semibold text-ink">
            <ArrowUpFromLine className="size-3.5 text-brand" aria-hidden="true" />
            Output
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-mute">{agent.outputSummary}</p>
        </div>
      </section>

      <section aria-label="Recent tasks">
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-mute uppercase">Recent tasks</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-mute">No agent has run yet. Ask a question in AI Chat.</p>
        ) : (
          <ul className="space-y-2.5">
            {recent.map((task) => (
              <li key={task.id} className="rounded-xl border border-line bg-surface/70 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm font-medium text-ink">{task.title}</p>
                  <AgentStatus status={task.status} />
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-mute">
                  <span className="font-medium text-ink/80">In:</span> {task.inputSummary}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-mute">
                  <span className="font-medium text-ink/80">Out:</span> {task.outputSummary}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Execution history">
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-mute uppercase">Execution history</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-mute">Nothing to show yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {recent.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-mute">
                  <Clock className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{timeAgo(task.startedAt)}</span>
                </span>
                <span className="font-mono text-ink/80">{duration(task.durationMs)}</span>
                <AgentStatus status={task.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[0.6875rem] leading-relaxed text-[#6f6f6f]">Recorded by the backend each time this agent runs.</p>
    </div>
  )
}
