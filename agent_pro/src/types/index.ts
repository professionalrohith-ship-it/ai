import type { LucideIcon } from 'lucide-react'

export type RepositoryStatus = 'indexed' | 'indexing' | 'not-indexed' | 'error'

export interface Repository {
  id: string
  name: string
  /** Absolute path of the repository folder on this computer. */
  path: string
  languages: string[]
  frameworks: string[]
  /** ISO timestamp, or null if the repository has never been analysed. */
  lastAnalysed: string | null
  fileCount: number
  status: RepositoryStatus
  /** Optional details used by Repository Management and the details page. */
  description?: string
  folderCount?: number
  mainLanguage?: string
  /** ISO timestamp of when the repository was added to the workspace. */
  addedAt?: string
  origin?: 'sample' | 'added'
  isGit?: boolean
  branch?: string | null
  commit?: string | null
  /** Last scan/parse error reported by the backend. */
  lastError?: string | null
  /** true once the code has been parsed (symbols, imports and dependencies are available). */
  parsed?: boolean
}

export type ActivityType =
  | 'repository-scanned'
  | 'dependencies-detected'
  | 'architecture-analysed'
  | 'documentation-generated'
  | 'agent-task-completed'

export interface ActivityItem {
  id: string
  type: ActivityType
  title: string
  description: string
  repository: string
  timestamp: string
}

export interface OverviewStats {
  totalRepositories: number
  indexedRepositories: number
  filesAnalysed: number
  technologiesDetected: number
}

export interface TechnologyShare {
  name: string
  value: number
  color: string
}

export type ServiceState = 'online' | 'pending' | 'offline'

export interface ServiceStatus {
  id: 'frontend' | 'backend' | 'ollama' | 'model'
  label: string
  detail: string
  state: ServiceState
}

export interface AppNotification {
  id: string
  title: string
  body: string
  timestamp: string
  read: boolean
}

export interface DashboardData {
  stats: OverviewStats
  repositories: Repository[]
  activity: ActivityItem[]
  technologies: TechnologyShare[]
  services: ServiceStatus[]
  notifications: AppNotification[]
}

export interface NavItemConfig {
  id: string
  label: string
  path: string
  icon: LucideIcon
}

export interface NavSectionConfig {
  id: string
  label: string
  items: NavItemConfig[]
}
