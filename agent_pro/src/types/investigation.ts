/**
 * running: waiting for the backend. completed: analysed by the AI model. evidence-only: no AI provider
 * (or it was not used), so only the located code is shown. no-evidence: nothing relevant was found in
 * the repository index. failed: the request or the AI provider failed.
 */
export type InvestigationStatus = 'running' | 'completed' | 'evidence-only' | 'no-evidence' | 'failed'

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'informational'

export type InvestigationConfidence = 'low' | 'medium' | 'high'

export interface CodeEvidence {
  file: string
  language: string
  /** Line number of the first line of `code` in the repository file. */
  startLine: number
  code: string
  /** Lines within the snippet worth emphasising (file numbering). */
  highlightLines?: number[]
}

/** A potential finding. It is a lead to check, not a confirmed bug. */
export interface InvestigationFinding {
  id: string
  title: string
  description: string
  severity: FindingSeverity
  /** 0 to 100. How strongly the evidence supports the lead. */
  confidence: number
  file: string
  line?: number
  impact: string
  recommendation: string
  evidence?: CodeEvidence
}

export interface InvestigationEvent {
  id: string
  /** ISO timestamp. */
  at: string
  stageId: string
  agent: string
  message: string
}

export interface InvestigationLocation {
  path: string
  line?: number
  reason: string
}

export interface Investigation {
  id: string
  title: string
  repositoryId: string
  repositoryName: string
  description: string
  affectedModule?: string
  filePath?: string
  errorMessage?: string
  stackTrace?: string
  status: InvestigationStatus
  createdAt: string
  completedAt?: string
  /** 100 once the backend answered. The backend reports no intermediate progress. */
  progress: number
  currentStageIndex: number
  findings: InvestigationFinding[]
  recommendations: string[]
  /** Steps the backend really performed, with their timestamps. */
  timeline: InvestigationEvent[]
  failureReason?: string

  // ---- analysis returned by the backend ----
  summary?: string
  rootCause?: string
  suggestedSolution?: string
  confidence?: InvestigationConfidence
  /** 0 to 100. */
  confidenceScore?: number
  caveats?: string[]
  locations?: InvestigationLocation[]
  /** Always states that no code was modified. */
  note?: string
  fixApplied?: boolean
  aiUsed?: boolean
  /** Extra explanation, for example that root-cause analysis needs an AI provider. */
  message?: string
}

export interface NewInvestigationInput {
  title: string
  repositoryId: string
  description: string
  affectedModule?: string
  filePath?: string
  errorMessage?: string
  stackTrace?: string
}
