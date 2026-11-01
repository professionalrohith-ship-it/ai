import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { useScanEngine } from '../hooks/useScanEngine'
import { getDashboardData } from '../services/api'
import { getAiStatus, type AiStatus } from '../services/api/ai'
import { deleteRepository, getRepository } from '../services/api/repositories'
import { errorMessage } from '../services/http'
import type { AppNotification, DashboardData, OverviewStats, Repository } from '../types'
import type { ScanResult } from '../types/repository'
import { AppDataContext, type AppDataValue, type LoadStatus } from './appDataContext'

function computeStats(repositories: Repository[], base: OverviewStats): OverviewStats {
  return {
    ...base,
    totalRepositories: repositories.length,
    indexedRepositories: repositories.filter((repo) => repo.status === 'indexed').length,
    filesAnalysed: repositories.reduce((sum, repo) => sum + repo.fileCount, 0),
  }
}

/** Holds the workspace data (loaded from the backend) shared by the header, sidebar and pages. */
export function AppDataProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DashboardData | null>(null)
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<string | null>(null)
  const [scanResults, setScanResults] = useState<Record<string, ScanResult>>({})
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null)
  const [attempt, setAttempt] = useState(0)

  const updateRepository = useCallback((id: string, patch: Partial<Repository>) => {
    setRepositories((current) => current.map((repo) => (repo.id === id ? { ...repo, ...patch } : repo)))
  }, [])

  const refreshRepository = useCallback(async (id: string) => {
    try {
      const fresh = await getRepository(id)
      setRepositories((current) => current.map((repo) => (repo.id === id ? fresh : repo)))
    } catch {
      // the repository may have been removed meanwhile; the next full reload corrects the list
    }
  }, [])

  const refreshAiStatus = useCallback(async (check = false) => {
    try {
      setAiStatus(await getAiStatus(check))
    } catch {
      setAiStatus(null)
    }
  }, [])

  const handleScanStart = useCallback((id: string) => updateRepository(id, { status: 'indexing' }), [updateRepository])

  const handleScanComplete = useCallback((id: string, result: ScanResult, repository: Repository) => {
    setRepositories((current) => current.map((repo) => (repo.id === id ? repository : repo)))
    setScanResults((current) => ({ ...current, [id]: result }))
    // refresh the dashboard figures (technology chart, activity) that depend on the new scan
    getDashboardData()
      .then((fresh) => setData(fresh))
      .catch(() => undefined)
  }, [])

  const { scans, startScan, resumeScan, cancelScan, dismissScan, discardScan } = useScanEngine({
    onStart: handleScanStart,
    onComplete: handleScanComplete,
    onRefresh: refreshRepository,
  })

  // resumeScan is stable for the provider's lifetime; keep a ref so the load effect does not re-run
  const resumeRef = useRef(resumeScan)
  useEffect(() => {
    resumeRef.current = resumeScan
  }, [resumeScan])

  useEffect(() => {
    let cancelled = false
    getDashboardData()
      .then((result) => {
        if (cancelled) return
        setData(result)
        setRepositories(result.repositories)
        setNotifications(result.notifications)
        setSelectedRepositoryId((current) =>
          current && result.repositories.some((repo) => repo.id === current) ? current : (result.repositories[0]?.id ?? null),
        )
        setStatus('ready')
        // scans that were running before this page loaded: keep following them
        for (const repo of result.repositories) if (repo.status === 'indexing') void resumeRef.current(repo.id)
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setError(errorMessage(reason, 'Something went wrong while loading the workspace.'))
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  useEffect(() => {
    let cancelled = false
    getAiStatus()
      .then((result) => !cancelled && setAiStatus(result))
      .catch(() => !cancelled && setAiStatus(null))
    return () => {
      cancelled = true
    }
  }, [attempt])

  const reload = useCallback(() => {
    setStatus('loading')
    setError(null)
    setAttempt((value) => value + 1)
  }, [])

  const addRepository = useCallback((repository: Repository) => {
    setRepositories((current) => [repository, ...current.filter((repo) => repo.id !== repository.id)])
    setSelectedRepositoryId(repository.id)
  }, [])

  const removeRepository = useCallback(
    async (id: string) => {
      await deleteRepository(id) // rejects (e.g. 409 while a scan is running): the caller shows the message
      discardScan(id)
      setRepositories((current) => current.filter((repo) => repo.id !== id))
      setScanResults((current) => {
        if (!(id in current)) return current
        const next = { ...current }
        delete next[id]
        return next
      })
      setSelectedRepositoryId((current) => (current === id ? null : current))
    },
    [discardScan],
  )

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })))
  }, [])

  const value = useMemo<AppDataValue>(() => {
    const selectedRepository = repositories.find((repo) => repo.id === selectedRepositoryId) ?? null
    return {
      status,
      error,
      data,
      repositories,
      stats: data ? computeStats(repositories, data.stats) : null,
      notifications,
      selectedRepositoryId,
      selectedRepository,
      reload,
      selectRepository: setSelectedRepositoryId,
      removeRepository,
      markAllNotificationsRead,
      addRepository,
      updateRepository,
      scans,
      scanResults,
      startScan: (id: string) => void startScan(id),
      cancelScan,
      dismissScan,
      aiStatus,
      refreshAiStatus,
      refreshRepository,
    }
  }, [
    status,
    error,
    data,
    repositories,
    notifications,
    selectedRepositoryId,
    reload,
    removeRepository,
    markAllNotificationsRead,
    addRepository,
    updateRepository,
    scans,
    scanResults,
    startScan,
    cancelScan,
    dismissScan,
    aiStatus,
    refreshAiStatus,
    refreshRepository,
  ])

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}
