import { ArrowDownToLine, ArrowUpFromLine, FileText, MousePointerClick } from 'lucide-react'

import type { ArchitectureEdge, ArchitectureNode, ModuleDetails } from '../../types/architecture'
import { cn } from '../../utils/cn'
import { FileLink } from '../analysis/FileLink'
import { Badge } from '../ui/Badge'
import { CONNECTION_LABELS, NODE_TYPE_STYLES } from './nodeStyles'

interface NodeDetailsPanelProps {
  details: ModuleDetails | null
  repositoryId: string | null
  onSelectNode: (id: string) => void
  className?: string
}

function ConnectionList({
  title,
  icon: Icon,
  items,
  onSelectNode,
}: {
  title: string
  icon: typeof ArrowDownToLine
  items: { edge: ArchitectureEdge; node: ArchitectureNode }[]
  onSelectNode: (id: string) => void
}) {
  return (
    <section>
      <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-mute uppercase">
        <Icon className="size-3.5" aria-hidden="true" />
        {title}
        <span className="rounded-full bg-white/5 px-1.5 py-px text-[0.625rem] text-mute">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-mute">None in this view.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map(({ edge, node }) => (
            <li key={edge.id}>
              <button
                type="button"
                onClick={() => onSelectNode(node.id)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-left transition hover:border-brand/50 hover:bg-card-hover"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[0.8125rem] font-medium text-ink">{node.label}</span>
                  {edge.label && <span className="block truncate text-[0.6875rem] text-mute">{edge.label}</span>}
                </span>
                <Badge tone={edge.kind === 'http' ? 'brand' : 'neutral'}>{CONNECTION_LABELS[edge.kind]}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Side panel with the selected module's description, files and connections. */
export function NodeDetailsPanel({ details, repositoryId, onSelectNode, className }: NodeDetailsPanelProps) {
  if (!details) {
    return (
      <aside
        className={cn(
          'flex min-h-48 flex-col items-center justify-center rounded-card border border-dashed border-line bg-surface/60 p-6 text-center',
          className,
        )}
      >
        <span className="grid size-11 place-items-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/20">
          <MousePointerClick className="size-5" aria-hidden="true" />
        </span>
        <p className="mt-4 text-sm font-semibold text-ink">Select a module</p>
        <p className="mt-1 max-w-56 text-xs leading-relaxed text-mute">Click a node in the diagram to see its files and connections.</p>
      </aside>
    )
  }

  const { node, incoming, outgoing } = details
  const style = NODE_TYPE_STYLES[node.type]
  const Icon = style.icon

  return (
    <aside aria-label={`Details for ${node.label}`} className={cn('space-y-5 rounded-card border border-line bg-card p-5 shadow-card', className)}>
      <header className="flex items-start gap-3">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl ring-1', style.chip)}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-ink">{node.label}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge tone="brand">{style.label}</Badge>
            {node.fileCount !== undefined && (
              <Badge>
                {node.fileCount} file{node.fileCount === 1 ? '' : 's'}
              </Badge>
            )}
            {(node.languages ?? []).slice(0, 2).map((language) => (
              <Badge key={language}>{language}</Badge>
            ))}
          </div>
        </div>
      </header>

      <p className="text-sm leading-relaxed text-ink/90">{node.description}</p>

      <section>
        <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-mute uppercase">
          <FileText className="size-3.5" aria-hidden="true" />
          Related files
          <span className="rounded-full bg-white/5 px-1.5 py-px text-[0.625rem] text-mute">{node.fileCount ?? node.files.length}</span>
        </h3>
        {node.files.length === 0 ? (
          <p className="mt-2 text-xs text-mute">No repository files (an external package).</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {node.files.map((file) => (
              <li key={file} className="rounded-lg border border-line bg-surface px-3 py-2">
                <FileLink file={file} repositoryId={repositoryId} />
              </li>
            ))}
          </ul>
        )}
        {node.fileCount !== undefined && node.fileCount > node.files.length && node.files.length > 0 && (
          <p className="mt-2 text-[0.6875rem] text-mute">
            Showing the first {node.files.length} of {node.fileCount} files. Use the Repository Explorer for the rest.
          </p>
        )}
      </section>

      <ConnectionList
        title="Incoming connections"
        icon={ArrowDownToLine}
        items={incoming.map(({ edge, from }) => ({ edge, node: from }))}
        onSelectNode={onSelectNode}
      />
      <ConnectionList
        title="Outgoing connections"
        icon={ArrowUpFromLine}
        items={outgoing.map(({ edge, to }) => ({ edge, node: to }))}
        onSelectNode={onSelectNode}
      />
    </aside>
  )
}
