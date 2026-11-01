import { FolderGit2, FolderSearch, Info, ScanSearch } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { EmptyState } from '../../components/common/EmptyState'
import { Skeleton } from '../../components/common/LoadingState'
import { PageHeader } from '../../components/common/PageHeader'
import { CodeViewer } from '../../components/repository/CodeViewer'
import { FileInformationPanel } from '../../components/repository/FileInformationPanel'
import { Notice } from '../../components/repository/Notice'
import { RepositoryTree } from '../../components/repository/RepositoryTree'
import { SymbolSearch } from '../../components/repository/SymbolSearch'
import { ResizeHandle } from '../../components/repository/ResizeHandle'
import { Drawer } from '../../components/ui/Drawer'
import { PrimaryButton } from '../../components/ui/PrimaryButton'
import { Tabs, type TabItem } from '../../components/ui/Tabs'
import { repositoryDetailsPath, ROUTES } from '../../constants/navigation'
import { useAppData } from '../../hooks/useAppData'
import { usePersistentState } from '../../hooks/usePersistentState'
import { useRepositoryFile, useRepositoryTree } from '../../hooks/useRepositoryData'
import { useRepositoryLayoutMode } from '../../hooks/useRepositoryLayoutMode'
import type { FileTreeNode } from '../../types/repository'

const LEFT = { min: 220, max: 480, initial: 288 }
const RIGHT = { min: 240, max: 460, initial: 300 }

const NARROW_TABS: TabItem[] = [
  { id: 'files', label: 'Files' },
  { id: 'code', label: 'Code' },
  { id: 'info', label: 'Info' },
]

type NarrowTab = 'files' | 'code' | 'info'

const panelClass = 'min-h-0 min-w-0 overflow-hidden rounded-card border border-line bg-card shadow-card'

function countFiles(nodes: FileTreeNode[]): number {
  return nodes.reduce((sum, node) => sum + (node.type === 'file' ? 1 : (node.fileCount ?? 0)), 0)
}

/**
 * /explorer?repo=<id>&file=<path>&line=<n>
 * File tree (left), code viewer (centre) and file information (right). The three panels adapt to the
 * space available: resizable on wide layouts, info in a drawer on medium, tabs on narrow.
 */
