import { CircleCheck, RefreshCcw, TriangleAlert } from 'lucide-react'

import type { DependencyInsights as Insights } from '../../types/dependencies'
import { formatNumber } from '../../utils/format'
import { SectionCard } from '../common/SectionCard'
import { Badge } from '../ui/Badge'
import { FileLink } from '../analysis/FileLink'

const COUNT_LABELS: { key: keyof Insights['counts']; label: string; hint: string }[] = [
  { key: 'internal', label: 'Internal', hint: 'files of this repository' },
  { key: 'external', label: 'External', hint: 'declared packages' },
  { key: 'stdlib', label: 'Standard library', hint: 'built into the language' },
  { key: 'unresolved', label: 'Unresolved', hint: 'could not be placed' },
]

/** How the repository's imports were classified, plus circular dependencies. Built from the parsed code. */
export function DependencyInsights({ insights, repositoryId }: { insights: Insights; repositoryId: string | null }) {
  if (!insights.parsed) {
    return (
      <SectionCard title="Import analysis" description="Based on the parsed source code">
        <p className="text-sm text-mute">
          The code of this repository has not been parsed yet, so imports cannot be classified. Scan the repository again from Repository Management:
          parsing runs automatically after a scan.
        </p>
      </SectionCard>
    )
  }

  const total = Object.values(insights.counts).reduce((sum, value) => sum + value, 0)

  return (
    <SectionCard
      title="Import analysis"
      description={`${formatNumber(total)} imports in ${formatNumber(insights.filesWithImports)} files, classified from the parsed source`}
      action={
        insights.isAcyclic ? (
          <Badge tone="ok" icon={<CircleCheck className="size-3" aria-hidden="true" />}>
            No circular dependencies
          </Badge>
        ) : (
          <Badge tone="warn" icon={<RefreshCcw className="size-3" aria-hidden="true" />}>
            {insights.circularGroups.length} circular group{insights.circularGroups.length === 1 ? '' : 's'}
          </Badge>
        )
      }
    >
      <dl className="grid grid-cols-4 gap-3 @max-[56rem]:grid-cols-2 @max-[28rem]:grid-cols-1">
        {COUNT_LABELS.map(({ key, label, hint }) => (
          <div key={key} className="rounded-lg border border-line bg-surface/70 px-3.5 py-3">
            <dt className="text-xs text-mute">{label}</dt>
            <dd className="mt-1 text-xl font-semibold text-ink">{formatNumber(insights.counts[key])}</dd>
            <dd className="mt-0.5 text-[0.6875rem] text-mute">{hint}</dd>
          </div>
        ))}
      </dl>

      {insights.circularGroups.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-mute uppercase">
            <TriangleAlert className="size-3.5 text-warn" aria-hidden="true" />
            Potential circular dependencies
          </h3>
          <ul className="space-y-2">
            {insights.circularGroups.slice(0, 5).map((group) => (
              <li key={group.files.join('|')} className="rounded-lg border border-line bg-surface px-3 py-2.5 text-xs">
                <p className="text-mute">
                  {group.size} files import each other. Example loop:
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  {group.exampleCycle.map((file, index) => (
                    <span key={`${file}-${index}`} className="inline-flex items-center gap-1.5">
                      {index > 0 && <span className="text-mute">→</span>}
                      <FileLink file={file} repositoryId={repositoryId} />
                    </span>
                  ))}
                </p>
              </li>
            ))}
          </ul>
          {insights.cycleNote && <p className="text-[0.6875rem] leading-relaxed text-mute">{insights.cycleNote}</p>}
        </div>
      )}

      {insights.unresolved.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-mute uppercase">Unresolved imports (top {Math.min(5, insights.unresolved.length)})</h3>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {insights.unresolved.slice(0, 5).map((item) => (
              <li key={item.module} className="flex items-start justify-between gap-3 px-3 py-2 text-xs">
                <span className="min-w-0">
                  <code className="font-mono break-all text-ink">{item.module}</code>
                  {item.note && <span className="mt-0.5 block text-mute">{item.note}</span>}
                </span>
                <span className="shrink-0 text-mute">
                  {item.files} file{item.files === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {insights.resolutionNote && <p className="mt-4 text-[0.6875rem] leading-relaxed text-mute">{insights.resolutionNote}</p>}
    </SectionCard>
  )
}
