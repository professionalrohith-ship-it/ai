import { Bug, Plus, SearchX, ServerCrash, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { FilterSelect } from '../../components/analysis/FilterSelect'
import { RepositorySelect } from '../../components/analysis/RepositorySelect'
import { EmptyState } from '../../components/common/EmptyState'
import { Skeleton } from '../../components/common/LoadingState'
import { PageHeader } from '../../components/common/PageHeader'
import { InvestigationCard } from '../../components/investigation/InvestigationCard'
import { filterInvestigations, STATUS_OPTIONS } from '../../components/investigation/investigationUtils'
import { NewInvestigationModal } from '../../components/investigation/NewInvestigationModal'
import { ConfirmationModal } from '../../components/ui/ConfirmationModal'
import { PrimaryButton } from '../../components/ui/PrimaryButton'
import { SearchInput } from '../../components/ui/SearchInput'
import { investigationPath } from '../../constants/navigation'
import { useAppData } from '../../hooks/useAppData'
import { useInvestigations } from '../../hooks/useInvestigations'
import type { Investigation, NewInvestigationInput } from '../../types/investigation'
import { cn } from '../../utils/cn'

/** /bugs: investigation history with search, status filter and the "New investigation" flow. */
export function InvestigationList() {
  const navigate = useNavigate()
  const { selectedRepository } = useAppData()
  const { investigations, status: loadStatus, error: loadError, reload, startInvestigation, deleteInvestigation, actionError } = useInvestigations()

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [onlyActive, setOnlyActive] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Investigation | null>(null)

  const onlyRepositoryId = onlyActive && selectedRepository ? selectedRepository.id : null
  const visible = useMemo(
    () => filterInvestigations(investigations, { query, status, onlyRepositoryId }),
    [investigations, query, status, onlyRepositoryId],
  )
  const filtering = query.trim() !== '' || status !== 'all' || onlyRepositoryId !== null

  const clear = () => {
    setQuery('')
    setStatus('all')
    setOnlyActive(false)
  }

  const submit = (input: NewInvestigationInput) => {
    const id = startInvestigation(input)
    setModalOpen(false)
    navigate(investigationPath(id))
  }

  const confirmDelete = () => {
    if (pendingDelete) deleteInvestigation(pendingDelete.id)
    setPendingDelete(null)
  }

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Bug Investigator"
        description="Investigate potential code issues, trace errors and understand possible root causes."
        actions={
          <>
            <RepositorySelect className="w-56 @max-[40rem]:w-full" />
            <PrimaryButton icon={<Plus className="size-4" aria-hidden="true" />} onClick={() => setModalOpen(true)}>
              New investigation
            </PrimaryButton>
          </>
        }
      />

      {investigations.length > 0 && (
        <section aria-label="Search and filters" className="flex flex-row flex-wrap items-center gap-3 @max-[40rem]:flex-col @max-[40rem]:items-stretch">
          <SearchInput
            value={query}
            onChange={setQuery}
            label="Search investigations"
            placeholder="Search by title, repository or module"
            className="min-w-56 flex-1"
          />
          <FilterSelect label="Filter by status" value={status} onChange={setStatus} options={STATUS_OPTIONS} className="w-44 @max-[40rem]:w-full" />
          <button
            type="button"
            aria-pressed={onlyActive}
            disabled={!selectedRepository}
            onClick={() => setOnlyActive((value) => !value)}
            className={cn(
              'inline-flex h-10 max-w-60 items-center justify-center truncate rounded-lg border px-3.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
              onlyActive ? 'border-brand/60 bg-brand/10 text-brand' : 'border-line bg-surface text-mute hover:border-[#454545] hover:text-ink',
            )}
          >
            {selectedRepository ? `Only ${selectedRepository.name}` : 'Only this repository'}
          </button>
          {filtering && (
            <PrimaryButton variant="ghost" icon={<X className="size-4" aria-hidden="true" />} onClick={clear}>
              Clear filters
            </PrimaryButton>
          )}
        </section>
      )}

      <section aria-label="Investigation history" className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">
          Investigation history
          <span className="ml-2 font-normal text-mute" aria-live="polite">
            ({visible.length})
          </span>
        </h2>

        {actionError && (
          <p role="alert" className="rounded-lg border border-danger/25 bg-danger/10 p-3 text-xs text-danger">
            {actionError}
          </p>
        )}

        {investigations.length === 0 && loadStatus === 'loading' ? (
          <div className="grid grid-cols-2 gap-4 @max-[44rem]:grid-cols-1">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : investigations.length === 0 && loadStatus === 'error' ? (
          <EmptyState
            icon={ServerCrash}
            title="Could not load investigations"
            description={loadError ?? 'The backend did not answer.'}
            action={<PrimaryButton onClick={reload}>Try again</PrimaryButton>}
          />
        ) : investigations.length === 0 ? (
          <EmptyState
            icon={Bug}
            title="No investigations yet"
            description="Describe a problem and CODEMIND AI will look for likely causes in your scanned repository."
            action={
              <PrimaryButton icon={<Plus className="size-4" aria-hidden="true" />} onClick={() => setModalOpen(true)}>
                New investigation
              </PrimaryButton>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No investigations found"
            description="No investigation matches your search and filters. Try different words or clear the filters."
            action={
              <PrimaryButton variant="secondary" onClick={clear}>
                Clear filters
              </PrimaryButton>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 @max-[44rem]:grid-cols-1">
            {visible.map((investigation) => (
              <InvestigationCard key={investigation.id} investigation={investigation} onDelete={() => setPendingDelete(investigation)} />
            ))}
          </div>
        )}
      </section>

      <NewInvestigationModal open={modalOpen} onClose={() => setModalOpen(false)} onSubmit={submit} />

      <ConfirmationModal
        open={pendingDelete !== null}
        danger
        title="Delete this investigation?"
        description={`"${pendingDelete?.title ?? ''}" and its results will be removed from the history.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
