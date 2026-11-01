import { CircleAlert, Database, FileCode2, FolderGit2, FolderPlus, Layers, RefreshCw, SearchX } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { EmptyState } from '../../components/common/EmptyState'
import { LoadingState } from '../../components/common/LoadingState'
import { SectionCard } from '../../components/common/SectionCard'
import { StatCard } from '../../components/common/StatCard'
import { ActivityFeed } from '../../components/dashboard/ActivityFeed'
import { RepositoryCard } from '../../components/dashboard/RepositoryCard'
import { ConfirmationModal } from '../../components/ui/ConfirmationModal'
import { Notice } from '../../components/repository/Notice'
import { PrimaryButton } from '../../components/ui/PrimaryButton'
import { SearchInput } from '../../components/ui/SearchInput'
import { ROUTES } from '../../constants/navigation'
import { useAppData } from '../../hooks/useAppData'
import { errorMessage } from '../../services/http'
import type { Repository } from '../../types'
import { formatNumber } from '../../utils/format'
import { DashboardSkeleton } from './components/DashboardSkeleton'
import { QuickActions } from './components/QuickActions'
import { SystemStatusPanel } from './components/SystemStatusPanel'
import { WelcomeHero } from './components/WelcomeHero'
import './Dashboard.css'

// Recharts is the heaviest dependency; load it only when the dashboard needs it.
const TechnologyChart = lazy(() => import('./components/TechnologyChart'))

function matches(repository: Repository, query: string): boolean {
  const haystack = [repository.name, repository.path, ...repository.languages, ...repository.frameworks]
  return haystack.some((value) => value.toLowerCase().includes(query))
}

function byRecentlyAnalysed(a: Repository, b: Repository): number {
  const aTime = a.lastAnalysed ? new Date(a.lastAnalysed).getTime() : 0
  const bTime = b.lastAnalysed ? new Date(b.lastAnalysed).getTime() : 0
  return bTime - aTime
}

