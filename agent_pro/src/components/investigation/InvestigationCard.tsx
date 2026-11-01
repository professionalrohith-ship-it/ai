import { ArrowRight, Clock, FolderGit2, Search, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { investigationPath } from '../../constants/navigation'
import type { Investigation } from '../../types/investigation'
import { cn } from '../../utils/cn'
import { timeAgo } from '../../utils/format'
import { Badge } from '../ui/Badge'
import { hasResults, SEVERITY_META, SEVERITY_ORDER, STATUS_META, severityCounts } from './investigationUtils'

interface InvestigationCardProps {
  investigation: Investigation
  onDelete?: (id: string) => void
  /** Smaller row used in the "other investigations" list on the details page. */
  compact?: boolean
  active?: boolean
}

/** One entry in the investigation history. */
export function InvestigationCard({ investigation, onDelete, compact = false, active = false }: InvestigationCardProps) {
  const status = STATUS_META[investigation.status]
  const counts = severityCounts(investigation.findings)

  return (
    <article
      className={cn(
        'group relative flex flex-col gap-3 rounded-card border bg-card shadow-card transition duration-300 hover:bg-card-hover',
        compact ? 'p-3.5' : 'p-5 max-sm:p-4',
        active ? 'border-brand/70' : 'border-line hover:border-[#454545]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[0.9375rem] font-semibold text-ink">
            <Link to={investigationPath(investigation.id)} className="after:absolute after:inset-0 after:content-['']">
              {investigation.title}
            </Link>
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mute">
            <span className="inline-flex items-center gap-1.5">
              <FolderGit2 className="size-3.5" aria-hidden="true" />
              {investigation.repositoryName}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" aria-hidden="true" />
              {timeAgo(investigation.createdAt)}
            </span>
          </p>
        </div>
        <Badge tone={status.tone} pulse={investigation.status === 'running'}>
          {status.label}
        </Badge>
      </div>

      {!compact && <p className="line-clamp-2 text-sm leading-relaxed text-mute">{investigation.description}</p>}

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {hasResults(investigation.status) && investigation.findings.length > 0 ? (
            SEVERITY_ORDER.filter((severity) => counts[severity] > 0).map((severity) => (
              <Badge key={severity} tone={SEVERITY_META[severity].tone}>
                {counts[severity]} {SEVERITY_META[severity].label}
              </Badge>
            ))
          ) : (
            <span className="text-xs text-mute">
              {investigation.status === 'running' ? 'Working…' : investigation.status === 'failed' ? 'No findings (did not finish)' : 'No findings'}
            </span>
          )}
          {investigation.affectedModule && !compact && <Badge>{investigation.affectedModule}</Badge>}
        </div>

        <div className="flex items-center gap-1.5">
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(investigation.id)}
              aria-label={`Delete investigation ${investigation.title}`}
              className="grid size-8 place-items-center rounded-lg text-mute transition hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          )}
          {!compact && (
            <span className="inline-flex h-8 items-center gap-1 rounded-lg bg-white/5 px-3 text-xs font-semibold text-ink transition group-hover:bg-brand group-hover:text-white">
              <Search className="size-3.5" aria-hidden="true" />
              {investigation.status === 'running' ? 'Watch' : 'View results'}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </span>
          )}
        </div>
      </div>
    </article>
  )
}
