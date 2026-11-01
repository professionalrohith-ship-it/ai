import { Boxes, Cable, LayoutTemplate, RefreshCw, Server } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { AnalysisGate } from '../../components/analysis/AnalysisGate'
import { formatDateTime } from '../../components/analysis/formatDateTime'
import { RepositorySelect } from '../../components/analysis/RepositorySelect'
import { ArchitectureDiagram } from '../../components/architecture/ArchitectureDiagram'
import { ArchitectureInsights } from '../../components/architecture/ArchitectureInsights'
import { buildModuleDetails } from '../../components/architecture/moduleDetails'
import { NodeDetailsPanel } from '../../components/architecture/NodeDetailsPanel'
import { Skeleton } from '../../components/common/LoadingState'
import { PageHeader } from '../../components/common/PageHeader'
import { StatCard } from '../../components/common/StatCard'
import { Badge } from '../../components/ui/Badge'
import { Drawer } from '../../components/ui/Drawer'
import { PrimaryButton } from '../../components/ui/PrimaryButton'
import { Tabs, type TabItem } from '../../components/ui/Tabs'
import { useAppData } from '../../hooks/useAppData'
import { useArchitecture } from '../../hooks/useArchitecture'
import { useElementWidth } from '../../hooks/useElementWidth'
import type { ArchitectureViewId } from '../../types/architecture'
import { formatNumber } from '../../utils/format'

const VIEW_TABS: TabItem[] = [
  { id: 'application', label: 'Application Architecture' },
  { id: 'modules', label: 'Module Relationships' },
  { id: 'services', label: 'Service Communication' },
  { id: 'imports', label: 'Import Relationships' },
]

/** Width of the page below which the details panel moves into a drawer. */
const INLINE_PANEL_MIN_WIDTH = 900

function ArchitectureSkeleton() {
  return (
    <div role="status" aria-label="Loading architecture" className="space-y-6">
      <div className="grid grid-cols-4 gap-3 @max-[56rem]:grid-cols-2 @max-[28rem]:grid-cols-1">
        {Array.from({ length: 4 }, (_, index) => (
          <StatCard key={index} label="" value="" icon={Boxes} loading />
        ))}
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[34rem] w-full" />
    </div>
  )
}

export default function Architecture() {
  const { selectedRepositoryId } = useAppData()
  const view = useArchitecture(selectedRepositoryId)
  const [diagramView, setDiagramView] = useState<ArchitectureViewId>('application')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const pageRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(pageRef)
  const inlinePanel = width >= INLINE_PANEL_MIN_WIDTH

  const diagram = view.data?.diagrams[diagramView] ?? null
  const details = useMemo(() => (diagram ? buildModuleDetails(diagram, selectedNodeId) : null), [diagram, selectedNodeId])

  const changeView = (id: string) => {
    setDiagramView(id as ArchitectureViewId)
    setSelectedNodeId(null)
  }

  const overview = view.data?.overview

  return (
    <div ref={pageRef} className="animate-fade-up space-y-6">
      <PageHeader
        title="Architecture Explorer"
        description="Visualise your repository structure and understand how its components interact."
        actions={
          <>
            <RepositorySelect className="w-56 @max-[40rem]:w-full" />
            <PrimaryButton
              variant="secondary"
              icon={<RefreshCw className={`size-4 ${view.refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />}
              onClick={view.refresh}
              disabled={view.status === 'idle' || view.status === 'loading' || view.refreshing}
            >
              {view.refreshing ? 'Analysing...' : 'Refresh analysis'}
            </PrimaryButton>
          </>
        }
      />

      <AnalysisGate view={view} noun="architecture data" loadingFallback={<ArchitectureSkeleton />}>
        {overview && diagram && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              {view.refreshing ? (
                <Badge tone="brand" pulse>
                  Analysis in progress
                </Badge>
              ) : (
                <Badge tone="ok">Analysis completed</Badge>
              )}
              <span className="text-xs text-mute">Last analysed {formatDateTime(view.data?.analysedAt)}</span>
            </div>

            <section aria-label="Architecture overview" className="grid grid-cols-4 gap-3 @max-[56rem]:grid-cols-2 @max-[28rem]:grid-cols-1">
              <StatCard label="Total Modules" value={formatNumber(overview.totalModules)} hint="Folders with source code" icon={Boxes} />
              <StatCard label="Frontend Components" value={formatNumber(overview.frontendComponents)} hint="Folders that look like UI code" icon={LayoutTemplate} />
              <StatCard label="Backend Services" value={formatNumber(overview.backendServices)} hint="Folders that look like server code" icon={Server} />
              <StatCard label="Module Connections" value={formatNumber(overview.apiConnections)} hint="Folder pairs that import each other" icon={Cable} />
            </section>

            <Tabs tabs={VIEW_TABS} value={diagramView} onChange={changeView} ariaLabel="Architecture views" />

            <div className={inlinePanel ? 'grid grid-cols-[minmax(0,1fr)_21rem] items-start gap-5' : 'block'}>
              <ArchitectureDiagram diagram={diagram} selectedId={selectedNodeId} onSelect={setSelectedNodeId} />
              {inlinePanel && (
                <NodeDetailsPanel
                  details={details}
                  repositoryId={selectedRepositoryId}
                  onSelectNode={setSelectedNodeId}
                  className="sticky top-20 max-h-[calc(100dvh/var(--zf,1)-7rem)] overflow-y-auto"
                />
              )}
            </div>
            {!inlinePanel && <p className="text-center text-xs text-mute">Tap a node to open its details.</p>}

            {view.data?.insights && <ArchitectureInsights insights={view.data.insights} repositoryId={selectedRepositoryId} />}
          </div>
        )}
      </AnalysisGate>

      {!inlinePanel && (
        <Drawer open={details !== null} onClose={() => setSelectedNodeId(null)} title={details?.node.label ?? 'Module details'}>
          <div className="p-4">
            <NodeDetailsPanel details={details} repositoryId={selectedRepositoryId} onSelectNode={setSelectedNodeId} className="border-0 bg-transparent p-0 shadow-none" />
          </div>
        </Drawer>
      )}
    </div>
  )
}
