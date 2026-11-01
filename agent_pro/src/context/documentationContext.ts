import { createContext } from 'react'

import type { GeneratedDocument, GenerateDocumentInput } from '../types/documentation'

export type DocumentationLoadStatus = 'loading' | 'ready' | 'error'

export interface DocumentationContextValue {
  /** Newest first, across all registered repositories. */
  documents: GeneratedDocument[]
  status: DocumentationLoadStatus
  error: string | null
  reload: () => void
  generatingCount: number
  getDocument: (id: string) => GeneratedDocument | undefined
  /** Starts generating on the backend and returns the id to navigate to right away. */
  generateDocument: (input: GenerateDocumentInput) => string
  /** Generates the document again from the same inputs. */
  regenerateDocument: (id: string) => void
  deleteDocument: (id: string) => void
  /** Last delete failure, for an inline message. */
  actionError: string | null
}

export const DocumentationContext = createContext<DocumentationContextValue | null>(null)
