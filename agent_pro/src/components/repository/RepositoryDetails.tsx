import { Activity, Boxes, Clock, FileCode2, FolderTree, Info, Layers, ScanSearch } from 'lucide-react'
import type { ReactNode } from 'react'

import { useRepositoryActivity, useRepositoryLanguages, useRepositoryScanResult, useRepositoryTechnologies } from '../../hooks/useRepositoryData'
import type { Repository } from '../../types'
import type { RepositoryDetailsTab, ScanProgressState, ScanResult } from '../../types/repository'
import { formatNumber, timeAgo } from '../../utils/format'
import { EmptyState } from '../common/EmptyState'
import { Skeleton } from '../common/LoadingState'
import { SectionCard } from '../common/SectionCard'
import { ActivityFeed } from '../dashboard/ActivityFeed'
import { RepositoryStatusBadge } from '../dashboard/RepositoryStatusBadge'
import { Badge } from '../ui/Badge'
import { PrimaryButton } from '../ui/PrimaryButton'
import { Tabs, type TabItem } from '../ui/Tabs'
import { LanguageBar } from './LanguageBar'
import { Notice } from './Notice'
import { ScanProgress } from './ScanProgress'
import { ScanSummary } from './ScanSummary'
import { TechnologyGroups } from './TechnologyGroups'
import { formatDate, repositoryHealth } from './format'

interface RepositoryDetailsProps {
  repository: Repository
  tab: RepositoryDetailsTab
  onTabChange: (tab: RepositoryDetailsTab) => void
  scan?: ScanProgressState
  scanResult?: ScanResult
  onScan: () => void
  onCancelScan: () => void
  onDismissScan: () => void
}

const TABS: TabItem[] = [
  { id: 'overview', label: 'Overview', icon: Layers },
  { id: 'technologies', label: 'Technologies', icon: Boxes },
  { id: 'information', label: 'Repository information', icon: Info },
  { id: 'activity', label: 'Recent activity', icon: Activity },
]

function Tile({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-card border border-line bg-card p-4 shadow-card">
      <p className="flex items-center gap-2 text-xs font-medium text-mute">
        <span className="text-brand">{icon}</span>
        {label}
      </p>
      <div className="mt-2.5 min-w-0 truncate text-lg font-semibold text-ink">{children}</div>
    </div>
  )
}

/** One honest sentence built only from what the scanner recorded. */
function analysisSummary(repository: Repository, result: ScanResult | null | undefined): string {
  const main = repository.mainLanguage ?? repository.languages[0]
  const frameworks = repository.frameworks.join(', ')
  switch (repository.status) {
    case 'indexed':
      return `${repository.name} is mainly written in ${main ?? 'an unknown language'}${frameworks ? ` and uses ${frameworks}` : ''}. The scan inventoried ${repository.fileCount.toLocaleString('en-US')} files across ${(repository.folderCount ?? 0).toLocaleString('en-US')} folders${result && result.packageManagers.length > 0 ? `, with ${result.packageManagers.join(', ')} as package manager${result.packageManagers.length > 1 ? 's' : ''}` : ''}.${repository.parsed ? '' : ' Code parsing has not finished yet, so symbols and dependencies may be missing.'}`
    case 'indexing':
      return `${repository.name} is being scanned. Results appear here when the scan finishes.`
    case 'error':
      return `The last scan of ${repository.name} did not complete${repository.lastError ? `: ${repository.lastError}` : '.'} Run the scan again to refresh the inventory.`
    default:
      return `${repository.name} has not been scanned yet. Run a scan to see the file inventory, languages and detected technologies.`
  }
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[11rem_minmax(0,1fr)] gap-4 border-b border-line py-3 text-sm last:border-0 @max-[34rem]:grid-cols-1 @max-[34rem]:gap-1">
      <dt className="text-mute">{label}</dt>
      <dd className="min-w-0 break-words text-ink/90">{children}</dd>
    </div>
  )
}

