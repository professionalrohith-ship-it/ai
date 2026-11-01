import type { ActivityItem, Repository } from '../../types'
import type {
  FileMetadata,
  FileTreeNode,
  LanguageShare,
  NewRepositoryInput,
  PathValidationResult,
  ScanProgressState,
  ScanResult,
  SuggestedFolder,
  TechnologyCategory,
  TechnologyEntry,
} from '../../types/repository'
import { languageLabel } from '../../utils/highlight'
import { apiRequest } from '../http'

// All repository data comes from the FastAPI backend (see backend/app/routers). Nothing here is mocked.

// ------------------------------------------------------------------ backend shapes

interface RepositoryDto {
  id: string
  name: string
  path: string
  description: string | null
  languages: string[]
  frameworks: string[]
  lastAnalysed: string | null
  fileCount: number
  folderCount: number
  mainLanguage: string | null
  addedAt: string
  status: Repository['status']
  isGit: boolean
  branch: string | null
  commit: string | null
  lastError: string | null
  parsed?: boolean
  lastParsedAt?: string | null
}

export function toRepository(dto: RepositoryDto): Repository {
  return {
    id: dto.id,
    name: dto.name,
    path: dto.path,
    description: dto.description ?? undefined,
    languages: dto.languages,
    frameworks: dto.frameworks,
    lastAnalysed: dto.lastAnalysed,
    fileCount: dto.fileCount,
    folderCount: dto.folderCount,
    mainLanguage: dto.mainLanguage ?? undefined,
    addedAt: dto.addedAt,
    status: dto.status,
    origin: 'added',
    isGit: dto.isGit,
    branch: dto.branch,
    commit: dto.commit,
    lastError: dto.lastError,
    parsed: Boolean(dto.parsed),
  }
}

// ---------------------------------------------------------------- registration

export async function listRepositories(): Promise<Repository[]> {
  return (await apiRequest<RepositoryDto[]>('/repositories')).map(toRepository)
}

export async function getRepository(id: string): Promise<Repository> {
  return toRepository(await apiRequest<RepositoryDto>(`/repositories/${encodeURIComponent(id)}`))
}

/** Folders worth offering in the "Add repository" picker (a browser cannot browse your disk itself). */
export function listSuggestedFolders(): Promise<SuggestedFolder[]> {
  return apiRequest<SuggestedFolder[]>('/fs/suggestions')
}

/** Asks the backend whether the folder exists, is readable and is not registered yet. */
export function validateRepositoryPath(path: string): Promise<PathValidationResult> {
  return apiRequest<PathValidationResult>('/repositories/validate', { method: 'POST', body: { path: path.trim() } })
}

export async function createRepository(input: NewRepositoryInput): Promise<Repository> {
  const dto = await apiRequest<RepositoryDto>('/repositories', {
    method: 'POST',
    body: { path: input.path.trim(), name: input.name.trim() || undefined, description: input.description?.trim() || undefined },
  })
  return toRepository(dto)
}

