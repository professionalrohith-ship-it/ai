import { ArrowLeft, FolderGit2, FolderOpen, ScanSearch } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { EmptyState } from '../../components/common/EmptyState'
import { Skeleton } from '../../components/common/LoadingState'
import { PageHeader } from '../../components/common/PageHeader'
import { PrimaryButton } from '../../components/ui/PrimaryButton'
import { RepositoryDetails } from '../../components/repository/RepositoryDetails'
import { explorerPath, ROUTES } from '../../constants/navigation'
import { useAppData } from '../../hooks/useAppData'
import type { RepositoryDetailsTab } from '../../types/repository'

const VALID_TABS: RepositoryDetailsTab[] = ['overview', 'technologies', 'information', 'activity']

/** /repositories/:repositoryId?tab=overview|technologies|information|activity */
export default function RepositoryDetailsPage() {
  const { repositoryId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { status, repositories, scans, scanResults, selectRepository, startScan, cancelScan, dismissScan } = useAppData()

  const repository = repositories.find((entry) => entry.id === repositoryId)
  const requestedTab = params.get('tab') as RepositoryDetailsTab | null
  const tab: RepositoryDetailsTab = requestedTab && VALID_TABS.includes(requestedTab) ? requestedTab : 'overview'

  if (status === 'loading') {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-16" />
        <Skeleton className="h-10" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!repository) {
    return (
      <div className="animate-fade-up py-4">
        <EmptyState
          icon={FolderGit2}
          title="Repository not found"
          description="This repository is not in your workspace. It may have been removed."
          action={<PrimaryButton onClick={() => navigate(ROUTES.repositories)}>Back to repositories</PrimaryButton>}
        />
      </div>
    )
  }

  const scan = scans[repository.id]
  const scanning = scan?.status === 'running'

  return (
    <div className="animate-fade-up space-y-6">
      <button
        type="button"
        onClick={() => navigate(ROUTES.repositories)}
        className="inline-flex items-center gap-2 text-sm font-medium text-mute transition hover:text-brand"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All repositories
      </button>

      <PageHeader
        title={repository.name}
        description={repository.path}
        actions={
          <>
            <PrimaryButton
              variant="secondary"
              icon={<ScanSearch className="size-4" aria-hidden="true" />}
              onClick={() => startScan(repository.id)}
              disabled={scanning}
            >
              {scanning ? 'Scanning...' : 'Scan repository'}
            </PrimaryButton>
            <PrimaryButton
              icon={<FolderOpen className="size-4" aria-hidden="true" />}
              onClick={() => {
                selectRepository(repository.id)
                navigate(explorerPath({ repositoryId: repository.id }))
              }}
            >
              Open in explorer
            </PrimaryButton>
          </>
        }
      />

      <RepositoryDetails
        repository={repository}
        tab={tab}
        onTabChange={(next) =>
          setParams(
            (current) => {
              const updated = new URLSearchParams(current)
              updated.set('tab', next)
              return updated
            },
            { replace: true },
          )
        }
        scan={scan}
        scanResult={scanResults[repository.id]}
        onScan={() => startScan(repository.id)}
        onCancelScan={() => cancelScan(repository.id)}
        onDismissScan={() => dismissScan(repository.id)}
      />
    </div>
  )
}
