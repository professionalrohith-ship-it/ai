import type { Repository, RepositoryStatus } from './index'

// ---------- Add repository ----------

export interface NewRepositoryInput {
  name: string
  /** Absolute local path typed or picked by the user. */
  path: string
  description?: string
}

export interface PathValidationResult {
  valid: boolean
  message: string
  /** Normalised path to store when valid. */
  normalizedPath?: string
}

/** A folder suggested by the backend (GET /api/fs/suggestions). */
export interface SuggestedFolder {
  name: string
  path: string
  hint: string
}

// ---------- Filtering and sorting ----------

export type StatusFilter = 'all' | RepositoryStatus
export type SortKey = 'name-asc' | 'name-desc' | 'scanned-desc' | 'scanned-asc' | 'files-desc'

export interface RepositoryFilterState {
  query: string
  status: StatusFilter
  /** 'all' or a language name. */
  language: string
  sort: SortKey
}

export const DEFAULT_REPOSITORY_FILTERS: RepositoryFilterState = {
  query: '',
  status: 'all',
  language: 'all',
  sort: 'name-asc',
}

/** Repository health shown next to the indexing status. */
export type RepositoryHealth = 'healthy' | 'attention' | 'unknown'

// ---------- Scanning ----------

export type ScanStageId = 'initialise' | 'discover' | 'languages' | 'frameworks' | 'config' | 'inventory' | 'complete'

export interface ScanStage {
  id: ScanStageId
  label: string
  description: string
}

export interface ScanProgressState {
  repositoryId: string
  status: 'running' | 'completed' | 'failed'
  /** 0 to 100. */
  progress: number
  stageIndex: number
  filesDiscovered: number
  foldersDiscovered: number
  languagesDetected: string[]
  frameworksDetected: string[]
  /** Estimated seconds left, or null when the backend cannot estimate yet. */
  secondsRemaining: number | null
  startedAt: string
  /** Backend message when the scan or the follow-up code parsing failed. */
  error?: string
  /** Files or folders the scanner could not read (permission problems and similar). */
  errorCount?: number
}

export interface LanguageShare {
  name: string
  percent: number
  files: number
}

export interface ScanResult {
  repositoryId: string
  completedAt: string
  durationSeconds: number
  files: number
  folders: number
  languages: LanguageShare[]
  frameworks: string[]
  technologyCount: number
  packageManagers: string[]
  entryPoints: string[]
  /** Files or folders that could not be read during the scan. */
  errorCount: number
}

// ---------- Technologies ----------

export type TechnologyCategory =
  | 'language'
  | 'frontend-framework'
  | 'backend-framework'
  | 'database'
  | 'dev-tool'
  | 'configuration'

export type DetectionConfidence = 'high' | 'medium' | 'low'

export interface TechnologyEntry {
  name: string
  version?: string
  category: TechnologyCategory
  /** Where the detection came from, e.g. "package.json". */
  source: string
  confidence: DetectionConfidence
}

// ---------- Files and folders ----------

export interface FileMetadata {
  language: string
  extension: string
  sizeBytes: number
  lineCount: number
  imports: string[]
  relatedFiles: string[]
  lastModified: string
  encoding: string
}

export interface FileTreeNode {
  /** Full path from the repository root, used as the id. */
  path: string
  name: string
  type: 'file' | 'folder'
  children?: FileTreeNode[]
  /** Number of files contained (folders only). */
  fileCount?: number
}

export type RepositoryDetailsTab = 'overview' | 'technologies' | 'information' | 'activity'

export type { Repository, RepositoryStatus }
