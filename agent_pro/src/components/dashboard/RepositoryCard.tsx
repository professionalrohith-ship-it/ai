import { ArrowUpRight, Check, Clock, EllipsisVertical, FileCode2, Folder, FolderOpen, Info, ScanSearch, Trash2 } from 'lucide-react'
import type { KeyboardEvent } from 'react'

import type { Repository } from '../../types'
import { cn } from '../../utils/cn'
import { formatNumber, timeAgo } from '../../utils/format'
import { ProgressBar } from '../ui/ProgressBar'
import { DropdownItem, DropdownMenu } from '../ui/DropdownMenu'
import { RepositoryStatusBadge } from './RepositoryStatusBadge'

interface RepositoryCardProps {
  repository: Repository
  selected: boolean
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  onRemove: (id: string) => void
  /** Optional extras used by Repository Management; the Dashboard card renders without them. */
  onViewDetails?: (id: string) => void
  onScan?: (id: string) => void
  /** 0 to 100 while a scan is running for this repository. */
  scanProgress?: number
}

export function RepositoryCard({
  repository,
  selected,
  onSelect,
  onOpen,
  onRemove,
  onViewDetails,
  onScan,
  scanProgress,
}: RepositoryCardProps) {
  const { id, name, path, languages, frameworks, fileCount, lastAnalysed, status } = repository
  const scanning = scanProgress !== undefined

  const handleKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(id)
    }
  }

  return (
    <article
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${name}, ${selected ? 'selected' : 'select'}`}
      onClick={() => onSelect(id)}
      onKeyDown={handleKey}
      className={cn(
        'group relative flex cursor-pointer flex-col rounded-card border bg-card p-5 shadow-card transition duration-300 max-sm:p-4',
        'hover:-translate-y-0.5 hover:bg-card-hover',
        selected ? 'border-brand/70 shadow-glow' : 'border-line hover:border-[#454545]',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-xl ring-1 transition',
            selected ? 'bg-brand text-white ring-brand' : 'bg-brand/10 text-brand ring-brand/20',
          )}
        >
          {selected ? <Check className="size-5" aria-hidden="true" /> : <Folder className="size-5" aria-hidden="true" />}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[0.9375rem] font-semibold text-ink">{name}</h3>
          <p className="mt-0.5 truncate font-mono text-xs text-mute" title={path}>
            {path}
          </p>
        </div>

        <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <DropdownMenu
            ariaLabel={`More actions for ${name}`}
            triggerClassName="grid size-8 place-items-center rounded-lg text-mute transition hover:bg-white/10 hover:text-ink"
            trigger={<EllipsisVertical className="size-4" aria-hidden="true" />}
            panelClassName="w-52"
          >
            {({ close }) => (
              <div className="py-1">
                <DropdownItem
                  icon={<Check className="size-4" aria-hidden="true" />}
                  onClick={() => {
                    onSelect(id)
                    close()
                  }}
                >
                  Set as active
                </DropdownItem>
                <DropdownItem
                  icon={<FolderOpen className="size-4" aria-hidden="true" />}
                  onClick={() => {
                    close()
                    onOpen(id)
                  }}
                >
                  Open repository
                </DropdownItem>
                {onViewDetails && (
                  <DropdownItem
                    icon={<Info className="size-4" aria-hidden="true" />}
                    onClick={() => {
                      close()
                      onViewDetails(id)
                    }}
                  >
                    View details
                  </DropdownItem>
                )}
                {onScan && (
                  <DropdownItem
                    icon={<ScanSearch className="size-4" aria-hidden="true" />}
                    onClick={() => {
                      close()
                      onScan(id)
                    }}
                  >
                    {scanning ? 'View scan progress' : 'Scan repository'}
                  </DropdownItem>
                )}
                <DropdownItem
                  danger
                  icon={<Trash2 className="size-4" aria-hidden="true" />}
                  onClick={() => {
                    close()
                    onRemove(id)
                  }}
                >
                  Remove from list
                </DropdownItem>
              </div>
            )}
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {languages.map((language) => (
          <span
            key={language}
            className="rounded-md border border-brand/25 bg-brand/10 px-2 py-0.5 text-[0.6875rem] font-medium text-brand"
          >
            {language}
          </span>
        ))}
        {frameworks.map((framework) => (
          <span
            key={framework}
            className="rounded-md border border-line bg-white/5 px-2 py-0.5 text-[0.6875rem] font-medium text-mute"
          >
            {framework}
          </span>
        ))}
      </div>

      {scanning && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs text-mute">
            <span>Scan in progress</span>
            <span className="font-mono">{Math.round(scanProgress)}%</span>
          </div>
          <ProgressBar value={scanProgress} label={`Scan progress for ${name}`} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-line pt-4">
        <div className="flex min-w-0 flex-col gap-1.5 text-xs text-mute">
          <span className="inline-flex items-center gap-1.5">
            <FileCode2 className="size-3.5 shrink-0" aria-hidden="true" />
            {fileCount > 0 ? `${formatNumber(fileCount)} files` : 'No files analysed'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3.5 shrink-0" aria-hidden="true" />
            {lastAnalysed ? `Analysed ${timeAgo(lastAnalysed)}` : 'Never analysed'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <RepositoryStatusBadge status={status} />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onOpen(id)
            }}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-white/5 px-3 text-xs font-semibold text-ink transition hover:bg-brand hover:text-white"
          >
            Open
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  )
}
