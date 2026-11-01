import { AI_TIMEOUT_MS, apiRequest, apiUrl } from '../http'
import type { DocumentationType, GeneratedDocument, GenerateDocumentInput } from '../../types/documentation'

// Documents are generated and stored by the backend (POST /repositories/{id}/documentation).

interface DocumentDto {
  id: string
  title: string
  type: DocumentationType
  repositoryId: string
  repositoryName?: string
  module?: string | null
  instructions?: string | null
  format?: 'markdown'
  content: string
  status: 'ready' | 'failed'
  aiEnhanced?: boolean
  warnings?: string[]
  createdAt: string
  updatedAt: string
  failureReason?: string | null
}

export function toDocument(dto: DocumentDto, repositoryName: string): GeneratedDocument {
  return {
    id: dto.id,
    title: dto.title,
    type: dto.type,
    repositoryId: dto.repositoryId,
    repositoryName: dto.repositoryName || repositoryName,
    module: dto.module ?? undefined,
    instructions: dto.instructions ?? undefined,
    format: 'markdown',
    content: dto.content ?? '',
    status: dto.status,
    progress: 100,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    failureReason: dto.failureReason ?? undefined,
    aiEnhanced: dto.aiEnhanced ?? false,
    warnings: dto.warnings ?? [],
  }
}

/** A placeholder shown while the backend works. The stored document replaces it when the request ends. */
export function createDocumentRecord(input: GenerateDocumentInput, repositoryName: string, title: string): GeneratedDocument {
  const now = new Date().toISOString()
  return {
    id: `doc-local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title,
    type: input.type,
    repositoryId: input.repositoryId,
    repositoryName,
    module: input.module,
    instructions: input.instructions?.trim() || undefined,
    format: input.format,
    content: '',
    status: 'generating',
    progress: 0,
    createdAt: now,
    updatedAt: now,
  }
}

export const isLocalDocument = (id: string) => id.startsWith('doc-local-')

export const documentationApi = {
  async list(repositoryId: string, repositoryName: string): Promise<GeneratedDocument[]> {
    const list = await apiRequest<DocumentDto[]>(`/repositories/${encodeURIComponent(repositoryId)}/documentation`)
    return list.map((dto) => toDocument(dto, repositoryName))
  },

  /** Generates one document. Returns when it is finished (an AI summary can take minutes on a local model). */
  async generate(input: GenerateDocumentInput, repositoryName: string): Promise<GeneratedDocument> {
    const dto = await apiRequest<DocumentDto>(`/repositories/${encodeURIComponent(input.repositoryId)}/documentation`, {
      method: 'POST',
      body: {
        type: input.type,
        module: input.module,
        instructions: input.instructions?.trim() || undefined,
        useAi: input.useAi ?? true,
      },
      timeoutMs: AI_TIMEOUT_MS,
    })
    return toDocument(dto, repositoryName)
  },

  remove: (id: string) => apiRequest<void>(`/documentation/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /** Direct link to the backend export (Markdown file). */
  exportUrl: (id: string, format: 'md' | 'json' = 'md') => apiUrl(`/documentation/${encodeURIComponent(id)}/export?format=${format}`),
}
