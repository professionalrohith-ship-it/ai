import { CircleCheck } from 'lucide-react'

import type { ScanResult } from '../../types/repository'
import { formatNumber } from '../../utils/format'
import { LanguageBar } from './LanguageBar'
import { Notice } from './Notice'
import { formatDate } from './format'

interface ScanSummaryProps {
  result: ScanResult
  repositoryName: string
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface/70 px-3.5 py-3">
      <p className="text-[0.6875rem] font-semibold tracking-wide text-mute uppercase">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink">{value}</p>
    </div>
  )
}

/** Completion summary shown after a scan finishes. */
export function ScanSummary({ result, repositoryName }: ScanSummaryProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ok/15 text-ok">
          <CircleCheck className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">Scan completed</h3>
          <p className="mt-0.5 text-sm text-mute">
            {repositoryName} was scanned on {formatDate(result.completedAt)} in about {result.durationSeconds}s.
          </p>
        </div>
      </div>

      {result.errorCount > 0 && (
        <Notice tone="warn">
          {result.errorCount} file{result.errorCount === 1 ? '' : 's'} or folder{result.errorCount === 1 ? '' : 's'} could not be read and{' '}
          {result.errorCount === 1 ? 'is' : 'are'} not part of the inventory.
        </Notice>
      )}

      <div className="grid grid-cols-4 gap-3 @max-[34rem]:grid-cols-2">
        <Metric label="Files" value={formatNumber(result.files)} />
        <Metric label="Folders" value={formatNumber(result.folders)} />
        <Metric label="Languages" value={String(result.languages.length)} />
        <Metric label="Technologies" value={String(result.technologyCount)} />
      </div>

      <LanguageBar languages={result.languages} />

      {result.packageManagers.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-mute uppercase">Package managers</p>
          <div className="flex flex-wrap gap-1.5">
            {result.packageManagers.map((manager) => (
              <span key={manager} className="rounded-md border border-line bg-white/5 px-2 py-0.5 text-xs font-medium text-ink/90">
                {manager}
              </span>
            ))}
          </div>
        </div>
      )}

      {result.frameworks.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-mute uppercase">Frameworks identified</p>
          <div className="flex flex-wrap gap-1.5">
            {result.frameworks.map((framework) => (
              <span key={framework} className="rounded-md border border-line bg-white/5 px-2 py-0.5 text-xs font-medium text-ink/90">
                {framework}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
