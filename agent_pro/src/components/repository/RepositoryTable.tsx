import { ArrowUpRight, Info, Loader2, ScanSearch, Trash2 } from 'lucide-react'

import type { Repository } from '../../types'
import type { ScanProgressState } from '../../types/repository'
import { cn } from '../../utils/cn'
import { formatNumber, timeAgo } from '../../utils/format'
import { RepositoryStatusBadge } from '../dashboard/RepositoryStatusBadge'
import { Badge } from '../ui/Badge'
import { repositoryHealth } from './format'

interface RepositoryTableProps {
  repositories: Repository[]
  selectedId: string | null
  scans: Record<string, ScanProgressState>
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  onViewDetails: (id: string) => void
  onScan: (id: string) => void
  onRemove: (id: string) => void
}

interface ActionButtonProps {
  label: string
  onClick: () => void
  children: React.ReactNode
  danger?: boolean
  disabled?: boolean
}

function ActionButton({ label, onClick, children, danger, disabled }: ActionButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={cn(
        'grid size-8 place-items-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40',
        danger ? 'text-mute hover:bg-danger/10 hover:text-danger' : 'text-mute hover:bg-white/10 hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

/** Table view of the repositories with per-row actions. */
export function RepositoryTable({ repositories, selectedId, scans, onSelect, onOpen, onViewDetails, onScan, onRemove }: RepositoryTableProps) {
  return (
    <div className="max-w-full overflow-x-auto rounded-card border border-line bg-card shadow-card">
      <table className="w-full min-w-[62rem] border-collapse text-left text-sm">
        <thead className="border-b border-line bg-surface text-[0.6875rem] tracking-wide text-mute uppercase">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">Repository</th>
            <th scope="col" className="px-3 py-3 font-semibold">Technologies</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Files</th>
            <th scope="col" className="px-3 py-3 font-semibold">Last scanned</th>
            <th scope="col" className="px-3 py-3 font-semibold">Indexing</th>
            <th scope="col" className="px-3 py-3 font-semibold">Status</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {repositories.map((repository) => {
            const scan = scans[repository.id]
            const scanning = scan?.status === 'running'
            const health = repositoryHealth(repository)
            const selected = repository.id === selectedId
            return (
              <tr
                key={repository.id}
                onClick={() => onSelect(repository.id)}
                aria-selected={selected}
                className={cn('cursor-pointer transition hover:bg-white/[0.04]', selected && 'bg-brand/[0.07] shadow-[inset_3px_0_0_var(--brand)]')}
              >
                <td className="max-w-[16rem] px-4 py-3.5">
                  <p className="truncate font-semibold text-ink">{repository.name}</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-mute" title={repository.path}>
                    {repository.path}
                  </p>
                </td>
                <td className="max-w-[14rem] px-3 py-3.5">
                  <div className="flex flex-wrap gap-1">
                    {repository.languages.length === 0 && repository.frameworks.length === 0 && (
                      <span className="text-xs text-mute">Not detected yet</span>
                    )}
                    {repository.languages.map((language) => (
                      <span key={language} className="rounded-md border border-brand/25 bg-brand/10 px-1.5 py-px text-[0.6875rem] font-medium text-brand">
                        {language}
                      </span>
                    ))}
                    {repository.frameworks.map((framework) => (
                      <span key={framework} className="rounded-md border border-line bg-white/5 px-1.5 py-px text-[0.6875rem] font-medium text-mute">
                        {framework}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-3.5 text-right font-mono text-xs text-ink/90">
                  {repository.fileCount > 0 ? formatNumber(repository.fileCount) : '–'}
                </td>
                <td className="px-3 py-3.5 text-xs whitespace-nowrap text-mute">{timeAgo(repository.lastAnalysed)}</td>
                <td className="px-3 py-3.5">
                  <div className="flex flex-col items-start gap-1.5">
                    <RepositoryStatusBadge status={repository.status} />
                    {scanning && <span className="font-mono text-[0.6875rem] text-warn">{Math.round(scan.progress)}% scanned</span>}
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  <Badge tone={health.tone}>{health.label}</Badge>
                </td>
                <td className="px-3 py-3.5">
                  <div className="flex items-center justify-end gap-0.5">
                    <ActionButton label={`Open ${repository.name}`} onClick={() => onOpen(repository.id)}>
                      <ArrowUpRight className="size-4" aria-hidden="true" />
                    </ActionButton>
                    <ActionButton label={`View details of ${repository.name}`} onClick={() => onViewDetails(repository.id)}>
                      <Info className="size-4" aria-hidden="true" />
                    </ActionButton>
                    <ActionButton label={`${scanning ? 'View scan of' : 'Scan'} ${repository.name}`} onClick={() => onScan(repository.id)}>
                      {scanning ? <Loader2 className="size-4 animate-spin text-warn" aria-hidden="true" /> : <ScanSearch className="size-4" aria-hidden="true" />}
                    </ActionButton>
                    <ActionButton label={`Remove ${repository.name}`} danger onClick={() => onRemove(repository.id)}>
                      <Trash2 className="size-4" aria-hidden="true" />
                    </ActionButton>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
