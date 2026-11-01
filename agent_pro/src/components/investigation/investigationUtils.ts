import type { FindingSeverity, Investigation, InvestigationStatus } from '../../types/investigation'
import type { BadgeTone } from '../ui/Badge'

export const SEVERITY_META: Record<FindingSeverity, { label: string; tone: BadgeTone }> = {
  critical: { label: 'Critical', tone: 'danger' },
  high: { label: 'High', tone: 'brand' },
  medium: { label: 'Medium', tone: 'warn' },
  low: { label: 'Low', tone: 'info' },
  informational: { label: 'Informational', tone: 'neutral' },
}

export const SEVERITY_ORDER: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'informational']

export const STATUS_META: Record<InvestigationStatus, { label: string; tone: BadgeTone }> = {
  running: { label: 'Running', tone: 'brand' },
  completed: { label: 'Completed', tone: 'ok' },
  'evidence-only': { label: 'Evidence only', tone: 'warn' },
  'no-evidence': { label: 'Nothing found', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'danger' },
}

/** Statuses that have a results view (everything except running and failed). */
export const hasResults = (status: InvestigationStatus) => status !== 'running' && status !== 'failed'

export const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'evidence-only', label: 'Evidence only' },
  { value: 'no-evidence', label: 'Nothing found' },
  { value: 'failed', label: 'Failed' },
]

export interface InvestigationFilters {
  query: string
  status: string
  /** Show only the active repository's investigations. */
  onlyRepositoryId: string | null
}

export function filterInvestigations(items: Investigation[], filters: InvestigationFilters): Investigation[] {
  const needle = filters.query.trim().toLowerCase()
  return items.filter(
    (item) =>
      (filters.status === 'all' || item.status === filters.status) &&
      (filters.onlyRepositoryId === null || item.repositoryId === filters.onlyRepositoryId) &&
      (needle === '' ||
        item.title.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle) ||
        item.repositoryName.toLowerCase().includes(needle) ||
        (item.affectedModule ?? '').toLowerCase().includes(needle)),
  )
}

export function severityCounts(findings: { severity: FindingSeverity }[]): Record<FindingSeverity, number> {
  const counts: Record<FindingSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 }
  findings.forEach((finding) => {
    counts[finding.severity] += 1
  })
  return counts
}
