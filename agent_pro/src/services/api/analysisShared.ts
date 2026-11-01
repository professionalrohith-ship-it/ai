import type { AnalysisResult } from '../../types/architecture'
import { apiRequest, errorMessage } from '../http'

// Backend calls and checks shared by the Architecture and Dependencies views.

/** The fields of GET /api/repositories/{id} that the analysis views need. */
export interface RepositoryState {
  id: string
  name: string
  status: 'indexed' | 'indexing' | 'not-indexed' | 'error'
  lastAnalysed: string | null
  parsed?: boolean
  lastParsedAt?: string | null
  lastError?: string | null
}

export interface CircularGroup {
  size: number
  files: string[]
  truncated: boolean
  exampleCycle: string[]
}

export interface ImportantModule {
  path: string
  language: string | null
  fanIn: number
  fanOut: number
  transitiveDependents?: number | null
}

/** GET /api/repositories/{id}/graph/stats (the parts the UI shows). */
export interface GraphStatsResponse {
  files: number
  internalEdges: number
  externalPackages: number
  isAcyclic: boolean
  importantModules: ImportantModule[]
  circularDependencies: CircularGroup[]
  cycleNote: string
}

/** GET /api/repositories/{id}/dependencies (the parts the UI shows). */
export interface DependencySummaryResponse {
  filesWithImports: number
  counts: Record<'internal' | 'external' | 'stdlib' | 'unresolved', number>
  internalFileEdges: number
  unresolved: { module: string; files: number; note: string | null }[]
  resolution: string
}

export const getRepositoryState = (repositoryId: string) => apiRequest<RepositoryState>(`/repositories/${encodeURIComponent(repositoryId)}`)
export const getGraphStats = (repositoryId: string) => apiRequest<GraphStatsResponse>(`/repositories/${encodeURIComponent(repositoryId)}/graph/stats`)
export const getDependencySummary = (repositoryId: string) =>
  apiRequest<DependencySummaryResponse>(`/repositories/${encodeURIComponent(repositoryId)}/dependencies`)

type Blocked = Exclude<AnalysisResult<never>, { state: 'ready' }>

/**
 * Looks at the repository itself and returns the reason an analysis cannot be shown yet (never scanned,
 * scan running, scan failed, code not parsed), or null when the data can be requested.
 * `needsParse` is true for views built from parsed code (architecture); package manifests only need a scan.
 */
export async function blockedReason(repositoryId: string, needsParse: boolean): Promise<{ blocked: Blocked | null; repository: RepositoryState | null }> {
  let repository: RepositoryState
  try {
    repository = await getRepositoryState(repositoryId)
  } catch (error) {
    return { blocked: { state: 'failed', message: errorMessage(error) }, repository: null }
  }
  if (repository.status === 'indexing') {
    return {
      repository,
      blocked: { state: 'in-progress', message: `"${repository.name}" is being scanned. The analysis will be available when the scan finishes.` },
    }
  }
  if (repository.status === 'error' && !repository.lastAnalysed) {
    return {
      repository,
      blocked: { state: 'failed', message: repository.lastError ?? 'The last scan failed. Fix the problem and scan the repository again.' },
    }
  }
  if (!repository.lastAnalysed) {
    return {
      repository,
      blocked: { state: 'empty', message: `"${repository.name}" has not been scanned yet. Scan it from Repository Management to see this analysis.` },
    }
  }
  if (needsParse && repository.parsed === false) {
    return {
      repository,
      blocked: {
        state: 'empty',
        message: `"${repository.name}" was scanned but its code has not been parsed yet. Scan it again from Repository Management: parsing runs automatically after a scan.`,
      },
    }
  }
  return { blocked: null, repository }
}
