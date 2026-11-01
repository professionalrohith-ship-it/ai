export type AgentId =
  | 'supervisor'
  | 'repository-explorer'
  | 'architecture-analyst'
  | 'code-intelligence'
  | 'bug-investigator'
  | 'dependency-analyst'
  | 'documentation'

export type AgentExecutionStatus = 'idle' | 'working' | 'completed' | 'failed'

/** Keys resolved to Lucide icons in components/agents/agentIcons.ts. */
export type AgentIconKey = 'supervisor' | 'explorer' | 'architecture' | 'code' | 'bug' | 'dependencies' | 'documentation'

export interface Agent {
  id: AgentId
  name: string
  /** Short label used on diagram nodes and chips. */
  shortName: string
  role: string
  /** One-line purpose. */
  purpose: string
  description: string
  responsibilities: string[]
  icon: AgentIconKey
  status: AgentExecutionStatus
  /** ISO timestamp of the last execution, or null if the agent never ran. */
  lastActivity: string | null
  tasksCompleted: number
  tasksFailed: number
  /** What the agent receives and what it hands back (shown in the details panel). */
  inputSummary: string
  outputSummary: string
}

/** The static part of an agent (what it is). Live numbers are merged in from the run history. */
export type AgentDefinition = Omit<Agent, 'status' | 'lastActivity' | 'tasksCompleted' | 'tasksFailed'>

export interface AgentTask {
  id: string
  agentId: AgentId
  title: string
  status: AgentExecutionStatus
  startedAt: string
  durationMs: number | null
  inputSummary: string
  outputSummary: string
}

export interface AgentActivity {
  id: string
  agentId: AgentId
  message: string
  status: AgentExecutionStatus
  /** Display time such as "09:41". */
  time: string
}

export interface AgentOverview {
  totalAgents: number
  activeAgents: number
  completedTasks: number
  failedTasks: number
}

export interface TaskFlowStage {
  id: string
  label: string
  description: string
  state: 'done' | 'active' | 'pending'
}

export interface AgentMonitorData {
  overview: AgentOverview
  agents: Agent[]
  tasks: AgentTask[]
  timeline: AgentActivity[]
  taskFlow: TaskFlowStage[]
}
