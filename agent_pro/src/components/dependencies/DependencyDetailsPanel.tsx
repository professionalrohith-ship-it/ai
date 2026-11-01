import { FileText, Package, PackageSearch } from 'lucide-react'

import type { Dependency } from '../../types/dependencies'
import { cn } from '../../utils/cn'
import { FileLink } from '../analysis/FileLink'
import { Badge } from '../ui/Badge'
import { ECOSYSTEM_LABEL, TYPE_LABEL, USAGE_LABEL, USAGE_TONE } from './dependencyUtils'

interface DependencyDetailsPanelProps {
  dependency: Dependency | null
  repositoryId: string | null
  className?: string
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="shrink-0 text-mute">{label}</dt>
      <dd className="min-w-0 text-right text-ink">{children}</dd>
    </div>
  )
}

/** Details for the selected dependency: declaration, observed imports and related files. */
export function DependencyDetailsPanel({ dependency, repositoryId, className }: DependencyDetailsPanelProps) {
  if (!dependency) {
    return (
      <aside
        className={cn(
          'flex min-h-48 flex-col items-center justify-center rounded-card border border-dashed border-line bg-surface/60 p-6 text-center',
          className,
        )}
      >
        <span className="grid size-11 place-items-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/20">
          <PackageSearch className="size-5" aria-hidden="true" />
        </span>
        <p className="mt-4 text-sm font-semibold text-ink">Select a dependency</p>
        <p className="mt-1 max-w-56 text-xs leading-relaxed text-mute">Choose a row to see its version, source manifest and observed imports.</p>
      </aside>
    )
  }

  return (
    <aside aria-label={`Details for ${dependency.name}`} className={cn('space-y-5 rounded-card border border-line bg-card p-5 shadow-card', className)}>
      <header className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/20">
          <Package className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-ink">{dependency.name}</h2>
          <p className="mt-0.5 font-mono text-xs text-mute">{dependency.version}</p>
        </div>
      </header>

      <p className="text-sm leading-relaxed text-ink/90">{dependency.description}</p>

      <dl className="divide-y divide-line rounded-lg border border-line bg-surface px-3.5">
        <Row label="Declared version">
          <span className="font-mono text-xs">{dependency.version}</span>
        </Row>
        <Row label="Ecosystem">{ECOSYSTEM_LABEL[dependency.ecosystem]}</Row>
        <Row label="Dependency type">
          <Badge tone={dependency.type === 'production' ? 'brand' : 'neutral'}>{TYPE_LABEL[dependency.type]}</Badge>
        </Row>
        <Row label="Usage indicator">
          <Badge tone={USAGE_TONE[dependency.usage]}>{USAGE_LABEL[dependency.usage]}</Badge>
        </Row>
        <Row label="Source manifest">
          <FileLink file={dependency.manifest} repositoryId={repositoryId} />
        </Row>
      </dl>

      <section>
        <h3 className="text-xs font-semibold tracking-wide text-mute uppercase">Observed imports</h3>
        {dependency.observedImports.length === 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-mute">No import of this package was found in the parsed source files. It may be used only by tooling or configuration.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {dependency.observedImports.map((item) => (
              <li key={`${item.file}-${item.statement}`} className="rounded-lg border border-line bg-surface p-2.5">
                <FileLink file={item.file} repositoryId={repositoryId} />
                <code className="mt-1.5 block overflow-x-auto font-mono text-[0.75rem] whitespace-pre text-[#ffb27a]">{item.statement}</code>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-mute uppercase">
          <FileText className="size-3.5" aria-hidden="true" />
          Related files
        </h3>
        {dependency.relatedFiles.length === 0 ? (
          <p className="mt-2 text-xs text-mute">No related files recorded.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {dependency.relatedFiles.map((file) => (
              <li key={file} className="rounded-lg border border-line bg-surface px-3 py-2">
                <FileLink file={file} repositoryId={repositoryId} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[0.6875rem] leading-relaxed text-mute">
        The usage indicator only says whether an import was recorded in the parsed source; it does not describe security, licensing or whether newer versions exist.
      </p>
    </aside>
  )
}
