import { AI_TIMEOUT_MS, apiRequest } from '../http'
import type {
  CodeEvidence,
  FindingSeverity,
  Investigation,
  InvestigationConfidence,
  InvestigationEvent,
  InvestigationFinding,
  InvestigationLocation,
  InvestigationStatus,
  NewInvestigationInput,
} from '../../types/investigation'

// Investigations are produced and stored by the backend (POST /repositories/{id}/investigations).

interface FindingDto {
  id?: string
  title: string
  description: string
  severity?: FindingSeverity
  confidence?: number
  file?: string
  line?: number | null
  impact?: string
  recommendation?: string
  evidence?: { file: string; language?: string; startLine: number; code: string; highlightLines?: number[] } | null
}

interface InvestigationDto {
  id: string
  repositoryId: string
  title: string
  description: string
  errorMessage?: string | null
  stackTrace?: string | null
  filePath?: string | null
  affectedModule?: string | null
  status: 'completed' | 'failed' | 'evidence_only' | 'no_evidence'
  createdAt: string
  completedAt?: string | null
  summary?: string | null
  rootCause?: string | null
  suggestedSolution?: string | null
  confidence?: InvestigationConfidence | null
  confidenceScore?: number | null
  findings?: FindingDto[]
  recommendations?: string[]
  locations?: { path: string; line?: number | null; reason?: string }[]
  caveats?: string[]
  timeline?: { id: string; at: string; stageId: string; agent: string; message: string }[]
  fixApplied?: boolean
  note?: string | null
  aiUsed?: boolean
  message?: string | null
  failureReason?: string | null
}

const STATUS: Record<InvestigationDto['status'], InvestigationStatus> = {
  completed: 'completed',
  failed: 'failed',
  evidence_only: 'evidence-only',
  no_evidence: 'no-evidence',
}

const SEVERITIES: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'informational']

function toEvidence(evidence: FindingDto['evidence']): CodeEvidence | undefined {
  if (!evidence) return undefined
  return {
    file: evidence.file,
    language: evidence.language ?? 'text',
    startLine: evidence.startLine,
    code: evidence.code,
    highlightLines: evidence.highlightLines,
  }
}

function toFinding(dto: FindingDto, index: number): InvestigationFinding {
  return {
    id: dto.id ?? `finding-${index}`,
    title: dto.title,
    description: dto.description,
    severity: dto.severity && SEVERITIES.includes(dto.severity) ? dto.severity : 'informational',
    confidence: Math.max(0, Math.min(100, Math.round(dto.confidence ?? 0))),
    file: dto.file ?? dto.evidence?.file ?? '',
    line: dto.line ?? undefined,
    impact: dto.impact ?? '',
    recommendation: dto.recommendation ?? '',
    evidence: toEvidence(dto.evidence),
  }
}

export function toInvestigation(dto: InvestigationDto, repositoryName: string): Investigation {
  const timeline: InvestigationEvent[] = (dto.timeline ?? []).map((event) => ({ ...event }))
  const locations: InvestigationLocation[] = (dto.locations ?? []).map((location) => ({
    path: location.path,
    line: location.line ?? undefined,
    reason: location.reason ?? '',
  }))
  return {
    id: dto.id,
    title: dto.title,
    repositoryId: dto.repositoryId,
    repositoryName,
    description: dto.description,
    affectedModule: dto.affectedModule ?? undefined,
    filePath: dto.filePath ?? undefined,
    errorMessage: dto.errorMessage ?? undefined,
    stackTrace: dto.stackTrace ?? undefined,
    status: STATUS[dto.status] ?? 'completed',
    createdAt: dto.createdAt,
    completedAt: dto.completedAt ?? undefined,
    progress: 100,
    currentStageIndex: timeline.length,
    findings: (dto.findings ?? []).map(toFinding),
    recommendations: dto.recommendations ?? [],
    timeline,
    failureReason: dto.failureReason ?? undefined,
    summary: dto.summary ?? undefined,
    rootCause: dto.rootCause ?? undefined,
    suggestedSolution: dto.suggestedSolution ?? undefined,
    confidence: dto.confidence ?? undefined,
    confidenceScore: dto.confidenceScore ?? undefined,
    caveats: dto.caveats ?? [],
    locations,
    note: dto.note ?? undefined,
    fixApplied: dto.fixApplied ?? false,
    aiUsed: dto.aiUsed ?? false,
    message: dto.message ?? undefined,
  }
}

/** A placeholder shown while the backend works. The real record replaces it when the request ends. */
export function createInvestigationRecord(input: NewInvestigationInput, repositoryName: string): Investigation {
  return {
    id: `inv-local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title: input.title.trim(),
    repositoryId: input.repositoryId,
    repositoryName,
    description: input.description.trim(),
    affectedModule: input.affectedModule?.trim() || undefined,
    filePath: input.filePath?.trim() || undefined,
    errorMessage: input.errorMessage?.trim() || undefined,
    stackTrace: input.stackTrace?.trim() || undefined,
    status: 'running',
    createdAt: new Date().toISOString(),
    progress: 0,
    currentStageIndex: 0,
    findings: [],
    recommendations: [],
    timeline: [],
  }
}

export const isLocalInvestigation = (id: string) => id.startsWith('inv-local-')

export const investigationsApi = {
  async list(repositoryId: string, repositoryName: string): Promise<Investigation[]> {
    const list = await apiRequest<InvestigationDto[]>(`/repositories/${encodeURIComponent(repositoryId)}/investigations`)
    return list.map((dto) => toInvestigation(dto, repositoryName))
  },

  /** Runs one investigation. The request returns when the analysis is finished. */
  async run(input: NewInvestigationInput, repositoryName: string): Promise<Investigation> {
    const dto = await apiRequest<InvestigationDto>(`/repositories/${encodeURIComponent(input.repositoryId)}/investigations`, {
      method: 'POST',
      body: {
        title: input.title.trim(),
        description: input.description.trim(),
        errorMessage: input.errorMessage?.trim() || undefined,
        stackTrace: input.stackTrace?.trim() || undefined,
        filePath: input.filePath?.trim() || undefined,
        affectedModule: input.affectedModule?.trim() || undefined,
      },
      timeoutMs: AI_TIMEOUT_MS,
    })
    return toInvestigation(dto, repositoryName)
  },

  remove: (id: string) => apiRequest<void>(`/investigations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
