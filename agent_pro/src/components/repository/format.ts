import type { Repository } from '../../types'
import type { RepositoryHealth } from '../../types/repository'
import type { BadgeTone } from '../ui/Badge'

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDate(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

interface HealthInfo {
  health: RepositoryHealth
  label: string
  tone: BadgeTone
}

/** Repository status shown beside the indexing status (derived from the scan state). */
export function repositoryHealth(repository: Repository): HealthInfo {
  switch (repository.status) {
    case 'indexed':
      return { health: 'healthy', label: 'Healthy', tone: 'ok' }
    case 'error':
      return { health: 'attention', label: 'Scan failed', tone: 'danger' }
    case 'indexing':
      return { health: 'unknown', label: 'Scanning', tone: 'warn' }
    default:
      return { health: 'unknown', label: 'Not analysed', tone: 'neutral' }
  }
}
