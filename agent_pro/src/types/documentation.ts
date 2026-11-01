export type DocumentationType = 'project-overview' | 'architecture' | 'module' | 'api' | 'dependency-report'

export type DocumentationStatus = 'generating' | 'ready' | 'failed'

export type DocumentationFormat = 'markdown'

export interface GeneratedDocument {
  id: string
  title: string
  type: DocumentationType
  repositoryId: string
  repositoryName: string
  /** Directory path for module documentation. */
  module?: string
  instructions?: string
  format: DocumentationFormat
  /** Markdown source. Empty while generating. */
  content: string
  status: DocumentationStatus
  /** 0 while generating (the backend reports no live progress), 100 when finished. */
  progress: number
  createdAt: string
  updatedAt: string
  failureReason?: string
  /** true when the AI model wrote an extra summary section on top of the repository facts. */
  aiEnhanced?: boolean
  /** Backend notes, for example that no AI summary was added. */
  warnings?: string[]
}

export interface GenerateDocumentInput {
  repositoryId: string
  type: DocumentationType
  module?: string
  instructions?: string
  format: DocumentationFormat
  /** Ask the backend to add an AI-written summary when a provider is configured (default true). */
  useAi?: boolean
}

export interface DocumentationTypeInfo {
  id: DocumentationType
  label: string
  description: string
}
