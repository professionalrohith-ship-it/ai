import { createContext } from 'react'

import type { AiStatus } from '../services/api/ai'
import type { AppNotification, DashboardData, OverviewStats, Repository } from '../types'
import type { ScanProgressState, ScanResult } from '../types/repository'

export type LoadStatus = 'loading' | 'ready' | 'error'

export interface AppDataValue {
  status: LoadStatus
  error: string | null
  data: DashboardData | null
  repositories: Repository[]
  stats: OverviewStats | null
  notifications: AppNotification[]
  selectedRepositoryId: string | null
  selectedRepository: Repository | null
  reload: () => void
  selectRepository: (id: string | null) => void
  /** Removes the repository record from the backend (files on disk are never touched). Rejects on failure. */
  removeRepository: (id: string) => Promise<void>
  markAllNotificationsRead: () => void

  // ---- repository management ----
  /** Adds an already-created repository record to the workspace (and makes it the active one). */
  addRepository: (repository: Repository) => void
  /** Merges a partial update into a repository. */
  updateRepository: (id: string, patch: Partial<Repository>) => void
  /** Scans followed from the backend, keyed by repository id. Present while running and until dismissed. */
  scans: Record<string, ScanProgressState>
  /** Summary of the most recent scan per repository (loaded from the backend). */
  scanResults: Record<string, ScanResult>
  startScan: (id: string) => void
  cancelScan: (id: string) => void
  /** Hides a finished scan's progress/summary UI (the stored result is kept). */
  dismissScan: (id: string) => void
  /** AI provider configuration reported by the backend (null until loaded or when unreachable). */
  aiStatus: AiStatus | null
  refreshAiStatus: (check?: boolean) => Promise<void>
  /** Re-reads one repository record from the backend. */
  refreshRepository: (id: string) => Promise<void>
}

export const AppDataContext = createContext<AppDataValue | null>(null)
