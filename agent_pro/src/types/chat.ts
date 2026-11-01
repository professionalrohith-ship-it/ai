import type { AgentId } from './agents'

export type MessageRole = 'user' | 'assistant'

/** streaming = the backend is still working on this answer. */
export type MessageStatus = 'complete' | 'streaming' | 'error'

export type StepState = 'pending' | 'running' | 'done'

/** One step the Supervisor reported for an answer (taken from the backend, never invented). */
export interface AgentStepRecord {
  id: string
  agentId: AgentId
  label: string
  state: StepState
}

export interface ReferencedFile {
  path: string
  line?: number
  /** Why this file is relevant to the answer. */
  reason: string
}

export interface ChatMessage {
  id: string
  role: MessageRole
  /** Markdown for assistant messages, plain text for user messages. */
  content: string
  createdAt: string
  status: MessageStatus
  files?: ReferencedFile[]
  agentSteps?: AgentStepRecord[]
  /** Agent that produced the answer. */
  agent?: AgentId
  /** Why the Supervisor picked that agent. */
  routeReason?: string
  /** Backend checks that did not pass (for example a cited file that does not exist). */
  warnings?: string[]
  errorMessage?: string
}

export interface ChatConversation {
  id: string
  title: string
  repositoryId: string | null
  repositoryName: string | null
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
  /** Number of stored messages (known before the messages themselves are loaded). */
  messageCount?: number
  /** false until the messages have been fetched from the backend. */
  loaded: boolean
  loadError?: string
}

export interface SuggestedPromptData {
  id: string
  text: string
  icon: 'architecture' | 'auth' | 'api' | 'problems' | 'database' | 'overview'
}
