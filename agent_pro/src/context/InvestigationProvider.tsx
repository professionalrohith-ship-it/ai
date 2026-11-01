import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { useAppData } from '../hooks/useAppData'
import { createInvestigationRecord, investigationsApi, isLocalInvestigation } from '../services/api/investigations'
import { errorMessage } from '../services/http'
import type { Investigation, NewInvestigationInput } from '../types/investigation'
import { InvestigationContext, type InvestigationContextValue, type InvestigationLoadStatus } from './investigationContext'

// Investigations are stored by the backend. This provider lists them for every registered repository and
// shows a placeholder 'running' record while a request waits for the analysis to finish.

const byNewest = (a: Investigation, b: Investigation) => b.createdAt.localeCompare(a.createdAt)

const toInput = (item: Investigation): NewInvestigationInput => ({
  title: item.title,
  repositoryId: item.repositoryId,
  description: item.description,
  affectedModule: item.affectedModule,
  filePath: item.filePath,
  errorMessage: item.errorMessage,
  stackTrace: item.stackTrace,
})

export function InvestigationProvider({ children }: { children: ReactNode }) {
  const { repositories, status: appStatus } = useAppData()
  const [items, setItems] = useState<Investigation[]>([])
  const [aliases, setAliases] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState<{ key: string; error: string | null } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [actionError, setActionError] = useState<string | null>(null)
  const deletedWhileRunning = useRef(new Set<string>())

  const repositoryKey = repositories.map((repository) => repository.id).join('|')

  useEffect(() => {
    if (repositoryKey === '') return
    let cancelled = false
    Promise.allSettled(repositories.map((repository) => investigationsApi.list(repository.id, repository.name))).then((results) => {
      if (cancelled) return
      const fulfilled = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
      const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
      setItems((current) => [...current.filter((item) => isLocalInvestigation(item.id)), ...fulfilled.flat()])
      setLoaded({ key: repositoryKey, error: fulfilled.length === 0 && rejected ? errorMessage(rejected.reason, 'Could not load investigations.') : null })
    })
    return () => {
      cancelled = true
    }
    // `repositories` is read only to build the requests; the key already captures its ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositoryKey, attempt])

  const status: InvestigationLoadStatus =
    appStatus === 'loading' ? 'loading' : repositoryKey === '' ? 'ready' : loaded?.key !== repositoryKey ? 'loading' : loaded.error ? 'error' : 'ready'

  const reload = useCallback(() => {
    setLoaded(null)
    setAttempt((value) => value + 1)
  }, [])

  const investigations = useMemo(() => {
    const known = new Set(repositories.map((repository) => repository.id))
    return items.filter((item) => known.has(item.repositoryId)).sort(byNewest)
  }, [items, repositories])

  const resolve = useCallback((id: string) => aliases[id] ?? id, [aliases])

  /** Sends the investigation to the backend and swaps the placeholder for the stored result. */
  const execute = useCallback((record: Investigation, replacesStoredId?: string) => {
    investigationsApi
      .run(toInput(record), record.repositoryName)
      .then((result) => {
        if (deletedWhileRunning.current.delete(record.id)) {
          void investigationsApi.remove(result.id).catch(() => undefined)
          return
        }
        setItems((current) => current.map((item) => (item.id === record.id ? result : item)))
        setAliases((current) => ({ ...current, [record.id]: result.id }))
        if (replacesStoredId) void investigationsApi.remove(replacesStoredId).catch(() => undefined)
      })
      .catch((reason: unknown) => {
        deletedWhileRunning.current.delete(record.id)
        setItems((current) =>
          current.map((item) =>
            item.id === record.id ? { ...item, status: 'failed' as const, progress: 0, failureReason: errorMessage(reason, 'The investigation could not be completed.') } : item,
          ),
        )
      })
  }, [])

  const startInvestigation = useCallback(
    (input: NewInvestigationInput) => {
      const name = repositories.find((repository) => repository.id === input.repositoryId)?.name ?? input.repositoryId
      const record = createInvestigationRecord(input, name)
      setItems((current) => [record, ...current])
      execute(record)
      return record.id
    },
    [repositories, execute],
  )

  const retryInvestigation = useCallback(
    (id: string) => {
      const real = resolve(id)
      const existing = items.find((item) => item.id === real)
      if (!existing || existing.status === 'running') return
      const reset: Investigation = {
        ...existing,
        status: 'running',
        createdAt: new Date().toISOString(),
        completedAt: undefined,
        progress: 0,
        currentStageIndex: 0,
        findings: [],
        recommendations: [],
        timeline: [],
        failureReason: undefined,
        summary: undefined,
        rootCause: undefined,
        suggestedSolution: undefined,
        confidence: undefined,
        confidenceScore: undefined,
        caveats: undefined,
        locations: undefined,
        message: undefined,
      }
      setItems((current) => current.map((item) => (item.id === real ? reset : item)))
      execute(reset, isLocalInvestigation(real) ? undefined : real)
    },
    [items, execute, resolve],
  )

  const deleteInvestigation = useCallback(
    (id: string) => {
      const real = resolve(id)
      const existing = items.find((item) => item.id === real)
      if (!existing) return
      if (isLocalInvestigation(real)) {
        if (existing.status === 'running') deletedWhileRunning.current.add(real)
        setItems((current) => current.filter((item) => item.id !== real))
        return
      }
      setActionError(null)
      investigationsApi
        .remove(real)
        .then(() => setItems((current) => current.filter((item) => item.id !== real)))
        .catch((reason: unknown) => setActionError(errorMessage(reason, 'Could not delete the investigation.')))
    },
    [items, resolve],
  )

  const value = useMemo<InvestigationContextValue>(
    () => ({
      investigations,
      status,
      error: status === 'error' ? (loaded?.error ?? null) : null,
      reload,
      runningCount: investigations.filter((item) => item.status === 'running').length,
      getInvestigation: (id) => investigations.find((item) => item.id === resolve(id)),
      startInvestigation,
      retryInvestigation,
      deleteInvestigation,
      actionError,
    }),
    [investigations, status, loaded, reload, resolve, startInvestigation, retryInvestigation, deleteInvestigation, actionError],
  )

  return <InvestigationContext.Provider value={value}>{children}</InvestigationContext.Provider>
}