export function deleteRepository(id: string): Promise<void> {
  return apiRequest<void>(`/repositories/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------- scanning

interface ScanProgressDto {
  scanId: string
  repositoryId: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  stageIndex: number
  progress: number
  filesDiscovered: number
  foldersDiscovered: number
  languagesDetected: string[]
  frameworksDetected: string[]
  secondsRemaining: number | null
  startedAt: string
  error: string | null
  errorCount: number
}

export interface ScanSnapshot {
  scanId: string
  state: ScanProgressState
}

export function toScanState(dto: ScanProgressDto): ScanSnapshot {
  return {
    scanId: dto.scanId,
    state: {
      repositoryId: dto.repositoryId,
      status: dto.status === 'completed' ? 'completed' : dto.status === 'failed' ? 'failed' : 'running',
      progress: dto.progress,
      stageIndex: dto.stageIndex,
      filesDiscovered: dto.filesDiscovered,
      foldersDiscovered: dto.foldersDiscovered,
      languagesDetected: dto.languagesDetected,
      frameworksDetected: dto.frameworksDetected,
      secondsRemaining: dto.secondsRemaining,
      startedAt: dto.startedAt,
      error: dto.error ?? undefined,
      errorCount: dto.errorCount,
    },
  }
}

export async function startRepositoryScan(repositoryId: string): Promise<ScanSnapshot> {
  return toScanState(await apiRequest<ScanProgressDto>(`/repositories/${encodeURIComponent(repositoryId)}/scans`, { method: 'POST', body: {} }))
}

export async function getScanProgress(scanId: string): Promise<ScanSnapshot> {
  return toScanState(await apiRequest<ScanProgressDto>(`/scans/${encodeURIComponent(scanId)}`))
}

/** Latest scan of a repository, or null when it has never been scanned. */
export async function getLatestScan(repositoryId: string): Promise<ScanSnapshot | null> {
  try {
    return toScanState(await apiRequest<ScanProgressDto>(`/repositories/${encodeURIComponent(repositoryId)}/scans/latest`))
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null
    throw error
  }
}

export interface ParseRun {
  runId: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  progress: number
  error: string | null
  failedFiles: number
  partialFiles: number
}

/** Code parsing (symbols, imports, dependencies) runs after the scan has built the file inventory. */
export function startRepositoryParse(repositoryId: string): Promise<ParseRun> {
  return apiRequest<ParseRun>(`/repositories/${encodeURIComponent(repositoryId)}/parse`, { method: 'POST', body: {} })
}

export function getLatestParseRun(repositoryId: string): Promise<ParseRun> {
  return apiRequest<ParseRun>(`/repositories/${encodeURIComponent(repositoryId)}/parse/latest`)
}

export function getParseRun(runId: string): Promise<ParseRun> {
  return apiRequest<ParseRun>(`/parse-runs/${encodeURIComponent(runId)}`)
}

interface ScanResultDto {
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
  errorCount: number
}

export async function getScanResult(repositoryId: string): Promise<ScanResult> {
  const dto = await apiRequest<ScanResultDto>(`/repositories/${encodeURIComponent(repositoryId)}/scan-result`)
  return { ...dto, durationSeconds: Math.max(1, Math.round(dto.durationSeconds)) }
}

/** Scan result of the last completed scan, or null when there is none (never scanned). */
export async function getScanResultOrNull(repositoryId: string): Promise<ScanResult | null> {
  try {
    return await getScanResult(repositoryId)
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null
    throw error
  }
}

// ----------------------------------------------------------------------- explorer

export async function getRepositoryTree(repositoryId: string): Promise<FileTreeNode[]> {
  return apiRequest<FileTreeNode[]>(`/repositories/${encodeURIComponent(repositoryId)}/tree`)
}

export interface ImportLink {
  specifier: string
  /** Path of the imported file when it exists in the repository (otherwise an external package). */
  path?: string
  dependencyType: 'internal' | 'external' | 'stdlib' | 'unresolved'
}

export interface FileSymbol {
  name: string
  kind: string
  startLine: number
  endLine: number
  parent: string | null
}

export interface RepositoryFileContent {
  path: string
  content: string
  metadata: FileMetadata
  importLinks: ImportLink[]
  symbols: FileSymbol[]
  /** Only the first megabyte is shown for very large files. */
  truncated: boolean
  /** The file changed on disk after the last scan, so symbol line numbers may be off. */
  stale: boolean
}

interface FileDto {
  path: string
  content: string
  sizeBytes: number
  lineCount: number
  language: string | null
  extension: string
  lastModified: string
  encoding: string
  truncated: boolean
  stale: boolean
  symbols: FileSymbol[]
  imports: { module: string; line: number; depType: ImportLink['dependencyType']; resolvedPath: string | null }[]
  relatedFiles: string[]
  importedBy: string[]
}

export async function getRepositoryFile(repositoryId: string, path: string): Promise<RepositoryFileContent> {
  const dto = await apiRequest<FileDto>(`/repositories/${encodeURIComponent(repositoryId)}/file?path=${encodeURIComponent(path)}`)
  const importLinks: ImportLink[] = []
  const seen = new Set<string>()
  for (const entry of dto.imports) {
    if (seen.has(entry.module)) continue
    seen.add(entry.module)
    importLinks.push({ specifier: entry.module, path: entry.resolvedPath ?? undefined, dependencyType: entry.depType })
  }
  return {
    path: dto.path,
    content: dto.content,
    metadata: {
      language: dto.language ?? languageLabel(dto.path),
      extension: dto.extension.replace(/^\./, ''),
      sizeBytes: dto.sizeBytes,
      lineCount: dto.lineCount,
      imports: importLinks.map((link) => link.specifier),
      relatedFiles: dto.relatedFiles,
      lastModified: dto.lastModified,
      encoding: dto.encoding,
    },
    importLinks,
    symbols: dto.symbols,
    truncated: dto.truncated,
    stale: dto.stale,
  }
}

// ----------------------------------------------------------------- symbol search

export interface SymbolHit {
  id: number
  name: string
  kind: string
  path: string
  startLine: number
  endLine: number
  parent: string | null
  language: string
}

export async function searchSymbols(repositoryId: string, query: string, limit = 25): Promise<SymbolHit[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  return (await apiRequest<{ items: SymbolHit[] }>(`/repositories/${encodeURIComponent(repositoryId)}/symbols?${params}`)).items
}

// ----------------------------------------------------------------- technologies

interface TechnologyDto {
  name: string
  category: string
  version: string | null
  source: string
  confidence: TechnologyEntry['confidence']
}

const TECHNOLOGY_CATEGORIES: TechnologyCategory[] = [
  'language',
  'frontend-framework',
  'backend-framework',
  'database',
  'dev-tool',
  'configuration',
]

function toCategory(category: string): TechnologyCategory {
  if ((TECHNOLOGY_CATEGORIES as string[]).includes(category)) return category as TechnologyCategory
  return category === 'configuration' ? 'configuration' : 'dev-tool' // e.g. package-manager
}

export async function getRepositoryTechnologies(repository: Repository): Promise<TechnologyEntry[]> {
  const items = await apiRequest<TechnologyDto[]>(`/repositories/${encodeURIComponent(repository.id)}/technologies`)
  return items.map((item) => ({
    name: item.name,
    version: item.version ?? undefined,
    category: toCategory(item.category),
    source: item.source,
    confidence: item.confidence,
  }))
}

export interface LanguageStat {
  name: string
  percent: number
  files: number
  bytes: number
  lines: number
}

export function getRepositoryLanguages(repositoryId: string): Promise<LanguageStat[]> {
  return apiRequest<LanguageStat[]>(`/repositories/${encodeURIComponent(repositoryId)}/languages`)
}

// --------------------------------------------------------------------- activity

interface AgentRunDto {
  id: string
  repositoryId: string
  repositoryName?: string
  agent: string
  question: string
  status: string
  startedAt: string
  error: string | null
}

export function listAgentRuns(limit = 20, repositoryId?: string): Promise<AgentRunDto[]> {
  const path = repositoryId ? `/repositories/${encodeURIComponent(repositoryId)}/agent-runs` : '/agent-runs'
  return apiRequest<AgentRunDto[]>(`${path}?limit=${limit}`)
}

/** Real events for one repository: when it was added, scanned and parsed, plus agent runs. */
export async function getRepositoryActivity(repository: Repository): Promise<ActivityItem[]> {
  const items: ActivityItem[] = []
  if (repository.addedAt) {
    items.push({
      id: `${repository.id}-added`,
      type: 'repository-scanned',
      title: 'Repository added to workspace',
      description: repository.path,
      repository: repository.name,
      timestamp: repository.addedAt,
    })
  }
  if (repository.lastAnalysed) {
    items.push({
      id: `${repository.id}-scan`,
      type: 'repository-scanned',
      title: 'Repository scanned',
      description: `${repository.fileCount.toLocaleString('en-US')} files in ${(repository.folderCount ?? 0).toLocaleString('en-US')} folders`,
      repository: repository.name,
      timestamp: repository.lastAnalysed,
    })
  }
  try {
    for (const run of await listAgentRuns(20, repository.id)) items.push(agentRunToActivity(run, repository.name))
  } catch {
    // Agent history is optional here; the scan events above are still useful.
  }
  return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export function agentRunToActivity(run: AgentRunDto, repositoryName: string): ActivityItem {
  const failed = run.status === 'failed' || run.status === 'unavailable'
  return {
    id: `run-${run.id}`,
    type: 'agent-task-completed',
    title: failed ? 'Agent task failed' : 'Agent task completed',
    description: run.question.length > 90 ? `${run.question.slice(0, 89)}…` : run.question,
    repository: repositoryName,
    timestamp: run.startedAt,
  }
}