export default function Dashboard() {
  const navigate = useNavigate()
  const {
    status,
    error,
    data,
    repositories,
    stats,
    selectedRepositoryId,
    selectRepository,
    removeRepository,
    reload,
  } = useAppData()

  const [query, setQuery] = useState('')
  const [pendingRemoval, setPendingRemoval] = useState<Repository | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const visibleRepositories = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = needle ? repositories.filter((repo) => matches(repo, needle)) : repositories
    return [...filtered].sort(byRecentlyAnalysed)
  }, [repositories, query])

  const openRepository = (id: string) => {
    selectRepository(id)
    navigate(ROUTES.explorer)
  }

  const requestRemoval = (id: string) => {
    setPendingRemoval(repositories.find((repo) => repo.id === id) ?? null)
  }

  const confirmRemoval = async () => {
    const target = pendingRemoval
    setPendingRemoval(null)
    if (!target) return
    try {
      await removeRepository(target.id)
      setRemoveError(null)
    } catch (reason) {
      setRemoveError(errorMessage(reason, 'The repository could not be removed.'))
    }
  }

  const loading = status === 'loading'

  return (
    <div className="animate-fade-up space-y-6">
      <WelcomeHero />

      {status === 'error' && (
        <EmptyState
          tone="error"
          icon={CircleAlert}
          title="We could not load your workspace"
          description={error ?? 'Something went wrong while loading the dashboard.'}
          action={
            <PrimaryButton icon={<RefreshCw className="size-4" aria-hidden="true" />} onClick={reload}>
              Try again
            </PrimaryButton>
          }
        />
      )}

      {removeError && (
        <Notice tone="danger" onDismiss={() => setRemoveError(null)}>
          {removeError}
        </Notice>
      )}

      {status !== 'error' && (
        <section aria-label="Repository overview" className="grid grid-cols-4 gap-3 @max-[56rem]:grid-cols-2 @max-[28rem]:grid-cols-1">
          <StatCard
            label="Total Repositories"
            value={formatNumber(stats?.totalRepositories ?? 0)}
            hint="Connected to this workspace"
            icon={FolderGit2}
            loading={loading}
          />
          <StatCard
            label="Indexed Repositories"
            value={formatNumber(stats?.indexedRepositories ?? 0)}
            hint={stats ? `${stats.totalRepositories - stats.indexedRepositories} not fully indexed` : undefined}
            icon={Database}
            loading={loading}
          />
          <StatCard
            label="Files Analysed"
            value={formatNumber(stats?.filesAnalysed ?? 0)}
            hint="Across all repositories"
            icon={FileCode2}
            loading={loading}
          />
          <StatCard
            label="Technologies Detected"
            value={formatNumber(stats?.technologiesDetected ?? 0)}
            hint="Languages, frameworks and tools"
            icon={Layers}
            loading={loading}
          />
        </section>
      )}

      {loading && <DashboardSkeleton />}

      {status === 'ready' && data && (
        <div className="grid grid-cols-3 gap-6 @max-[56rem]:grid-cols-1">
          <div className="@container col-span-2 min-w-0 space-y-6 @max-[56rem]:col-span-1">
            <section aria-label="Quick actions">
              <h2 className="mb-3 text-sm font-semibold text-ink">Quick actions</h2>
              <QuickActions />
            </section>

            <section aria-label="Recent repositories">
              <div className="mb-3 flex flex-row items-center justify-between gap-3 @max-[34rem]:flex-col @max-[34rem]:items-stretch">
                <h2 className="text-sm font-semibold text-ink">
                  Recent repositories
                  <span className="ml-2 font-normal text-mute">({visibleRepositories.length})</span>
                </h2>
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  label="Search repositories"
                  placeholder="Search by name, path or language"
                  className="w-72 @max-[34rem]:w-full"
                />
              </div>

              {repositories.length === 0 ? (
                <EmptyState
                  icon={FolderPlus}
                  title="No repositories yet"
                  description="Add your first repository to start exploring its structure, dependencies and architecture."
                  action={
                    <PrimaryButton
                      icon={<FolderPlus className="size-4" aria-hidden="true" />}
                      onClick={() => navigate(ROUTES.repositories)}
                    >
                      Add repository
                    </PrimaryButton>
                  }
                />
              ) : visibleRepositories.length === 0 ? (
                <EmptyState
                  icon={SearchX}
                  title="No matching repositories"
                  description={`Nothing matches "${query.trim()}". Try a different name, path or language.`}
                  action={
                    <PrimaryButton variant="secondary" onClick={() => setQuery('')}>
                      Clear search
                    </PrimaryButton>
                  }
                />
              ) : (
                <div className="grid grid-cols-2 gap-4 @max-[36rem]:grid-cols-1">
                  {visibleRepositories.map((repository) => (
                    <RepositoryCard
                      key={repository.id}
                      repository={repository}
                      selected={repository.id === selectedRepositoryId}
                      onSelect={selectRepository}
                      onOpen={openRepository}
                      onRemove={requestRemoval}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="@container min-w-0 space-y-6">
            <SectionCard title="Technology distribution" description="Share of source code by language across indexed repositories">
              {data.technologies.length === 0 ? (
                <p className="py-6 text-center text-sm text-mute">Scan a repository to see which languages it uses.</p>
              ) : (
                <Suspense fallback={<LoadingState label="Loading chart..." />}>
                  <TechnologyChart data={data.technologies} />
                </Suspense>
              )}
            </SectionCard>

            <SectionCard title="Recent activity" description="Latest scans and agent tasks">
              <ActivityFeed items={data.activity} />
            </SectionCard>

            <SectionCard title="System status" description="Service health at a glance">
              <SystemStatusPanel services={data.services} />
            </SectionCard>
          </div>
        </div>
      )}

      <ConfirmationModal
        open={pendingRemoval !== null}
        danger
        title="Remove repository?"
        description={`"${pendingRemoval?.name ?? ''}" and its scan data will be removed from CODEMIND AI. Your files are not touched.`}
        confirmLabel="Remove"
        onConfirm={confirmRemoval}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  )
}
