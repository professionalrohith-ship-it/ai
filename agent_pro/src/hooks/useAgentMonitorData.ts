import { useCallback, useEffect, useState } from 'react'

import { getAiStatus, type AiStatus } from '../services/api/ai'
import { agentsApi } from '../services/api/agents'
import { errorMessage } from '../services/http'
import type { AgentMonitorData } from '../types/agents'

type Status = 'loading' | 'ready' | 'error'

/** Loads the Agent Monitor data (run history) and the AI provider status, with loading, error and retry handling. */
export function useAgentMonitorData() {
  const [status, setStatus] = useState<Status>('loading')
  const [data, setData] = useState<AgentMonitorData | null>(null)
  const [ai, setAi] = useState<AiStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([agentsApi.getMonitorData(), getAiStatus().catch(() => null)])
      .then(([result, aiStatus]) => {
        if (cancelled) return
        setData(result)
        setAi(aiStatus)
        setStatus('ready')
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setError(errorMessage(reason, 'Could not load the agent data.'))
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const reload = useCallback(() => {
    setStatus('loading')
    setError(null)
    setAttempt((value) => value + 1)
  }, [])

  return { status, data, ai, error, reload }
}
