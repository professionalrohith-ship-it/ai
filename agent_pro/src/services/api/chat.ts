import { AI_TIMEOUT_MS, apiRequest } from '../http'
import type { AgentId } from '../../types/agents'
import type { AgentStepRecord, ChatConversation, ChatMessage, ReferencedFile } from '../../types/chat'

// Chat is stored by the backend (conversations + messages) and answered by the Supervisor agent.

interface MessageDto {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  agent?: string | null
  files?: { path: string; line?: number | null; reason?: string }[]
  warnings?: string[]
  error?: string | null
}

interface ConversationSummaryDto {
  id: string
  title: string
  repositoryId: string
  createdAt: string
  updatedAt: string
  messageCount: number
}

interface ConversationDto extends ConversationSummaryDto {
  messages: MessageDto[]
}

interface ChatResponseDto {
  conversationId: string
  userMessage: MessageDto
  assistantMessage: MessageDto
  agent: string
  routeReason?: string
  steps?: { agentId: string; label: string }[]
  warnings?: string[]
  status?: string
}

export interface ChatReply {
  conversationId: string
  userMessage: ChatMessage
  assistantMessage: ChatMessage
}

const files = (dto: MessageDto): ReferencedFile[] =>
  (dto.files ?? []).map((file) => ({ path: file.path, line: file.line ?? undefined, reason: file.reason ?? 'Referenced in the answer' }))

export function toMessage(dto: MessageDto): ChatMessage {
  return {
    id: dto.id,
    role: dto.role,
    content: dto.content,
    createdAt: dto.createdAt,
    status: dto.error ? 'error' : 'complete',
    errorMessage: dto.error ?? undefined,
    files: dto.role === 'assistant' ? files(dto) : undefined,
    agent: (dto.agent as AgentId | null | undefined) ?? undefined,
    warnings: dto.warnings && dto.warnings.length > 0 ? dto.warnings : undefined,
  }
}

const toConversation = (dto: ConversationSummaryDto, repositoryName: string | null): ChatConversation => ({
  id: dto.id,
  title: dto.title,
  repositoryId: dto.repositoryId,
  repositoryName,
  createdAt: dto.createdAt,
  updatedAt: dto.updatedAt,
  messages: [],
  messageCount: dto.messageCount,
  loaded: dto.messageCount === 0,
})

export const chatApi = {
  async listConversations(repositoryId: string, repositoryName: string | null): Promise<ChatConversation[]> {
    const list = await apiRequest<ConversationSummaryDto[]>(`/repositories/${encodeURIComponent(repositoryId)}/conversations`)
    return list.map((dto) => toConversation(dto, repositoryName))
  },

  async getConversation(id: string, repositoryName: string | null): Promise<ChatConversation> {
    const dto = await apiRequest<ConversationDto>(`/conversations/${encodeURIComponent(id)}`)
    return { ...toConversation(dto, repositoryName), messages: dto.messages.map(toMessage), loaded: true }
  },

  /** Sends one question. Rejects with ApiRequestError (503 = AI not configured, 502 = provider failed, 409 = scan first). */
  async send(repositoryId: string, message: string, conversationId?: string): Promise<ChatReply> {
    const response = await apiRequest<ChatResponseDto>(`/repositories/${encodeURIComponent(repositoryId)}/chat`, {
      method: 'POST',
      body: { message, conversationId },
      timeoutMs: AI_TIMEOUT_MS,
    })
    const steps: AgentStepRecord[] = (response.steps ?? []).map((step, index) => ({
      id: `${response.assistantMessage.id}-step-${index}`,
      agentId: step.agentId as AgentId,
      label: step.label,
      state: 'done',
    }))
    const assistant = toMessage(response.assistantMessage)
    return {
      conversationId: response.conversationId,
      userMessage: toMessage(response.userMessage),
      assistantMessage: {
        ...assistant,
        agent: (response.agent as AgentId) ?? assistant.agent,
        routeReason: response.routeReason,
        agentSteps: steps,
        warnings: [...(assistant.warnings ?? []), ...(response.warnings ?? []).filter((w) => !(assistant.warnings ?? []).includes(w))],
      },
    }
  },

  rename: (id: string, title: string) =>
    apiRequest<unknown>(`/conversations/${encodeURIComponent(id)}`, { method: 'PATCH', body: { title } }),

  remove: (id: string) => apiRequest<void>(`/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
