import { ArrowLeft, Bug, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { EmptyState } from '../../components/common/EmptyState'
import { PageHeader } from '../../components/common/PageHeader'
import { SectionCard } from '../../components/common/SectionCard'
import { ExecutionProgress } from '../../components/investigation/ExecutionProgress'
import { InvestigationCard } from '../../components/investigation/InvestigationCard'
import { InvestigationResults } from '../../components/investigation/InvestigationResults'
import { hasResults, STATUS_META } from '../../components/investigation/investigationUtils'
import { Badge } from '../../components/ui/Badge'
import { ConfirmationModal } from '../../components/ui/ConfirmationModal'
import { PrimaryButton } from '../../components/ui/PrimaryButton'
import { investigationPath, ROUTES } from '../../constants/navigation'
import { useInvestigations } from '../../hooks/useInvestigations'
import { timeAgo } from '../../utils/format'

/** /bugs/:investigationId: live progress while running, results when finished. */
export function InvestigationDetail({ investigationId }: { investigationId: string }) {
  const navigate = useNavigate()
  const { investigations, getInvestigation, retryInvestigation, deleteInvestigation } = useInvestigations()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const investigation = getInvestigation(investigationId)

  // a finished run gets its stored id from the backend: move the URL to it
  useEffect(() => {
    if (investigation && investigation.id !== investigationId) navigate(investigationPath(investigation.id), { replace: true })
  }, [investigation, investigationId, navigate])

  if (!investigation) {
    return (
      <div className="animate-fade-up py-4">
        <EmptyState
          icon={Bug}
          title="Investigation not found"
          description="This investigation may have been deleted. Go back to the history to pick another one."
          action={<PrimaryButton onClick={() => navigate(ROUTES.bugs)}>Back to investigations</PrimaryButton>}
        />
      </div>
    )
  }

  const others = investigations.filter((item) => item.id !== investigation.id).slice(0, 4)
  const status = STATUS_META[investigation.status]

  return (
    <div className="animate-fade-up space-y-6">
      <button
        type="button"
        onClick={() => navigate(ROUTES.bugs)}
        className="inline-flex items-center gap-2 text-sm font-medium text-mute transition hover:text-brand"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All investigations
      </button>

      <PageHeader
        title={investigation.title}
        description={`${investigation.repositoryName} · started ${timeAgo(investigation.createdAt)}`}
        actions={
          <>
            <Badge tone={status.tone} pulse={investigation.status === 'running'}>
              {status.label}
            </Badge>
            {investigation.status !== 'running' && (
              <PrimaryButton
                variant="secondary"
                icon={<RefreshCw className="size-4" aria-hidden="true" />}
                onClick={() => retryInvestigation(investigation.id)}
              >
                Run again
              </PrimaryButton>
            )}
            <PrimaryButton variant="ghost" icon={<Trash2 className="size-4" aria-hidden="true" />} onClick={() => setConfirmDelete(true)}>
              Delete
            </PrimaryButton>
          </>
        }
      />

      {hasResults(investigation.status) ? <InvestigationResults investigation={investigation} /> : <ExecutionProgress investigation={investigation} />}

      {others.length > 0 && (
        <SectionCard
          title="Other investigations"
          description="Previous runs in the history"
          action={
            <button type="button" onClick={() => navigate(ROUTES.bugs)} className="text-xs font-medium text-brand transition hover:text-brand-hover">
              View all
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-3 @max-[44rem]:grid-cols-1">
            {others.map((item) => (
              <InvestigationCard key={item.id} investigation={item} compact />
            ))}
          </div>
        </SectionCard>
      )}

      <ConfirmationModal
        open={confirmDelete}
        danger
        title="Delete this investigation?"
        description="It will be removed from the history."
        confirmLabel="Delete"
        onConfirm={() => {
          deleteInvestigation(investigation.id)
          setConfirmDelete(false)
          navigate(ROUTES.bugs)
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
