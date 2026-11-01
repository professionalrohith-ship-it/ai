import { useCallback, useEffect, useRef, useState } from 'react'

import { PARSE_STAGE_INDEX } from '../constants/scan'
import {
  getLatestParseRun,
  getLatestScan,
  getParseRun,
  getRepository,
  getScanProgress,
  getScanResult,
  startRepositoryParse,
  startRepositoryScan,
  type ParseRun,
  type ScanSnapshot,
} from '../services/api/repositories'
import { errorMessage } from '../services/http'
import type { Repository } from '../types'
import type { ScanProgressState, ScanResult } from '../types/repository'

interface ScanEngineOptions {
  /** A scan was accepted by the backend (the repository is now being indexed). */
  onStart: (id: string) => void
  /** The scan and the follow-up code parsing finished; `repository` is the fresh backend record. */
  onComplete: (id: string, result: ScanResult, repository: Repository) => void
  /** The backend record changed without a completed scan (failure): refresh it. */
  onRefresh: (id: string) => void
}

interface Tracker {
  /** When true nothing is shown in the UI; the scan is only followed so the record gets refreshed. */
  silent: boolean
  stopped: boolean
}

const POLL_MS = 700
const MAX_POLL_FAILURES = 4

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Follows repository scans running in the backend. A scan is: file inventory (POST /scans), then code
 * parsing (POST /parse). The progress shown here is whatever the backend reports; nothing is simulated.
 * State lives with the provider so a scan keeps being followed while the user navigates.
 */
export function useScanEngine({ onStart, onComplete, onRefresh }: ScanEngineOptions) {
  const [scans, setScans] = useState<Record<string, ScanProgressState>>({})
  const trackers = useRef(new Map<string, Tracker>())

  useEffect(() => {
    const active = trackers.current
    return () => {
      active.forEach((tracker) => {
        tracker.stopped = true
      })
      active.clear()
    }
  }, [])

  const put = useCallback((id: string, tracker: Tracker, state: ScanProgressState) => {
    if (!tracker.silent && !tracker.stopped) setScans((current) => ({ ...current, [id]: state }))
  }, [])

  /** Polls `load` until `done` says stop. Transient network errors are retried a few times. */
  const poll = useCallback(async <T,>(tracker: Tracker, load: () => Promise<T>, done: (value: T) => boolean, update: (value: T) => void) => {
    let failures = 0
    for (;;) {
      if (tracker.stopped) return null
      try {
        const value = await load()
        failures = 0
        update(value)
        if (done(value)) return value
      } catch (error) {
        failures += 1
        if (failures >= MAX_POLL_FAILURES) throw error
      }
      await sleep(POLL_MS)
    }
  }, [])

  const follow = useCallback(
    async (id: string, first: ScanSnapshot, tracker: Tracker) => {
      const fail = (state: ScanProgressState, message: string) => {
        put(id, tracker, { ...state, status: 'failed', error: message })
        onRefresh(id)
      }
      let latest = first.state
      try {
        // 1) file inventory
        const scan = await poll(
          tracker,
          () => getScanProgress(first.scanId),
          (snapshot) => snapshot.state.status !== 'running',
          (snapshot) => {
            latest = snapshot.state
            put(id, tracker, snapshot.state)
          },
        )
        if (!scan) return
        if (scan.state.status === 'failed') return fail(scan.state, scan.state.error ?? 'The scan failed.')

        // 2) code parsing: symbols, imports and dependencies for the code intelligence features
        const atParse = { ...scan.state, status: 'running' as const, stageIndex: PARSE_STAGE_INDEX, progress: 90, secondsRemaining: null }
        put(id, tracker, atParse)
        let run: ParseRun
        try {
          run = await startRepositoryParse(id)
        } catch (error) {
          if ((error as { code?: string }).code !== 'parse_running') throw error
          run = await getLatestParseRun(id)
        }
        const parsed = await poll(
          tracker,
          () => getParseRun(run.runId),
          (value) => value.status === 'completed' || value.status === 'failed',
          (value) => put(id, tracker, { ...atParse, progress: 90 + Math.round(value.progress / 10) }),
        )
        if (!parsed) return
        if (parsed.status === 'failed') {
          return fail(atParse, `The files were scanned, but code parsing failed: ${parsed.error ?? 'unknown error'}`)
        }

        // 3) done: take the fresh record and result from the backend
        const [repository, result] = await Promise.all([getRepository(id), getScanResult(id)])
        put(id, tracker, { ...latest, status: 'completed', progress: 100, stageIndex: 6, secondsRemaining: 0 })
        onComplete(id, result, repository)
      } catch (error) {
        if (!tracker.stopped) fail(latest, errorMessage(error, 'The scan could not be completed.'))
      } finally {
        if (trackers.current.get(id) === tracker) trackers.current.delete(id)
      }
    },
    [onComplete, onRefresh, poll, put],
  )

  const startScan = useCallback(
    async (id: string) => {
      if (trackers.current.has(id)) return
      const tracker: Tracker = { silent: false, stopped: false }
      trackers.current.set(id, tracker)
      try {
        let first: ScanSnapshot
        try {
          first = await startRepositoryScan(id)
        } catch (error) {
          // a scan is already running on the backend (e.g. started before a page reload): follow that one
          const running = (error as { code?: string }).code === 'scan_running' ? await getLatestScan(id) : null
          if (!running) throw error
          first = running
        }
        put(id, tracker, first.state)
        onStart(id)
        void follow(id, first, tracker)
      } catch (error) {
        trackers.current.delete(id)
        setScans((current) => ({
          ...current,
          [id]: {
            repositoryId: id,
            status: 'failed',
            progress: 0,
            stageIndex: 0,
            filesDiscovered: 0,
            foldersDiscovered: 0,
            languagesDetected: [],
            frameworksDetected: [],
            secondsRemaining: null,
            startedAt: new Date().toISOString(),
            error: errorMessage(error, 'The scan could not be started.'),
          },
        }))
      }
    },
    [follow, onStart, put],
  )

  /** Re-attaches to a scan that was already running in the backend (page reload, another tab). */
  const resumeScan = useCallback(
    async (id: string) => {
      if (trackers.current.has(id)) return
      const tracker: Tracker = { silent: true, stopped: false }
      trackers.current.set(id, tracker)
      try {
        const latest = await getLatestScan(id)
        if (latest && latest.state.status === 'running') {
          void follow(id, latest, tracker)
        } else {
          trackers.current.delete(id)
          onRefresh(id)
        }
      } catch {
        trackers.current.delete(id)
      }
    },
    [follow, onRefresh],
  )

  /** The backend scan cannot be aborted, so this only hides the progress and keeps following quietly. */
  const cancelScan = useCallback((id: string) => {
    const tracker = trackers.current.get(id)
    if (tracker) tracker.silent = true
    setScans((current) => {
      if (!current[id]) return current
      const next = { ...current }
      delete next[id]
      return next
    })
  }, [])

  /** Forgets a finished scan (hides its progress/summary UI). */
  const dismissScan = useCallback((id: string) => {
    setScans((current) => {
      if (!current[id] || current[id].status === 'running') return current
      const next = { ...current }
      delete next[id]
      return next
    })
  }, [])

  /** Used when a repository is removed mid-scan. */
  const discardScan = useCallback((id: string) => {
    const tracker = trackers.current.get(id)
    if (tracker) tracker.stopped = true
    trackers.current.delete(id)
    setScans((current) => {
      if (!current[id]) return current
      const next = { ...current }
      delete next[id]
      return next
    })
  }, [])

  return { scans, startScan, resumeScan, cancelScan, dismissScan, discardScan }
}
