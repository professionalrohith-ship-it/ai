import { useMemo, useState } from 'react'

import type { Repository } from '../types'
import { DEFAULT_REPOSITORY_FILTERS, type RepositoryFilterState, type SortKey } from '../types/repository'

function lastScannedTime(repository: Repository): number | null {
  return repository.lastAnalysed ? new Date(repository.lastAnalysed).getTime() : null
}

/** Never-scanned repositories always sort last so they do not hide real results. */
function compareScanned(a: Repository, b: Repository, direction: 1 | -1): number {
  const aTime = lastScannedTime(a)
  const bTime = lastScannedTime(b)
  if (aTime === null && bTime === null) return a.name.localeCompare(b.name)
  if (aTime === null) return 1
  if (bTime === null) return -1
  return (aTime - bTime) * direction
}

const COMPARATORS: Record<SortKey, (a: Repository, b: Repository) => number> = {
  'name-asc': (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  'name-desc': (a, b) => b.name.localeCompare(a.name, undefined, { sensitivity: 'base' }),
  'scanned-desc': (a, b) => compareScanned(a, b, -1),
  'scanned-asc': (a, b) => compareScanned(a, b, 1),
  'files-desc': (a, b) => b.fileCount - a.fileCount || a.name.localeCompare(b.name),
}

export function applyRepositoryFilters(repositories: Repository[], filters: RepositoryFilterState): Repository[] {
  const needle = filters.query.trim().toLowerCase()
  return repositories
    .filter((repository) => {
      if (needle && !repository.name.toLowerCase().includes(needle) && !repository.path.toLowerCase().includes(needle)) return false
      if (filters.status !== 'all' && repository.status !== filters.status) return false
      if (filters.language !== 'all' && !repository.languages.includes(filters.language)) return false
      return true
    })
    .sort(COMPARATORS[filters.sort])
}

/** Search, status filter, language filter and sorting for the repository list. */
export function useRepositoryFilters(repositories: Repository[]) {
  const [filters, setFilters] = useState<RepositoryFilterState>(DEFAULT_REPOSITORY_FILTERS)

  const languages = useMemo(
    () => [...new Set(repositories.flatMap((repository) => repository.languages))].sort((a, b) => a.localeCompare(b)),
    [repositories],
  )

  const filtered = useMemo(() => applyRepositoryFilters(repositories, filters), [repositories, filters])

  const hasActiveFilters =
    filters.query.trim() !== '' || filters.status !== 'all' || filters.language !== 'all'

  return {
    filters,
    setFilters,
    update: <K extends keyof RepositoryFilterState>(key: K, value: RepositoryFilterState[K]) =>
      setFilters((current) => ({ ...current, [key]: value })),
    /** Resets search and filters; keeps the chosen sort order. */
    clear: () => setFilters((current) => ({ ...DEFAULT_REPOSITORY_FILTERS, sort: current.sort })),
    languages,
    filtered,
    hasActiveFilters,
  }
}
