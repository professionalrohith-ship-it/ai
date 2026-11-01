import { CircleAlert, FolderPlus, LayoutGrid, RefreshCw, SearchX, Table2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { EmptyState } from '../../components/common/EmptyState'
import { Skeleton } from '../../components/common/LoadingState'
import { PageHeader } from '../../components/common/PageHeader'
import { RepositoryCard } from '../../components/dashboard/RepositoryCard'
import { AddRepositoryModal } from '../../components/repository/AddRepositoryModal'
import { Notice } from '../../components/repository/Notice'
import { RepositoryFilters } from '../../components/repository/RepositoryFilters'
import { RepositorySearch } from '../../components/repository/RepositorySearch'
import { RepositoryTable } from '../../components/repository/RepositoryTable'
import { ScanDialog } from '../../components/repository/ScanDialog'
import { ConfirmationModal } from '../../components/ui/ConfirmationModal'
import { PrimaryButton } from '../../components/ui/PrimaryButton'
import { explorerPath, repositoryDetailsPath } from '../../constants/navigation'
import { useAppData } from '../../hooks/useAppData'
import { usePersistentState } from '../../hooks/usePersistentState'
import { useRepositoryFilters } from '../../hooks/useRepositoryFilters'
import { errorMessage } from '../../services/http'
import type { Repository } from '../../types'
import { cn } from '../../utils/cn'

type ViewMode = 'cards' | 'table'

interface PageNotice {
  tone: 'ok' | 'info' | 'danger'
  text: string
}

export default function RepositoryManagement() {
  const navigate = useNavigate()
  const {
    status,
    error,
    reload,
    repositories,
    selectedRepositoryId,
    selectRepository,
    addRepository,
    removeRepository,
    scans,
    startScan,
  } = useAppData()

  const { filters, update, clear, languages, filtered, hasActiveFilters } = useRepositoryFilters(repositories)
  const [view, setView] = usePersistentState<ViewMode>('codemind.repositories.view', 'cards')
  const [addOpen, setAddOpen] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<Repository | null>(null)
  const [scanDialogId, setScanDialogId] = useState<string | null>(null)
  const [notice, setNotice] = useState<PageNotice | null>(null)

  const openRepository = (id: string) => {
    selectRepository(id)
    navigate(explorerPath({ repositoryId: id }))
  }

  const viewDetails = (id: string) => navigate(repositoryDetailsPath(id))

  const scanRepository = (id: string) => {
    // an already running scan just reopens its progress dialog
    if (scans[id]?.status !== 'running') startScan(id)
    setScanDialogId(id)
  }

  const requestRemoval = (id: string) => setPendingRemoval(repositories.find((repo) => repo.id === id) ?? null)

  const confirmRemoval = async () => {
    const target = pendingRemoval
    setPendingRemoval(null)
    if (!target) return
    try {
      await removeRepository(target.id)
      setNotice({ tone: 'info', text: `"${target.name}" was removed from the workspace. Your files were not touched.` })
    } catch (reason) {
      setNotice({ tone: 'danger', text: errorMessage(reason, `"${target.name}" could not be removed.`) })
    }
  }

  const scanProgressOf = (id: string) => (scans[id]?.status === 'running' ? scans[id].progress : undefined)

  const cards = (
    <div className="grid grid-cols-3 gap-4 @max-[72rem]:grid-cols-2 @max-[44rem]:grid-cols-1">
      {filtered.map((repository) => (
        <RepositoryCard
          key={repository.id}
          repository={repository}
          selected={repository.id === selectedRepositoryId}
          onSelect={selectRepository}
          onOpen={openRepository}
          onRemove={requestRemoval}
          onViewDetails={viewDetails}
          onScan={scanRepository}
          scanProgress={scanProgressOf(repository.id)}
        />
      ))}
    </div>
  )

  let content
  if (status === 'loading') {
    content = (
      <div className="grid grid-cols-3 gap-4 @max-[72rem]:grid-cols-2 @max-[44rem]:grid-cols-1" role="status" aria-label="Loading repositories">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-52" />
        ))}
      </div>
    )
  } else if (status === 'error') {
    content = (
      <EmptyState
        tone="error"
        icon={CircleAlert}
        title="We could not load your repositories"
        description={error ?? 'Something went wrong while loading the workspace.'}
        action={
          <PrimaryButton icon={<RefreshCw className="size-4" aria-hidden="true" />} onClick={reload}>
            Try again
          </PrimaryButton>
        }
      />
    )
  } else if (repositories.length === 0) {
    content = (
      <EmptyState
        icon={FolderPlus}
        title="No repositories yet"
        description="Add your first repository to explore its structure, scan it and see which technologies it uses."
        action={
          <PrimaryButton icon={<FolderPlus className="size-4" aria-hidden="true" />} onClick={() => setAddOpen(true)}>
            Add repository
          </PrimaryButton>
        }
      />
    )
  } else if (filtered.length === 0) {
    content = (
      <EmptyState
        icon={SearchX}
        title="No matching repositories"
        description="No repository matches your search and filters. Try different words or clear the filters."
        action={
          <PrimaryButton variant="secondary" onClick={clear}>
            Clear filters
          </PrimaryButton>
        }
      />
    )
  } else if (view === 'table') {
    content = (
      <>
        <div className="@max-[48rem]:hidden">
          <RepositoryTable
            repositories={filtered}
            selectedId={selectedRepositoryId}
            scans={scans}
            onSelect={selectRepository}
            onOpen={openRepository}
            onViewDetails={viewDetails}
            onScan={scanRepository}
            onRemove={requestRemoval}
          />
        </div>
        <div className="hidden @max-[48rem]:block">{cards}</div>
      </>
    )
  } else {
    content = cards
  }

  const showToolbar = status === 'ready' && repositories.length > 0

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Repository Management"
        description="Manage and organise your software repositories."
        actions={
          <PrimaryButton icon={<FolderPlus className="size-4" aria-hidden="true" />} onClick={() => setAddOpen(true)}>
            Add repository
          </PrimaryButton>
        }
      />

      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      {showToolbar && (
        <section aria-label="Search and filters" className="space-y-3">
          <div className="flex flex-row items-center gap-3 @max-[40rem]:flex-col @max-[40rem]:items-stretch">
            <RepositorySearch value={filters.query} onChange={(value) => update('query', value)} className="min-w-0 flex-1" />
            <div role="group" aria-label="Layout" className="flex shrink-0 rounded-lg border border-line bg-surface p-0.5 @max-[40rem]:self-end">
              {(
                [
                  { id: 'cards', label: 'Card view', icon: LayoutGrid },
                  { id: 'table', label: 'Table view', icon: Table2 },
                ] as const
              ).map((option) => {
                const Icon = option.icon
                const active = view === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setView(option.id)}
                    aria-pressed={active}
                    aria-label={option.label}
                    title={option.label}
                    className={cn(
                      'grid size-9 place-items-center rounded-md transition',
                      active ? 'bg-brand text-white' : 'text-mute hover:bg-white/5 hover:text-ink',
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-row items-end justify-between gap-3 @max-[40rem]:flex-col @max-[40rem]:items-stretch">
            <RepositoryFilters
              filters={filters}
              languages={languages}
              onChange={update}
              onClear={clear}
              hasActiveFilters={hasActiveFilters}
            />
            <p className="shrink-0 pb-2.5 text-sm text-mute" aria-live="polite">
              Showing <span className="font-semibold text-ink">{filtered.length}</span> of{' '}
              <span className="font-semibold text-ink">{repositories.length}</span>{' '}
              {repositories.length === 1 ? 'repository' : 'repositories'}
            </p>
          </div>
        </section>
      )}

      {content}

      <AddRepositoryModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        existing={repositories}
        onAdded={(repository) => {
          addRepository(repository)
          setAddOpen(false)
          clear()
          setNotice({
            tone: 'ok',
            text: `"${repository.name}" was added to the workspace. Run a scan to see its inventory.`,
          })
        }}
      />

      <ScanDialog
        repositoryId={scanDialogId}
        onClose={() => setScanDialogId(null)}
        onViewResults={(id) => {
          setScanDialogId(null)
          navigate(`${repositoryDetailsPath(id)}?tab=technologies`)
        }}
      />

      <ConfirmationModal
        open={pendingRemoval !== null}
        danger
        title="Remove repository?"
        description={`"${pendingRemoval?.name ?? ''}" and its scan data will be removed from this workspace. No folders or files on your computer are deleted.`}
        confirmLabel="Remove repository"
        onConfirm={confirmRemoval}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  )
}