function OverviewTab({ repository, scan, scanResult, onScan, onCancelScan, onDismissScan }: Omit<RepositoryDetailsProps, 'tab' | 'onTabChange'>) {
  const health = repositoryHealth(repository)
  const folders = repository.folderCount ?? 0
  const stored = useRepositoryScanResult(repository)
  const languageStats = useRepositoryLanguages(repository)
  const result = scanResult ?? stored.data
  const shares = result?.languages ?? languageStats.data ?? []
  const scanning = scan?.status === 'running'

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-5 gap-3 @max-[64rem]:grid-cols-3 @max-[40rem]:grid-cols-2">
        <Tile icon={<FileCode2 className="size-4" aria-hidden="true" />} label="Main language">
          {repository.mainLanguage ?? repository.languages[0] ?? '–'}
        </Tile>
        <Tile icon={<Layers className="size-4" aria-hidden="true" />} label="Total files">
          {repository.fileCount > 0 ? formatNumber(repository.fileCount) : '–'}
        </Tile>
        <Tile icon={<FolderTree className="size-4" aria-hidden="true" />} label="Total folders">
          {folders > 0 ? formatNumber(folders) : '–'}
        </Tile>
        <Tile icon={<Clock className="size-4" aria-hidden="true" />} label="Last scan">
          {timeAgo(repository.lastAnalysed)}
        </Tile>
        <Tile icon={<Info className="size-4" aria-hidden="true" />} label="Status">
          <span className="flex flex-wrap items-center gap-2">
            <RepositoryStatusBadge status={repository.status} />
          </span>
        </Tile>
      </div>

      {scan ? (
        <SectionCard title={scanning ? 'Scan in progress' : scan.status === 'failed' ? 'Scan failed' : 'Latest scan'} description="Progress reported by the backend scanner">
          {scanning || scan.status === 'failed' || !scanResult ? (
            <ScanProgress scan={scan} repositoryName={repository.name} />
          ) : (
            <div className="space-y-4">
              <ScanSummary result={scanResult} repositoryName={repository.name} />
              <PrimaryButton variant="secondary" size="sm" onClick={onDismissScan}>
                Dismiss
              </PrimaryButton>
            </div>
          )}
          {scan.status === 'failed' && (
            <div className="mt-4 flex gap-2">
              <PrimaryButton size="sm" onClick={onScan}>
                Try again
              </PrimaryButton>
              <PrimaryButton variant="secondary" size="sm" onClick={onDismissScan}>
                Dismiss
              </PrimaryButton>
            </div>
          )}
          {scanning && (
            <div className="mt-4">
              <PrimaryButton variant="ghost" size="sm" onClick={onCancelScan}>
                Hide progress
              </PrimaryButton>
            </div>
          )}
        </SectionCard>
      ) : null}

      <div className="grid grid-cols-3 gap-6 @max-[56rem]:grid-cols-1">
        <SectionCard title="Analysis summary" description="Built from the scan results" className="col-span-2 @max-[56rem]:col-span-1">
          <p className="text-sm leading-relaxed text-ink/90">{analysisSummary(repository, result)}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone={health.tone}>{health.label}</Badge>
            {!scanning && (
              <PrimaryButton size="sm" variant="secondary" icon={<ScanSearch className="size-4" aria-hidden="true" />} onClick={onScan}>
                {repository.status === 'not-indexed' ? 'Run first scan' : 'Scan again'}
              </PrimaryButton>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Languages" description="Share of files by language">
          {languageStats.error ? (
            <p className="text-sm text-danger">{languageStats.error}</p>
          ) : shares.length === 0 ? (
            <p className="text-sm text-mute">No languages detected yet.</p>
          ) : (
            <LanguageBar languages={shares} />
          )}
        </SectionCard>
      </div>
    </div>
  )
}

function TechnologiesTab({ repository, onScan }: { repository: Repository; onScan: () => void }) {
  const { data, loading, error } = useRepositoryTechnologies(repository)

  if (repository.status === 'not-indexed') {
    return (
      <EmptyState
        icon={Boxes}
        title="No technologies detected yet"
        description="This repository has not been scanned. Run a scan to see the technologies that were detected."
        action={
          <PrimaryButton icon={<ScanSearch className="size-4" aria-hidden="true" />} onClick={onScan}>
            Run first scan
          </PrimaryButton>
        }
      />
    )
  }
  if (repository.status === 'indexing') {
    return <EmptyState icon={Boxes} title="Scan in progress" description="Technology results appear here as soon as the scan finishes." />
  }
  if (error) return <Notice tone="warn">Technologies could not be loaded: {error}</Notice>
  if (loading || !data) {
    return (
      <div className="grid grid-cols-3 gap-3 @max-[60rem]:grid-cols-2 @max-[36rem]:grid-cols-1" aria-busy="true">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {repository.status === 'error' && (
        <Notice tone="warn">
          The last scan did not complete, so these are the results of the last successful scan.{' '}
          <button type="button" onClick={onScan} className="font-semibold text-brand underline-offset-2 hover:underline">
            Scan again
          </button>
        </Notice>
      )}
      <TechnologyGroups technologies={data} />
    </div>
  )
}

function InformationTab({ repository }: { repository: Repository }) {
  const health = repositoryHealth(repository)
  return (
    <SectionCard title="Repository information" description="Record kept by the backend">
      <dl>
        <InfoRow label="Name">{repository.name}</InfoRow>
        <InfoRow label="Local path">
          <span className="font-mono text-xs">{repository.path}</span>
        </InfoRow>
        <InfoRow label="Description">{repository.description ?? <span className="text-mute">No description</span>}</InfoRow>
        <InfoRow label="Languages">
          {repository.languages.length > 0 ? repository.languages.join(', ') : <span className="text-mute">Not detected yet</span>}
        </InfoRow>
        <InfoRow label="Frameworks">
          {repository.frameworks.length > 0 ? repository.frameworks.join(', ') : <span className="text-mute">Not detected yet</span>}
        </InfoRow>
        <InfoRow label="Files / folders">
          {repository.fileCount > 0
            ? `${formatNumber(repository.fileCount)} files, ${formatNumber(repository.folderCount ?? 0)} folders`
            : 'Not scanned'}
        </InfoRow>
        <InfoRow label="Last scanned">{formatDate(repository.lastAnalysed)}</InfoRow>
        <InfoRow label="Indexing status">
          <RepositoryStatusBadge status={repository.status} />
        </InfoRow>
        <InfoRow label="Repository status">
          <Badge tone={health.tone}>{health.label}</Badge>
        </InfoRow>
        <InfoRow label="Added">{repository.addedAt ? formatDate(repository.addedAt) : 'Unknown'}</InfoRow>
        <InfoRow label="Git">
          {repository.isGit ? (
            <span className="font-mono text-xs">
              {repository.branch ?? 'detached HEAD'}
              {repository.commit ? ` @ ${repository.commit.slice(0, 8)}` : ''}
            </span>
          ) : (
            <span className="text-mute">Not a Git repository</span>
          )}
        </InfoRow>
        <InfoRow label="Code parsing">{repository.parsed ? 'Symbols and dependencies available' : <span className="text-mute">Not parsed yet</span>}</InfoRow>
        {repository.lastError && (
          <InfoRow label="Last error">
            <span className="text-danger">{repository.lastError}</span>
          </InfoRow>
        )}
        <InfoRow label="Identifier">
          <span className="font-mono text-xs">{repository.id}</span>
        </InfoRow>
      </dl>
    </SectionCard>
  )
}

function ActivityTab({ repository }: { repository: Repository }) {
  const { data, loading, error } = useRepositoryActivity(repository)
  return (
    <SectionCard title="Recent activity" description="Scans and agent runs for this repository">
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : loading || !data ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-12" />
          ))}
        </div>
      ) : (
        <ActivityFeed items={data} />
      )}
    </SectionCard>
  )
}

/** Tabbed repository overview: Overview, Technologies, Repository information, Recent activity. */
export function RepositoryDetails(props: RepositoryDetailsProps) {
  const { repository, tab, onTabChange } = props
  return (
    <div className="space-y-6">
      <Tabs tabs={TABS} value={tab} onChange={(id) => onTabChange(id as RepositoryDetailsTab)} ariaLabel="Repository sections" />
      <div role="tabpanel" aria-labelledby={`tab-${tab}`} className="animate-fade-in">
        {tab === 'overview' && <OverviewTab {...props} />}
        {tab === 'technologies' && <TechnologiesTab repository={repository} onScan={props.onScan} />}
        {tab === 'information' && <InformationTab repository={repository} />}
        {tab === 'activity' && <ActivityTab repository={repository} />}
      </div>
    </div>
  )
}
