import { Lightbulb, TriangleAlert } from 'lucide-react'

import type { InvestigationFinding } from '../../types/investigation'
import { FileLink } from '../analysis/FileLink'
import { Badge } from '../ui/Badge'
import { ProgressBar } from '../ui/ProgressBar'
import { SEVERITY_META } from './investigationUtils'

interface FindingCardProps {
  finding: InvestigationFinding
  repositoryId: string | null
  index: number
}

/** A potential finding: a lead to check, not a confirmed bug. */
export function FindingCard({ finding, repositoryId, index }: FindingCardProps) {
  const severity = SEVERITY_META[finding.severity]

  return (
    <article className="space-y-4 rounded-card border border-line bg-card p-5 shadow-card max-sm:p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/5 font-mono text-xs text-mute">{index + 1}</span>
          <h3 className="min-w-0 pt-0.5 text-[0.9375rem] leading-snug font-semibold text-ink">{finding.title}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone="neutral">Potential finding</Badge>
          <Badge tone={severity.tone}>{severity.label}</Badge>
        </div>
      </header>

      <p className="text-sm leading-relaxed text-ink/90">{finding.description}</p>

      <div className="grid grid-cols-2 gap-4 @max-[40rem]:grid-cols-1">
        <div>
          <p className="text-[0.6875rem] font-semibold tracking-wide text-mute uppercase">Relevant file</p>
          <div className="mt-1.5">
            <FileLink file={finding.file} line={finding.line} repositoryId={repositoryId} />
          </div>
        </div>
        <div>
          <p className="text-[0.6875rem] font-semibold tracking-wide text-mute uppercase">Confidence</p>
          <div className="mt-2 flex items-center gap-3">
            <ProgressBar value={finding.confidence} label={`Confidence ${finding.confidence}%`} className="flex-1" />
            <span className="font-mono text-xs text-ink">{finding.confidence}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 @max-[40rem]:grid-cols-1">
        <div className="rounded-lg border border-line bg-surface p-3.5">
          <p className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-wide text-mute uppercase">
            <TriangleAlert className="size-3.5 text-warn" aria-hidden="true" />
            Potential impact
          </p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink/90">{finding.impact}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-3.5">
          <p className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-wide text-mute uppercase">
            <Lightbulb className="size-3.5 text-brand" aria-hidden="true" />
            Recommendation
          </p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink/90">{finding.recommendation}</p>
        </div>
      </div>
    </article>
  )
}
