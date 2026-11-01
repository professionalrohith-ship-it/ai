import { CHART_COLORS } from '../../constants/theme'
import type {
  ActivityItem,
  AppNotification,
  DashboardData,
  Repository,
  ServiceStatus,
  TechnologyShare,
} from '../../types'
import { apiRequest } from '../http'
import { getAiStatus, type AiStatus } from './ai'
import {
  agentRunToActivity,
  getRepositoryLanguages,
  getRepositoryTechnologies,
  listAgentRuns,
  listRepositories,
} from './repositories'

// The dashboard is assembled from real backend data. Only the repository list is required: if the
// backend is unreachable that request fails and the page shows its error state with a retry button.
// Everything else (activity, technology chart, AI status) degrades to an empty/"unknown" value.

export interface HealthState {
  online: boolean
}

export async function checkBackendHealth(): Promise<HealthState> {
  try {
    await apiRequest('/health', { timeoutMs: 5000 })
    return { online: true }
  } catch {
    return { online: false }
  }
}

export function buildServices(health: HealthState, ai: AiStatus | null): ServiceStatus[] {
  const providerLabel = ai?.provider === 'ollama' ? 'Ollama' : ai?.provider ? `${ai.provider}` : 'AI provider'
  const aiDetail = !ai
    ? 'Status unavailable'
    : ai.configured
      ? `${providerLabel}${ai.endpoint ? ` at ${ai.endpoint}` : ''}`
      : 'Not configured'
  return [
    { id: 'frontend', label: 'Frontend', detail: 'Running in this browser', state: 'online' },
    {
      id: 'backend',
      label: 'Backend',
      detail: health.online ? 'FastAPI service responding' : 'Not reachable. Start the backend (see README.md).',
      state: health.online ? 'online' : 'offline',
    },
    {
      id: 'ollama',
      label: ai?.provider && ai.provider !== 'ollama' ? 'AI Provider' : 'Ollama',
      detail: aiDetail,
      state: !ai ? 'pending' : !ai.configured ? 'offline' : ai.reachable === false ? 'offline' : 'online',
    },
    {
      id: 'model',
      label: 'AI Model',
      detail: ai?.configured ? (ai.model ?? 'Model not set') : 'No model configured',
      state: ai?.configured ? 'online' : 'pending',
    },
  ]
}

function buildNotifications(repositories: Repository[], ai: AiStatus | null): AppNotification[] {
  const notes: AppNotification[] = []
  const now = new Date().toISOString()
  if (ai && !ai.configured) {
    notes.push({ id: 'note-ai', title: 'AI provider not configured', body: ai.message, timestamp: now, read: false })
  }
  for (const repo of repositories) {
    if (repo.status === 'error') {
      notes.push({
        id: `note-error-${repo.id}`,
        title: 'Analysis needs attention',
        body: `${repo.name}: ${repo.lastError ?? 'the last scan did not complete.'}`,
        timestamp: repo.lastAnalysed ?? repo.addedAt ?? now,
        read: false,
      })
    } else if (repo.status === 'indexing') {
      notes.push({ id: `note-indexing-${repo.id}`, title: 'Indexing in progress', body: `${repo.name} is being scanned.`, timestamp: now, read: true })
    }
  }
  return notes
}

async function buildTechnologyShares(repositories: Repository[]): Promise<{ shares: TechnologyShare[]; detected: number }> {
  const indexed = repositories.filter((repo) => repo.status === 'indexed')
  const [languageResults, technologyResults] = await Promise.all([
    Promise.allSettled(indexed.map((repo) => getRepositoryLanguages(repo.id))),
    Promise.allSettled(indexed.map((repo) => getRepositoryTechnologies(repo))),
  ])

  const bytes = new Map<string, number>()
  for (const result of languageResults) {
    if (result.status !== 'fulfilled') continue
    for (const language of result.value) bytes.set(language.name, (bytes.get(language.name) ?? 0) + language.bytes)
  }
  const total = [...bytes.values()].reduce((sum, value) => sum + value, 0) || 1
  const shares = [...bytes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value], index) => ({
      name,
      value: Math.max(1, Math.round((value / total) * 100)),
      color: CHART_COLORS[index % CHART_COLORS.length],
    }))

  const names = new Set<string>()
  for (const result of technologyResults) {
    if (result.status === 'fulfilled') for (const tech of result.value) names.add(`${tech.category}:${tech.name}`)
  }
  return { shares, detected: names.size }
}

async function buildActivity(repositories: Repository[]): Promise<ActivityItem[]> {
  const items: ActivityItem[] = []
  for (const repo of repositories) {
    if (repo.lastAnalysed) {
      items.push({
        id: `scan-${repo.id}`,
        type: 'repository-scanned',
        title: 'Repository scanned',
        description: `${repo.fileCount.toLocaleString('en-US')} files discovered`,
        repository: repo.name,
        timestamp: repo.lastAnalysed,
      })
    }
  }
  try {
    const names = new Map(repositories.map((repo) => [repo.id, repo.name]))
    for (const run of await listAgentRuns(20)) items.push(agentRunToActivity(run, run.repositoryName ?? names.get(run.repositoryId) ?? 'repository'))
  } catch {
    // agent history is optional on the dashboard
  }
  return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10)
}

export async function getDashboardData(): Promise<DashboardData> {
  const repositories = await listRepositories() // throws when the backend is unreachable: shown by the page
  const [health, ai, technologies, activity] = await Promise.all([
    checkBackendHealth(),
    getAiStatus().catch(() => null),
    buildTechnologyShares(repositories).catch(() => ({ shares: [] as TechnologyShare[], detected: 0 })),
    buildActivity(repositories).catch(() => [] as ActivityItem[]),
  ])

  return {
    stats: {
      totalRepositories: repositories.length,
      indexedRepositories: repositories.filter((repo) => repo.status === 'indexed').length,
      filesAnalysed: repositories.reduce((sum, repo) => sum + repo.fileCount, 0),
      technologiesDetected: technologies.detected,
    },
    repositories,
    activity,
    technologies: technologies.shares,
    services: buildServices(health, ai),
    notifications: buildNotifications(repositories, ai),
  }
}