export default function RepositoryExplorer() {
  const navigate = useNavigate()
  const { status, repositories, selectedRepository, selectedRepositoryId, selectRepository, startScan, scans } = useAppData()
  const [params, setParams] = useSearchParams()
  const { ref, mode } = useRepositoryLayoutMode()

  const [leftWidth, setLeftWidth] = usePersistentState('codemind.explorer.left', LEFT.initial)
  const [rightWidth, setRightWidth] = usePersistentState('codemind.explorer.right', RIGHT.initial)
  const [narrowTab, setNarrowTab] = useState<NarrowTab>(() => (params.get('file') ? 'code' : 'files'))
  const [infoDrawer, setInfoDrawer] = useState(false)

  // The URL may name a repository (links from other screens); otherwise use the active one.
  const repoParam = params.get('repo')
  const repoFromUrl = repoParam ? repositories.find((entry) => entry.id === repoParam) : undefined
  const repository = repoFromUrl ?? selectedRepository

  useEffect(() => {
    if (repoFromUrl && repoFromUrl.id !== selectedRepositoryId) selectRepository(repoFromUrl.id)
  }, [repoFromUrl, selectedRepositoryId, selectRepository])

  const fileParam = params.get('file')
  const lineValue = Number(params.get('line'))
  const line = Number.isInteger(lineValue) && lineValue > 0 ? lineValue : undefined
  const scanVersion = repository?.lastAnalysed ?? null

  const treeState = useRepositoryTree(repository?.id ?? null, scanVersion)
  const fileState = useRepositoryFile(repository?.id ?? null, fileParam, scanVersion)
  const file = fileState.data
  const fileError = fileState.error
  const selectedPath = fileError ? null : fileParam
  const tree = treeState.data ?? []

  const selectFile = (path: string) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set('file', path)
        next.delete('line')
        return next
      },
      { replace: true },
    )
    setNarrowTab('code')
    setInfoDrawer(false)
  }

  const openAt = (path: string, targetLine: number) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set('file', path)
        next.set('line', String(targetLine))
        return next
      },
      { replace: true },
    )
    setNarrowTab('code')
    setInfoDrawer(false)
  }

  if (status === 'loading') {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-16" />
        <Skeleton className="h-[28rem]" />
      </div>
    )
  }

  if (!repository) {
    return (
      <div className="animate-fade-up space-y-6">
        <PageHeader title="Repository Explorer" description="Browse the structure of an indexed repository." />
        <EmptyState
          icon={FolderGit2}
          title="No repository selected"
          description="Choose a repository in Repository Management to explore its files and folders."
          action={<PrimaryButton onClick={() => navigate(ROUTES.repositories)}>Open Repository Management</PrimaryButton>}
        />
      </div>
    )
  }

  if (repository.status === 'not-indexed' || (!repository.lastAnalysed && repository.status !== 'indexing')) {
    return (
      <div className="animate-fade-up space-y-6">
        <PageHeader title="Repository Explorer" description="Browse the structure of an indexed repository." />
        <EmptyState
          icon={ScanSearch}
          title={`${repository.name} has not been scanned yet`}
          description="Scan the repository first. The scan builds the file inventory, and code parsing adds symbols and dependencies."
          action={
            <PrimaryButton icon={<ScanSearch className="size-4" aria-hidden="true" />} onClick={() => startScan(repository.id)} disabled={scans[repository.id]?.status === 'running'}>
              {scans[repository.id]?.status === 'running' ? 'Scanning...' : 'Scan repository'}
            </PrimaryButton>
          }
        />
      </div>
    )
  }

  const treePanel = (
    <RepositoryTree
      repositoryName={repository.name}
      tree={tree}
      loading={treeState.loading}
      error={treeState.error}
      selectedPath={selectedPath}
      totalFiles={countFiles(tree)}
      onSelectFile={selectFile}
    />
  )

  const viewer = (
    <CodeViewer
      file={file}
      loading={fileState.loading}
      error={fileError}
      requestedPath={fileParam}
      line={line}
      onOpenInfo={mode === 'medium' ? () => setInfoDrawer(true) : undefined}
    />
  )

  const info = (
    <FileInformationPanel
      file={file}
      loading={fileState.loading}
      error={fileError}
      parsed={Boolean(repository.parsed)}
      onOpenFile={selectFile}
      onOpenLine={(target) => {
        if (!fileParam) return
        openAt(fileParam, target)
      }}
    />
  )

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        title="Repository Explorer"
        description="Browse the structure of an indexed repository."
        actions={
          <>
            <PrimaryButton
              variant="secondary"
              icon={<Info className="size-4" aria-hidden="true" />}
              onClick={() => navigate(repositoryDetailsPath(repository.id))}
            >
              {repository.name}
            </PrimaryButton>
          </>
        }
      />

      {repository.status === 'indexing' && (
        <Notice tone="info">This repository is being scanned. The tree and symbols update when the scan finishes.</Notice>
      )}
      {repository.status !== 'indexing' && !repository.parsed && (
        <Notice tone="info">
          Symbols, imports and dependencies are not available yet because the code has not been parsed. Scan the repository again to build them.
        </Notice>
      )}

      <SymbolSearch repositoryId={repository.id} parsed={Boolean(repository.parsed)} onOpen={openAt} />

      <div ref={ref} className="h-[max(32rem,calc(100dvh/var(--zf,1)-var(--header-height)-17rem))]">
        {mode === 'wide' && (
          <div className="grid h-full" style={{ gridTemplateColumns: `${leftWidth}px 8px minmax(0,1fr) 8px ${rightWidth}px` }}>
            <section aria-label="File explorer" className={panelClass}>
              {treePanel}
            </section>
            <ResizeHandle value={leftWidth} min={LEFT.min} max={LEFT.max} onChange={setLeftWidth} grows="right" label="Resize file explorer" />
            <section aria-label="File viewer" className={panelClass}>
              {viewer}
            </section>
            <ResizeHandle value={rightWidth} min={RIGHT.min} max={RIGHT.max} onChange={setRightWidth} grows="left" label="Resize file information" />
            <aside aria-label="File information" className={panelClass}>
              {info}
            </aside>
          </div>
        )}

        {mode === 'medium' && (
          <div className="grid h-full" style={{ gridTemplateColumns: `${leftWidth}px 8px minmax(0,1fr)` }}>
            <section aria-label="File explorer" className={panelClass}>
              {treePanel}
            </section>
            <ResizeHandle value={leftWidth} min={LEFT.min} max={LEFT.max} onChange={setLeftWidth} grows="right" label="Resize file explorer" />
            <section aria-label="File viewer" className={panelClass}>
              {viewer}
            </section>
          </div>
        )}

        {mode === 'narrow' && (
          <div className="flex h-full flex-col gap-3">
            <Tabs tabs={NARROW_TABS} value={narrowTab} onChange={(id) => setNarrowTab(id as NarrowTab)} ariaLabel="Explorer panels" />
            <div className={`${panelClass} flex-1`} role="tabpanel" aria-labelledby={`tab-${narrowTab}`}>
              {narrowTab === 'files' && treePanel}
              {narrowTab === 'code' && viewer}
              {narrowTab === 'info' && info}
            </div>
          </div>
        )}
      </div>

      {mode === 'medium' && (
        <Drawer open={infoDrawer} onClose={() => setInfoDrawer(false)} title="File information">
          {info}
        </Drawer>
      )}

      <p className="flex items-center gap-2 text-xs text-mute">
        <FolderSearch className="size-3.5 text-brand" aria-hidden="true" />
        Tip: use the arrow keys in the tree, and drag the dividers to resize panels on wide screens.
      </p>
    </div>
  )
}
