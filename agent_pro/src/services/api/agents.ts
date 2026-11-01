import { AGENT_DEFINITIONS } from '../../constants/agents'
import type { Agent, AgentActivity, AgentExecutionStatus, AgentId, AgentMonitorData, AgentTask, TaskFlowStage } from '../../types/agents'
import { apiRequest } from '../http'

// Agent Monitor data. The agent descriptions are static (constants/agents.ts); everything that changes
// (task counts, last run, status, tasks, timeline) is computed from the backend's agent run history.

/** One row of GET /api/agent-runs. */
export interface AgentRunRecord {
  id: string
  repositoryId: string
  repositoryName?: string | null
  agent: string
  question: string
  status: 'completed' | 'failed' | 'evidence_only' | 'no_evidence' | 'unavailable'
  routeReason?: string | null
  provider?: string | null
  model?: string | null
  startedAt: string
  durationMs?: number | null
  evidenceCount?: number | null
  error?: string | null
  conversationId?: string | null
}

export interface AgentsApi {
  getMonitorData(): Promise<AgentMonitorData>
}

export const listAgentRuns = (limit = 200) => apiRequest<AgentRunRecord[]>(`/agent-runs?limit=${limit}`)

const KNOWN_IDS = new Set<string>(AGENT_DEFINITIONS.map((agent) => agent.id))

const isFailure = (run: AgentRunRecord) => run.status === 'failed' || run.status === 'unavailable'
const executionStatus = (run: AgentRunRecord): AgentExecutionStatus => (isFailure(run) ? 'failed' : 'completed')

function shorten(text: string, length = 90): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > length ? `${clean.slice(0, length - 1)}…` : clean
}

function outputSummary(run: AgentRunRecord): string {
  const evidence = `${run.evidenceCount ?? 0} piece(s) of repository evidence`
  switch (run.status) {
    case 'completed':
      return `Answered using ${evidence}${run.model ? ` with ${run.provider ?? 'AI'} / ${run.model}` : ''}.`
    case 'evidence_only':
      return `Returned ${evidence} only: no AI provider was available to write an analysis.`
    case 'no_evidence':
      return 'No relevant code was found in the repository index, so the model was not called.'
    case 'unavailable':
      return run.error ?? 'No AI provider is configured.'
    default:
      return run.error ?? 'The run failed.'
  }
}

function toTask(run: AgentRunRecord, agentId: AgentId, supervisor: boolean): AgentTask {
  return {
    id: `${run.id}:${agentId}`,
    agentId,
    title: shorten(run.question, 80),
    status: executionStatus(run),
    startedAt: run.startedAt,
    durationMs: run.durationMs ?? null,
    inputSummary: supervisor ? `Request: ${shorten(run.question, 120)}` : `Question: ${shorten(run.question, 120)}`,
    outputSummary: supervisor ? `Routed to ${run.agent}${run.routeReason ? `: ${run.routeReason}` : ''}` : outputSummary(run),
  }
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

function buildAgents(runs: AgentRunRecord[]): Agent[] {
  return AGENT_DEFINITIONS.map((definition) => {
    // every request passes through the supervisor, so it counts all runs
    const own = definition.id === 'supervisor' ? runs : runs.filter((run) => run.agent === definition.id)
    const latest = own.reduce<AgentRunRecord | null>((best, run) => (!best || run.startedAt > best.startedAt ? run : best), null)
    return {
      ...definition,
      status: latest ? executionStatus(latest) : 'idle',
      lastActivity: latest?.startedAt ?? null,
      tasksCompleted: own.filter((run) => !isFailure(run)).length,
      tasksFailed: own.filter(isFailure).length,
    }
  })
}

/** The supervisor's real stages, with their state taken from the most recent run. */
function buildTaskFlow(latest: AgentRunRecord | null): TaskFlowStage[] {
  const base: Omit<TaskFlowStage, 'state'>[] = [
    { id: 'request', label: 'Request received', description: 'A question or task arrives from AI Chat, Bug Investigation or Documentation.' },
    { id: 'route', label: 'Supervisor routing', description: 'The supervisor picks one specialist agent from the request.' },
    { id: 'evidence', label: 'Evidence gathering', description: 'The agent collects symbols, code and dependency facts from the repository index.' },
    { id: 'answer', label: 'Answer generation', description: 'The configured AI provider writes an answer from that evidence.' },
    { id: 'result', label: 'Result returned', description: 'The answer is saved with the files it cites.' },
  ]
  if (!latest) return base.map((stage) => ({ ...stage, state: 'pending' as const }))
  const modelSkipped = latest.status === 'no_evidence' || latest.status === 'evidence_only' || latest.status === 'unavailable'
  return base.map((stage) => {
    if (stage.id !== 'answer') return { ...stage, state: 'done' as const }
    if (latest.status === 'failed') return { ...stage, description: `Failed: ${shorten(latest.error ?? 'the AI provider returned an error', 110)}`, state: 'pending' as const }
    if (modelSkipped) return { ...stage, description: `Skipped: ${outputSummary(latest)}`, state: 'pending' as const }
    return { ...stage, state: 'done' as const }
  })
}

export function buildMonitorData(runs: AgentRunRecord[]): AgentMonitorData {
  const known = runs.filter((run) => KNOWN_IDS.has(run.agent))
  const agents = buildAgents(known)
  const newestFirst = [...known].sort((a, b) => b.startedAt.localeCompare(a.startedAt))

  const tasks = newestFirst.slice(0, 60).flatMap((run) => [toTask(run, run.agent as AgentId, false), toTask(run, 'supervisor', true)])
  const timeline: AgentActivity[] = newestFirst
    .slice(0, 10)
    .reverse()
    .map((run) => ({
      id: run.id,
      agentId: run.agent as AgentId,
      message: `${shorten(run.question, 100)}: ${outputSummary(run)}`,
      status: executionStatus(run),
      time: clock(run.startedAt),
    }))

  return {
    overview: {
      totalAgents: agents.length,
      // Runs are synchronous, so "active" has no live meaning: this counts the specialists that have handled a request.
      activeAgents: agents.filter((agent) => agent.id !== 'supervisor' && agent.lastActivity !== null).length,
      completedTasks: known.filter((run) => !isFailure(run)).length,
      failedTasks: known.filter(isFailure).length,
    },
    agents,
    tasks,
    timeline,
    taskFlow: buildTaskFlow(newestFirst[0] ?? null),
  }
}

export const agentsApi: AgentsApi = {
  async getMonitorData() {
    return buildMonitorData(await listAgentRuns(200))
  },
}
