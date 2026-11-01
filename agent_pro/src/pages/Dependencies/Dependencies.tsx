import { Boxes, FileSearch, Layers, Package, PackageSearch, RefreshCw, Wrench, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { AnalysisGate } from '../../components/analysis/AnalysisGate'
import { FilterSelect } from '../../components/analysis/FilterSelect'
import { RepositorySelect } from '../../components/analysis/RepositorySelect'
import { EmptyState } from '../../components/common/EmptyState'
import { Skeleton } from '../../components/common/LoadingState'
import { PageHeader } from '../../components/common/PageHeader'
import { StatCard } from '../../components/common/StatCard'
import { DependencyDetailsPanel } from '../../components/dependencies/DependencyDetailsPanel'
import { DependencyInsights } from '../../components/dependencies/DependencyInsights'
import { DependencyTable } from '../../components/dependencies/DependencyTable'
import {
  applyFilters,
  CATEGORY_LABEL,
  DEFAULT_FILTERS,
  ecosystemOptions,
  hasActiveFilters,
  inCategory,
  SORT_OPTIONS,
  summarize,
  TYPE_OPTIONS,
  type DependencyFilters,
} from '../../components/dependencies/dependencyUtils'
import { Drawer } from '../../components/ui/Drawer'
import { PrimaryButton } from '../../components/ui/PrimaryButton'
import { SearchInput } from '../../components/ui/SearchInput'
import { Tabs, type TabItem } from '../../components/ui/Tabs'
import { useAppData } from '../../hooks/useAppData'
import { useDependencies } from '../../hooks/useDependencies'
import { useElementWidth } from '../../hooks/useElementWidth'
import type { DependencyCategory, DependencySortKey } from '../../types/dependencies'
import { formatNumber } from '../../utils/format'

const CATEGORIES: DependencyCategory[] = ['all', 'production', 'development', 'python', 'javascript', 'other']
const INLINE_PANEL_MIN_WIDTH = 1000

function DependenciesSkeleton() {
  return (
    <div role="status" aria-label="Loading dependencies" className="space-y-6">
      <div className="grid grid-cols-4 gap-3 @max-[56rem]:grid-cols-2 @max-[28rem]:grid-cols-1">
        {Array.from({ length: 4 }, (_, index) => (
          <StatCard key={index} label="" value="" icon={Package} loading />
        ))}
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  )
}

export default function Dependencies() {
  const { selectedRepositoryId } = useAppData()
  const view = useDependencies(selectedRepositoryId)
  const [filters, setFilters] = useState<DependencyFilters>(DEFAULT_FILTERS)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const pageRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(pageRef)
  const inlinePanel = width >= INLINE_PANEL_MIN_WIDTH

  const all = useMemo(() => view.data?.dependencies ?? [], [view.data])
  const overview = useMemo(() => summarize(all), [all])
  const ecosystems = useMemo(() => ecosystemOptions(all), [all])
  const visible = useMemo(() => applyFilters(all, filters), [all, filters])
  const selected = all.find((dependency) => dependency.id === selectedId) ?? null

  const categoryTabs: TabItem[] = CATEGORIES.map((category) => ({
    id: category,
    label: CATEGORY_LABEL[category],
    count: all.filter((dependency) => inCategory(dependency, category)).length,
  }))

  const update = <K extends keyof DependencyFilters>(key: K, value: DependencyFilters[K]) => setFilters((current) => ({ ...current, [key]: value }))
  const clear = () => setFilters(DEFAULT_FILTERS)
  const filtering = hasActiveFilters(filters)

  return (
    <div ref={pageRef} className="animate-fade-up space-y-6">
      <PageHeader
        title="Dependencies"
        description="Understand which packages and libraries a repository declares and where they are used."
        actions={
          <>
            <RepositorySelect className="w-56 @max-[40rem]:w-full" />
            <PrimaryButton
              variant="secondary"
              icon={<RefreshCw className={`size-4 ${view.refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />}
              onClick={view.refresh}
              disabled={view.status === 'idle' || view.status === 'loading' || view.refreshing}
            >
              {view.refreshing ? 'Refreshing...' : 'Refresh'}
            </PrimaryButton>
          </>
        }
      />

      <AnalysisGate view={view} noun="dependency data" loadingFallback={<DependenciesSkeleton />}>
        <div className="space-y-6">
          <section aria-label="Dependency overview" className="grid grid-cols-4 gap-3 @max-[56rem]:grid-cols-2 @max-[28rem]:grid-cols-1">
            <StatCard label="Total Dependencies" value={formatNumber(overview.total)} hint="Declared in manifest files" icon={Package} />
            <StatCard label="Production" value={formatNumber(overview.production)} hint="Needed to run the app" icon={Boxes} />
            <StatCard label="Development" value={formatNumber(overview.development)} hint="Build, test and lint tooling" icon={Wrench} />
            <StatCard label="Ecosystems Detected" value={formatNumber(overview.ecosystems)} hint="Package managers found" icon={Layers} />
          </section>

          {view.data?.insights && <DependencyInsights insights={view.data.insights} repositoryId={selectedRepositoryId} />}

          {all.length === 0 && (
            <EmptyState
              icon={FileSearch}
              title="No package manifest found"
              description="This repository has no package.json, requirements.txt, pyproject.toml or similar manifest, so there are no declared packages to list."
            />
          )}

          {all.length > 0 && (
            <>
            <Tabs tabs={categoryTabs} value={filters.category} onChange={(id) => update('category', id as DependencyCategory)} ariaLabel="Dependency categories" />

            <section aria-label="Search and filters" className="flex flex-row flex-wrap items-center gap-3 @max-[40rem]:flex-col @max-[40rem]:items-stretch">
              <SearchInput
                value={filters.query}
                onChange={(value) => update('query', value)}
                label="Search dependencies"
                placeholder="Search packages"
                className="min-w-56 flex-1"
              />
              <FilterSelect
                label="Filter by ecosystem"
                value={filters.ecosystem}
                onChange={(value) => update('ecosystem', value)}
                options={ecosystems}
                className="w-48 @max-[40rem]:w-full"
              />
              <FilterSelect
                label="Filter by dependency type"
                value={filters.type}
                onChange={(value) => update('type', value)}
                options={TYPE_OPTIONS}
                className="w-40 @max-[40rem]:w-full"
              />
              <FilterSelect
                label="Sort dependencies"
                value={filters.sort}
                onChange={(value) => update('sort', value as DependencySortKey)}
                options={SORT_OPTIONS}
                className="w-48 @max-[40rem]:w-full"
              />
              {filtering && (
                <PrimaryButton variant="ghost" icon={<X className="size-4" aria-hidden="true" />} onClick={clear}>
                  Clear filters
                </PrimaryButton>
              )}
            </section>

            <p className="text-xs text-mute" aria-live="polite">
              Showing {visible.length} of {all.length} dependencies
            </p>
            </>
          )}

          {all.length === 0 ? null : visible.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title="No dependencies found"
              description="No dependency matches your search and filters. Try different words or clear the filters."
              action={
                <PrimaryButton variant="secondary" onClick={clear}>
                  Clear filters
                </PrimaryButton>
              }
            />
          ) : (
            <div className={inlinePanel && selected ? 'grid grid-cols-[minmax(0,1fr)_22rem] items-start gap-5' : 'block'}>
              <DependencyTable items={visible} selectedId={selectedId} onSelect={setSelectedId} />
              {inlinePanel && selected && (
                <div className="sticky top-20 max-h-[calc(100dvh/var(--zf,1)-7rem)] overflow-y-auto">
                  <DependencyDetailsPanel dependency={selected} repositoryId={selectedRepositoryId} />
                </div>
              )}
            </div>
          )}
        </div>
      </AnalysisGate>

      {!(inlinePanel && selected) && (
        <Drawer open={selected !== null} onClose={() => setSelectedId(null)} title={selected?.name ?? 'Dependency details'}>
          <div className="p-4">
            <DependencyDetailsPanel
              dependency={selected}
              repositoryId={selectedRepositoryId}
              className="border-0 bg-transparent p-0 shadow-none"
            />
          </div>
        </Drawer>
      )}
    </div>
  )
}
