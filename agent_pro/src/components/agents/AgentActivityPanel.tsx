import { Workflow } from 'lucide-react'

import type { AgentStepRecord, MessageStatus } from '../../types/chat'
import { Badge } from '../ui/Badge'
import { ExecutionProgress } from './ExecutionProgress'

interface AgentActivityPanelProps {
  steps: AgentStepRecord[]
  /** Status of the answer the steps belong to; null when there is nothing yet. */
  status: MessageStatus | null
  /** Agent the Supervisor picked, and why (both come from the backend). */
  agentName?: string | null
  routeReason?: string | null
}

/** Right-hand panel in the chat: which agent handled the latest answer and the steps it reported. */
export function AgentActivityPanel({ steps, status, agentName = null, routeReason = null }: AgentActivityPanelProps) {
  return (
    <section aria-label="Agent activity" className="px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Agent activity</h3>
        {agentName && status === 'complete' && <Badge tone="ok">{agentName}</Badge>}
        {status === 'streaming' && <Badge tone="brand" pulse>Working</Badge>}
      </div>

      {status === 'streaming' ? (
        <p className="text-xs leading-relaxed text-mute">
          The Supervisor is choosing an agent, collecting evidence from the repository index and waiting for the AI model.
        </p>
      ) : steps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface/50 px-4 py-6 text-center">
          <Workflow className="mx-auto size-6 text-mute" aria-hidden="true" />
          <p className="mt-2 text-xs leading-relaxed text-mute">
            {status === 'error'
              ? 'The last answer failed before any agent finished.'
              : 'When you ask a question, the agent the Supervisor selected and its steps appear here.'}
          </p>
        </div>
      ) : (
        <>
          {routeReason && <p className="mb-3 text-xs leading-relaxed text-mute">{routeReason}</p>}
          <ExecutionProgress steps={steps} />
        </>
      )}
    </section>
  )
}
