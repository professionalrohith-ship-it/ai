import { useEffect, useState } from 'react'

import {
  getRepositoryActivity,
  getRepositoryFile,
  getRepositoryLanguages,
  getRepositoryTechnologies,
  getRepositoryTree,
  getScanResultOrNull,
  type LanguageStat,
  type RepositoryFileContent,
} from '../services/api/repositories'
import { errorMessage } from '../services/http'
import type { ActivityItem, Repository } from '../types'
import type { FileTreeNode, ScanResult, TechnologyEntry } from '../types/repository'

type Loaded<T> = { key: string; value: T; error: null } | { key: string; value: null; error: string }

/**
 * Loads async data for `key`. `loading` is derived (no synchronous setState in the effect) and a
 * failed request becomes an `error` message instead of an unhandled rejection.
 */
function useKeyedAsync<T>(key: string | null, load: () => Promise<T>) {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null)

  useEffect(() => {
    if (key === null) return
    let cancelled = false
    load()
      .then((value) => {
        if (!cancelled) setLoaded({ key, value, error: null })
      })
      .catch((reason: unknown) => {
        if (!cancelled) setLoaded({ key, value: null, error: errorMessage(reason, 'The data could not be loaded.') })
      })
    return () => {
      cancelled = true
    }
    // `load` is created inline by the callers and always derives from `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const ready = key !== null && loaded?.key === key
  return { data: ready ? loaded.value : null, error: ready ? loaded.error : null, loading: key !== null && !ready }
}

/** `scanVersion` (the repository's last scan time) reloads the tree after a new scan. */
export function useRepositoryTree(repositoryId: string | null, scanVersion?: string | null) {
  const key = repositoryId ? `${repositoryId}:${scanVersion ?? ''}` : null
  return useKeyedAsync<FileTreeNode[]>(key, () => getRepositoryTree(repositoryId ?? ''))
}

export function useRepositoryFile(repositoryId: string | null, path: string | null, scanVersion?: string | null) {
  const key = repositoryId && path ? `${repositoryId}:${path}:${scanVersion ?? ''}` : null
  return useKeyedAsync<RepositoryFileContent>(key, () => getRepositoryFile(repositoryId ?? '', path ?? ''))
}

/** Technologies reload when the repository's scan status or languages change. */
export function useRepositoryTechnologies(repository: Repository | null) {
  const key = repository ? `${repository.id}:${repository.status}:${repository.lastAnalysed ?? ''}` : null
  return useKeyedAsync<TechnologyEntry[]>(key, () => (repository ? getRepositoryTechnologies(repository) : Promise.resolve([])))
}

export function useRepositoryActivity(repository: Repository | null) {
  const key = repository ? `${repository.id}:${repository.lastAnalysed ?? 'never'}` : null
  return useKeyedAsync<ActivityItem[]>(key, () => (repository ? getRepositoryActivity(repository) : Promise.resolve([])))
}

/** Last completed scan summary as stored by the backend (null when the repository was never scanned). */
export function useRepositoryScanResult(repository: Repository | null) {
  const key = repository ? `${repository.id}:${repository.lastAnalysed ?? 'never'}` : null
  return useKeyedAsync<ScanResult | null>(key, () => (repository?.lastAnalysed ? getScanResultOrNull(repository.id) : Promise.resolve(null)))
}

export function useRepositoryLanguages(repository: Repository | null) {
  const key = repository ? `${repository.id}:${repository.lastAnalysed ?? 'never'}` : null
  return useKeyedAsync<LanguageStat[]>(key, () => (repository?.lastAnalysed ? getRepositoryLanguages(repository.id) : Promise.resolve([])))
}
