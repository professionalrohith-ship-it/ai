import { createContext } from 'react'

import type { Investigation, NewInvestigationInput } from '../types/investigation'

export type InvestigationLoadStatus = 'loading' | 'ready' | 'error'

export interface InvestigationContextValue {
  /** Newest first, across all registered repositories. */
  investigations: Investigation[]
  status: InvestigationLoadStatus
  error: string | null
  reload: () => void
  runningCount: number
  getInvestigation: (id: string) => Investigation | undefined
  /** Starts an investigation on the backend and returns the id to navigate to right away. */
  startInvestigation: (input: NewInvestigationInput) => string
  /** Runs a failed (or finished) investigation again with the same input. */
  retryInvestigation: (id: string) => void
  deleteInvestigation: (id: string) => void
  /** Last delete failure, for an inline message. */
  actionError: string | null
}

export const InvestigationContext = createContext<InvestigationContextValue | null>(null)
