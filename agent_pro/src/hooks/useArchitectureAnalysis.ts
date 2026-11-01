import { useCallback, useEffect, useState } from 'react'

import type { AnalysisResult } from '../types/architecture'

export type AnalysisStatus = 'idle' | 'loading' | 'ready' | 'in-progress' | 'failed' | 'empty' | 'error'

export interface AnalysisView<T> {
  status: AnalysisStatus
  data: T | null
  message: string | null
  /** True while re-running an analysis that already has results on screen. */
  refreshing: boolean
  refresh: () => void
}

interface Settled<T> {
  repositoryId: string
  attempt: number
  result: AnalysisResult<T> | null
  error: string | null
}

/** Loads analysis data for a repository from the backend and exposes loading, refresh and the
 *  ready / in-progress / failed / empty outcomes. Shared by Architecture and Dependencies. */
export function useAnalysis<T>(
  repositoryId: string | null,
  fetcher: (repositoryId: string) => Promise<AnalysisResult<T>>,
): AnalysisView<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!repositoryId) return
    let cancelled = false
    fetcher(repositoryId)
      .then((result) => {
        if (!cancelled) setSettled({ repositoryId, attempt, result, error: null })
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        const error = reason instanceof Error ? reason.message : 'The analysis could not be loaded.'
        setSettled({ repositoryId, attempt, result: null, error })
      })
    return () => {
      cancelled = true
    }
  }, [repositoryId, attempt, fetcher])

  const refresh = useCallback(() => setAttempt((value) => value + 1), [])

  if (!repositoryId) return { status: 'idle', data: null, message: null, refreshing: false, refresh }

  const current = settled && settled.repositoryId === repositoryId ? settled : null
  const loading = !current || current.attempt !== attempt

  if (loading) {
    // keep showing the previous results of this repository while a refresh runs
    if (current?.result?.state === 'ready') {
      return { status: 'ready', data: current.result.data, message: null, refreshing: true, refresh }
    }
    return { status: 'loading', data: null, message: null, refreshing: false, refresh }
  }

  if (current.error) return { status: 'error', data: null, message: current.error, refreshing: false, refresh }
  const result = current.result
  if (!result) return { status: 'error', data: null, message: null, refreshing: false, refresh }
  if (result.state === 'ready') return { status: 'ready', data: result.data, message: null, refreshing: false, refresh }
  return { status: result.state, data: null, message: result.message, refreshing: false, refresh }
}
