import { apiRequest } from '../http'

/** What GET /api/ai/status returns. The API key is never part of it. */
export interface AiStatus {
  configured: boolean
  provider: string | null
  model: string | null
  /** Host only, for display. */
  endpoint: string | null
  /** Human-readable explanation. When not configured it says exactly how to configure a provider. */
  message: string
  /** null until a connectivity check was requested. */
  reachable: boolean | null
  detail?: string | null
}

export const getAiStatus = (check = false) => apiRequest<AiStatus>(`/ai/status${check ? '?check=true' : ''}`, { timeoutMs: check ? 30_000 : 10_000 })

/** The six specialised agents the backend offers (GET /api/ai/agents). */
export interface AgentInfo {
  id: string
  name: string
  role: string
  description: string
  usesAi: boolean
}

export const listAgents = () => apiRequest<AgentInfo[]>('/ai/agents')
