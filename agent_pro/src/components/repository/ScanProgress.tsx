import { Check, Circle, Loader2, X } from 'lucide-react'

import { SCAN_STAGES } from '../../constants/scan'
import type { ScanProgressState } from '../../types/repository'
import { cn } from '../../utils/cn'
import { formatNumber } from '../../utils/format'
import { Badge } from '../ui/Badge'
import { ProgressBar } from '../ui/ProgressBar'
import { Notice } from './Notice'

interface ScanProgressProps {
  scan: ScanProgressState
  repositoryName: string
}

function Counter({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface/70 px-3.5 py-3">
      <p className="text-[0.6875rem] font-semibold tracking-wide text-mute uppercase">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink">{value}</p>
    </div>
  )
}

/** Live progress of a backend scan: bar, current stage, stage checklist and discovery counters. */
export function ScanProgress({ scan, repositoryName }: ScanProgressProps) {
  const running = scan.status === 'running'
  const failed = scan.status === 'failed'
  const stage = SCAN_STAGES[scan.stageIndex] ?? SCAN_STAGES[0]

  return (
    <div className="space-y-5">
      {failed && (
        <Notice tone="danger">
          <span className="font-semibold">The scan did not finish.</span> {scan.error ?? 'The backend reported an error.'}
        </Notice>
      )}
      {!failed && (scan.errorCount ?? 0) > 0 && (
        <Notice tone="warn">
          {scan.errorCount} file{scan.errorCount === 1 ? '' : 's'} or folder{scan.errorCount === 1 ? '' : 's'} could not be read (for example because of
          permissions). They are left out of the inventory.
        </Notice>
      )}

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-mute">Scanning {repositoryName}</p>
            <p className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-ink" aria-live="polite">
              {running ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-brand" aria-hidden="true" />
              ) : failed ? (
                <X className="size-4 shrink-0 text-danger" aria-hidden="true" />
              ) : (
                <Check className="size-4 shrink-0 text-ok" aria-hidden="true" />
              )}
              <span className="truncate">{stage.label}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone={running ? 'warn' : failed ? 'danger' : 'ok'} pulse={running}>
              {running ? 'Running' : failed ? 'Failed' : 'Completed'}
            </Badge>
            <span className="font-mono text-lg font-semibold text-ink">{Math.round(scan.progress)}%</span>
          </div>
        </div>
        <ProgressBar value={scan.progress} label={`Scan progress, ${stage.label}`} tone={running ? 'brand' : failed ? 'danger' : 'ok'} />
        <p className="mt-2 text-xs text-mute">
          {running
            ? scan.secondsRemaining
              ? `About ${scan.secondsRemaining}s remaining (estimate)`
              : 'Working... the backend cannot estimate the remaining time yet'
            : failed
              ? 'Stopped'
              : 'Finished'}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3 @max-[34rem]:grid-cols-2">
        <Counter label="Files found" value={formatNumber(scan.filesDiscovered)} />
        <Counter label="Folders found" value={formatNumber(scan.foldersDiscovered)} />
        <Counter label="Languages" value={String(scan.languagesDetected.length)} />
        <Counter label="Frameworks" value={String(scan.frameworksDetected.length)} />
      </div>

      {(scan.languagesDetected.length > 0 || scan.frameworksDetected.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {scan.languagesDetected.map((language) => (
            <span key={language} className="rounded-md border border-brand/25 bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
              {language}
            </span>
          ))}
          {scan.frameworksDetected.map((framework) => (
            <span key={framework} className="rounded-md border border-line bg-white/5 px-2 py-0.5 text-xs font-medium text-mute">
              {framework}
            </span>
          ))}
        </div>
      )}

      <ol className="space-y-1.5" aria-label="Scan stages">
        {SCAN_STAGES.map((entry, index) => {
          const done = index < scan.stageIndex || (scan.status === 'completed' && index === scan.stageIndex)
          const current = running && index === scan.stageIndex
          return (
            <li
              key={entry.id}
              aria-current={current ? 'step' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                current ? 'bg-brand/10 text-ink' : done ? 'text-ink/90' : 'text-mute',
              )}
            >
              <span className="grid size-5 shrink-0 place-items-center">
                {done ? (
                  <Check className="size-4 text-ok" aria-hidden="true" />
                ) : current ? (
                  <Loader2 className="size-4 animate-spin text-brand" aria-hidden="true" />
                ) : (
                  <Circle className="size-3 text-[#4a4a4a]" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            </li>
          )
        })}
      </ol>

      <p className="text-xs text-mute">Progress and counters are reported by the backend scanner. Files are only read, never executed.</p>
    </div>
  )
}
