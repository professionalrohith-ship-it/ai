import { Activity, Bot, CircleAlert, CircleCheck, CircleX, Info, RefreshCw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'

import { AgentCard } from '../../components/agents/AgentCard'
import { AgentDetailsPanel } from '../../components/agents/AgentDetailsPanel'
import { AgentDiagram } from '../../components/agents/AgentDiagram'
import { AgentTimeline } from '../../components/agents/AgentTimeline'
import { TaskExecutionFlow } from '../../components/agents/TaskExecutionFlow'
import { EmptyState } from '../../components/common/EmptyState'
import { Skeleton } from '../../components/common/LoadingState'
import { PageHeader } from '../../components/common/PageHeader'
import { SectionCard } from '../../components/common/SectionCard'
import { StatCard } from '../../components/common/StatCard'
import { Drawer } from '../../components/ui/Drawer'
import { PrimaryButton } from '../../components/ui/PrimaryButton'
import { useAgentMonitorData } from '../../hooks/useAgentMonitorData'
import { useElementWidth } from '../../hooks/useChatLayout'
import type { AgentId } from '../../types/agents'
import { formatNumber } from '../../utils/format'
import './AgentMonitor.css'

/** Page width at which the agent details panel can sit beside the agent cards. */
const INLINE_DETAILS_MIN_WIDTH = 1000

function MonitorSkeleton() {
  return (
    <div role="status" aria-label="Loading agent monitor" className="space-y-6">
      <div className="grid grid-cols-4 gap-3 @max-[56rem]:grid-cols-2 @max-[28rem]:grid-cols-1">
        {Array.from({ length: 4 }, (_, index) => (
          <StatCard key={index} label="" value="" icon={Bot} loading />
        ))}
      </div>
      <Skeleton className="h-[30rem]" />
      <Skeleton className="h-40" />
    </div>
  )
}

export default function AgentMonitor() {
  const { status, data, ai, error, reload } = useAgentMonitorData()
  const [selectedId, setSelectedId] = useState<AgentId>('supervisor')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [pageRef, width] = useElementWidth<HTMLDivElement>(1200)
  const inlineDetails = width >= INLINE_DETAILS_MIN_WIDTH

  const selected = data?.agents.find((agent) => agent.id === selectedId) ?? null
  const selectedTasks = data?.tasks.filter((task) => task.agentId === selectedId) ?? []

  const select = (id: AgentId) => {
    setSelectedId(id)
    if (!inlineDetails) setDrawerOpen(true)
  }

  const details = selected && <AgentDetailsPanel agent={selected} tasks={selectedTasks} />

  return (
    <div ref={pageRef} className="animate-fade-up space-y-6">
      <PageHeader
        title="Agent Monitor"
        description="See the Supervisor Agent and its specialist agents, what each one has done, and how a request moves through the system."
      />

      {ai && (
        <div
          className={`flex items-start gap-2.5 rounded-lg border p-3 text-xs leading-relaxed text-mute ${
            ai.configured ? 'border-brand/20 bg-brand/5' : 'border-warn/30 bg-warn/5'
          }`}
        >
          {ai.configured ? (
            <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
          ) : (
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
          )}
          <p>
            <span className="font-semibold text-ink">
              {ai.configured ? `AI provider: ${ai.provider} / ${ai.model}.` : 'No AI provider configured.'}
            </span>{' '}
            {ai.configured ? 'Every run below was recorded by the backend.' : ai.message}
          </p>
        </div>
      )}

      {status === 'loading' && <MonitorSkeleton />}

      {status === 'error' && (
        <EmptyState
          tone="error"
          icon={CircleAlert}
          title="We could not load the agent data"
          description={error ?? 'Something went wrong while loading the Agent Monitor.'}
          action={
            <PrimaryButton icon={<RefreshCw className="size-4" aria-hidden="true" />} onClick={reload}>
              Try again
            </PrimaryButton>
          }
        />
      )}

      {status === 'ready' && data && (
        <>
          <section aria-label="Agent summary" className="grid grid-cols-4 gap-3 @max-[56rem]:grid-cols-2 @max-[28rem]:grid-cols-1">
            <StatCard label="Total Agents" value={formatNumber(data.overview.totalAgents)} hint="Supervisor plus six specialists" icon={Bot} />
            <StatCard label="Agents Used" value={formatNumber(data.overview.activeAgents)} hint="Specialists that handled a request" icon={Activity} />
            <StatCard label="Completed Tasks" value={formatNumber(data.overview.completedTasks)} hint="Runs that returned a result" icon={CircleCheck} />
            <StatCard label="Failed Tasks" value={formatNumber(data.overview.failedTasks)} hint="Runs that ended in an error" icon={CircleX} />
          </section>

          <SectionCard
            title="Supervisor and specialist agents"
            description="The Supervisor receives each request and coordinates the specialists. Select an agent to see its details."
          >
            <AgentDiagram agents={data.agents} selectedId={selectedId} onSelect={select} />
          </SectionCard>

          <SectionCard title="How a request moves through the system" description={data.timeline.length === 0 ? 'The stages every request goes through' : 'The stages of the most recent request'}>
            <TaskExecutionFlow stages={data.taskFlow} />
          </SectionCard>

          <div className={inlineDetails ? 'grid grid-cols-[minmax(0,1fr)_24rem] items-start gap-5' : 'block space-y-6'}>
            <div className="@container min-w-0 space-y-6">
              <section aria-label="Agents">
                <h2 className="mb-3 text-sm font-semibold text-ink">Agents ({data.agents.length})</h2>
                <div className="grid grid-cols-2 gap-3 @max-[34rem]:grid-cols-1">
                  {data.agents.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} selected={agent.id === selectedId} onSelect={select} />
                  ))}
                </div>
              </section>

              <SectionCard title="Agent execution timeline" description="The most recent agent runs, oldest first">
                {data.timeline.length === 0 ? (
                  <p className="text-sm text-mute">No agent has run yet. Ask a question in AI Chat.</p>
                ) : (
                  <AgentTimeline items={data.timeline} />
                )}
              </SectionCard>
            </div>

            {inlineDetails && (
              <aside
                aria-label="Agent details"
                className="sticky top-20 max-h-[calc(100dvh/var(--zf,1)-7rem)] overflow-y-auto rounded-card border border-line bg-card shadow-card"
              >
                {details}
              </aside>
            )}
          </div>

          {!inlineDetails && (
            <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={selected?.name ?? 'Agent details'}>
              {details}
            </Drawer>
          )}
        </>
      )}
    </div>
  )
}
