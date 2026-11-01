import { CircleCheck, Info, RefreshCcw, Star } from 'lucide-react'

import type { ArchitectureInsights as Insights } from '../../types/architecture'
import { FileLink } from '../analysis/FileLink'
import { SectionCard } from '../common/SectionCard'
import { Badge } from '../ui/Badge'

/** Facts under the diagrams: most depended-on files, entry points and circular imports. */
export function ArchitectureInsights({ insights, repositoryId }: { insights: Insights; repositoryId: string | null }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-lg border border-brand/20 bg-brand/5 p-3 text-xs leading-relaxed text-mute">
        <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
        <p>{insights.typeNote}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 @max-[56rem]:grid-cols-1">
        <SectionCard title="Important files" description="Most imported by other files of this repository">
          {insights.importantFiles.length === 0 ? (
            <p className="text-sm text-mute">No file is imported by another file yet.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {insights.importantFiles.map((file) => (
                <li key={file.path} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <Star className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
                    <FileLink file={file.path} repositoryId={repositoryId} />
                  </span>
                  <span className="shrink-0 text-[0.6875rem] text-mute">
                    imported by {file.fanIn} · imports {file.fanOut}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {insights.entryPoints.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-mute uppercase">Entry points</h3>
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
                {insights.entryPoints.slice(0, 8).map((path) => (
                  <li key={path}>
                    <FileLink file={path} repositoryId={repositoryId} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Circular dependencies"
          description="Files that import each other, directly or through others"
          action={
            insights.isAcyclic ? (
              <Badge tone="ok" icon={<CircleCheck className="size-3" aria-hidden="true" />}>
                None found
              </Badge>
            ) : (
              <Badge tone="warn" icon={<RefreshCcw className="size-3" aria-hidden="true" />}>
                {insights.circularGroups.length} group{insights.circularGroups.length === 1 ? '' : 's'}
              </Badge>
            )
          }
        >
          {insights.isAcyclic ? (
            <p className="text-sm text-mute">No import cycles were found between the files of this repository.</p>
          ) : (
            <ul className="space-y-2">
              {insights.circularGroups.slice(0, 5).map((group) => (
                <li key={group.files.join('|')} className="rounded-lg border border-line bg-surface px-3 py-2.5 text-xs">
                  <p className="text-mute">{group.size} files are part of this cycle. Example loop:</p>
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
          )}
          {!insights.isAcyclic && insights.cycleNote && <p className="mt-3 text-[0.6875rem] leading-relaxed text-mute">{insights.cycleNote}</p>}
        </SectionCard>
      </div>
    </div>
  )
}
