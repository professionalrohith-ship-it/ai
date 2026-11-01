import { CircleAlert, Database, FolderGit2, Hourglass, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { ROUTES } from '../../constants/navigation'
import type { AnalysisView } from '../../hooks/useArchitectureAnalysis'
import { EmptyState } from '../common/EmptyState'
import { LoadingState } from '../common/LoadingState'
import { PrimaryButton } from '../ui/PrimaryButton'

interface AnalysisGateProps {
  view: Pick<AnalysisView<unknown>, 'status' | 'message' | 'refresh'>
  /** What is being analysed, for the messages ("architecture data", "dependency data"). */
  noun: string
  children: ReactNode
  loadingFallback?: ReactNode
}

/** Renders the right state for an analysis: no repository, loading, in progress, failed, empty or ready. */
export function AnalysisGate({ view, noun, children, loadingFallback }: AnalysisGateProps) {
  const navigate = useNavigate()
  const manage = (
    <PrimaryButton variant="secondary" icon={<FolderGit2 className="size-4" aria-hidden="true" />} onClick={() => navigate(ROUTES.repositories)}>
      Go to Repository Management
    </PrimaryButton>
  )

  switch (view.status) {
    case 'idle':
      return (
        <EmptyState
          icon={FolderGit2}
          title="No repository selected"
          description={`Choose a repository from the selector above to see its ${noun}.`}
          action={manage}
        />
      )
    case 'loading':
      return <>{loadingFallback ?? <LoadingState label={`Loading ${noun}...`} />}</>
    case 'in-progress':
      return (
        <EmptyState
          icon={Hourglass}
          title="Analysis in progress"
          description={view.message ?? `The ${noun} are still being prepared.`}
          action={
            <PrimaryButton variant="secondary" icon={<RefreshCw className="size-4" aria-hidden="true" />} onClick={view.refresh}>
              Check again
            </PrimaryButton>
          }
        />
      )
    case 'failed':
    case 'error':
      return (
        <EmptyState
          tone="error"
          icon={CircleAlert}
          title="Analysis failed"
          description={view.message ?? `The ${noun} could not be loaded.`}
          action={
            <PrimaryButton icon={<RefreshCw className="size-4" aria-hidden="true" />} onClick={view.refresh}>
              Retry analysis
            </PrimaryButton>
          }
        />
      )
    case 'empty':
      return (
        <EmptyState icon={Database} title="No analysis data available" description={view.message ?? `There are no ${noun} for this repository yet.`} action={manage} />
      )
    case 'ready':
      return <>{children}</>
  }
}
