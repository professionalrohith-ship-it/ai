import { Code2, Info, ListChecks, MapPin, ScanSearch, Stethoscope } from 'lucide-react'

import { NO_CODE_CHANGED_NOTE } from '../../constants/investigation'
import type { Investigation } from '../../types/investigation'
import { formatDateTime } from '../analysis/formatDateTime'
import { FileLink } from '../analysis/FileLink'
import { EmptyState } from '../common/EmptyState'
import { SectionCard } from '../common/SectionCard'
import { Badge } from '../ui/Badge'
import { CodeBlock } from '../ui/CodeBlock'
import { ProgressBar } from '../ui/ProgressBar'
import { ActivityTimeline } from './ExecutionProgress'
import { FindingCard } from './FindingCard'
import { SEVERITY_META, SEVERITY_ORDER, STATUS_META, severityCounts } from './investigationUtils'

function SummaryItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6875rem] font-semibold tracking-wide text-mute uppercase">{label}</dt>
      <dd className="mt-1 text-sm break-words text-ink">{children}</dd>
    </div>
  )
}

function AnalysisBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[0.6875rem] font-semibold tracking-wide text-mute uppercase">{label}</p>
      <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-ink/90">{children}</p>
    </div>
  )
}

const CONFIDENCE_TONE = { low: 'warn', medium: 'info', high: 'ok' } as const

/** Result view: analysis, relevant locations, potential findings, code evidence and recommendations. */
export function InvestigationResults({ investigation }: { investigation: Investigation }) {
  const status = STATUS_META[investigation.status]
  const counts = severityCounts(investigation.findings)
  const evidence = investigation.findings.flatMap((finding) => (finding.evidence ? [{ finding, evidence: finding.evidence }] : []))
  const uniqueEvidence = evidence.filter(
    (entry, position) => evidence.findIndex((other) => other.evidence.file === entry.evidence.file && other.evidence.startLine === entry.evidence.startLine) === position,
  )
  const analysed = investigation.summary || investigation.rootCause || investigation.suggestedSolution
  const locations = investigation.locations ?? []

  return (
    <div className="space-y-6">
      <div role="note" className="flex items-start gap-2.5 rounded-lg border border-brand/20 bg-brand/5 p-3.5 text-xs leading-relaxed text-mute">
        <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
        <p>
          <span className="font-semibold text-ink">{investigation.note ?? NO_CODE_CHANGED_NOTE}</span>
          {investigation.message && <span className="mt-1 block">{investigation.message}</span>}
          {investigation.status === 'no-evidence' && !investigation.message && (
            <span className="mt-1 block">No code matching this description was found in the repository index, so no analysis was attempted.</span>
          )}
        </p>
      </div>

      <SectionCard title="Investigation summary">
        <dl className="grid grid-cols-4 gap-x-6 gap-y-4 @max-[56rem]:grid-cols-2 @max-[28rem]:grid-cols-1">
          <SummaryItem label="Title">{investigation.title}</SummaryItem>
          <SummaryItem label="Status">
            <Badge tone={status.tone}>{status.label}</Badge>
          </SummaryItem>
          <SummaryItem label="Repository">{investigation.repositoryName}</SummaryItem>
          <SummaryItem label="Affected module">{investigation.affectedModule ?? 'Not specified'}</SummaryItem>
          <SummaryItem label="Analysis timestamp">{formatDateTime(investigation.completedAt ?? investigation.createdAt)}</SummaryItem>
          <SummaryItem label="Findings">{investigation.findings.length} potential</SummaryItem>
          <SummaryItem label="AI analysis">{investigation.aiUsed ? 'Used' : 'Not used'}</SummaryItem>
          {investigation.filePath && (
            <SummaryItem label="Relevant file (as entered)">
              <span className="font-mono text-xs">{investigation.filePath}</span>
            </SummaryItem>
          )}
        </dl>

        <div className="mt-5 border-t border-line pt-4">
          <p className="text-[0.6875rem] font-semibold tracking-wide text-mute uppercase">Issue description</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink/90">{investigation.description}</p>
        </div>

        {investigation.errorMessage && (
          <div className="mt-4">
            <CodeBlock code={investigation.errorMessage} language="text" title="Error message (as entered)" showLineNumbers={false} maxHeightClass="max-h-48" />
          </div>
        )}
        {investigation.stackTrace && (
          <div className="mt-4">
            <CodeBlock code={investigation.stackTrace} language="text" title="Stack trace (as entered)" showLineNumbers={false} maxHeightClass="max-h-64" />
          </div>
        )}

        {investigation.findings.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {SEVERITY_ORDER.filter((severity) => counts[severity] > 0).map((severity) => (
              <Badge key={severity} tone={SEVERITY_META[severity].tone}>
                {counts[severity]} {SEVERITY_META[severity].label}
              </Badge>
            ))}
          </div>
        )}
      </SectionCard>

      {analysed && (
        <SectionCard
          title="Analysis"
          description={
            investigation.aiUsed
              ? 'Written by the AI model from the code evidence below. Treat it as a lead to verify.'
              : 'No AI analysis was run, so this lists the code the error points to. Add an AI provider for a root-cause explanation.'
          }
          action={
            investigation.confidence && (
              <Badge tone={CONFIDENCE_TONE[investigation.confidence]} icon={<Stethoscope className="size-3" aria-hidden="true" />}>
                {investigation.confidence} confidence
              </Badge>
            )
          }
        >
          <div className="space-y-4">
            {investigation.summary && <AnalysisBlock label="Problem summary">{investigation.summary}</AnalysisBlock>}
            {investigation.rootCause && <AnalysisBlock label="Likely root cause">{investigation.rootCause}</AnalysisBlock>}
            {investigation.suggestedSolution && <AnalysisBlock label="Suggested solution (not applied)">{investigation.suggestedSolution}</AnalysisBlock>}
            {investigation.aiUsed && investigation.confidenceScore !== undefined && (
              <div>
                <p className="text-[0.6875rem] font-semibold tracking-wide text-mute uppercase">Confidence</p>
                <div className="mt-2 flex items-center gap-3">
                  <ProgressBar value={investigation.confidenceScore} label={`Confidence ${investigation.confidenceScore}%`} className="max-w-sm flex-1" />
                  <span className="font-mono text-xs text-ink">{investigation.confidenceScore}%</span>
                </div>
                <p className="mt-1.5 text-xs text-mute">Capped by how much real evidence was found, regardless of what the model claims.</p>
              </div>
            )}
            {(investigation.caveats ?? []).length > 0 && (
              <div>
                <p className="text-[0.6875rem] font-semibold tracking-wide text-mute uppercase">Caveats</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink/90">
                  {(investigation.caveats ?? []).map((caveat) => (
                    <li key={caveat}>{caveat}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {locations.length > 0 && (
        <SectionCard title="Relevant locations" description="Places in the repository the evidence points to">
          <ul className="space-y-2.5">
            {locations.map((location) => (
              <li key={`${location.path}:${location.line ?? ''}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <MapPin className="size-3.5 shrink-0 translate-y-0.5 text-brand" aria-hidden="true" />
                <FileLink file={location.path} line={location.line} repositoryId={investigation.repositoryId} />
                {location.reason && <span className="min-w-0 text-xs text-mute">{location.reason}</span>}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <section aria-label="Potential findings" className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <ScanSearch className="size-4 text-brand" aria-hidden="true" />
          Potential findings
          <span className="rounded-full bg-white/5 px-2 py-px text-xs font-medium text-mute">{investigation.findings.length}</span>
        </h2>
        {investigation.findings.length === 0 ? (
          <EmptyState icon={ScanSearch} title="No findings" description="The investigation did not produce any potential findings for this description." />
        ) : (
          investigation.findings.map((finding, index) => (
            <FindingCard key={finding.id} finding={finding} repositoryId={investigation.repositoryId} index={index} />
          ))
        )}
      </section>

      {uniqueEvidence.length > 0 && (
        <section aria-label="Code evidence" className="space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Code2 className="size-4 text-brand" aria-hidden="true" />
            Code evidence
            <Badge tone="ok">From your repository</Badge>
          </h2>
          {uniqueEvidence.map(({ finding, evidence: snippet }) => (
            <div key={`${snippet.file}-${snippet.startLine}`} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FileLink file={snippet.file} line={snippet.highlightLines?.[0] ?? snippet.startLine} repositoryId={investigation.repositoryId} />
                <span className="text-xs text-mute">Related to: {finding.title}</span>
              </div>
              <CodeBlock
                code={snippet.code}
                language={snippet.language}
                title={snippet.file}
                startLine={snippet.startLine}
                highlightLines={snippet.highlightLines}
                maxHeightClass="max-h-80"
              />
            </div>
          ))}
        </section>
      )}

      <SectionCard title="Recommendations" description="Suggested next steps. None of them has been applied.">
        <ol className="space-y-2.5">
          {investigation.recommendations.map((item, index) => (
            <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-ink/90">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand/15 text-[0.6875rem] font-semibold text-brand">{index + 1}</span>
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ol>
        {investigation.recommendations.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-mute">
            <ListChecks className="size-4" aria-hidden="true" />
            No recommendations for this investigation.
          </p>
        )}
      </SectionCard>

      {investigation.timeline.length > 0 && (
        <SectionCard title="Activity timeline" description="Steps the investigator performed">
          <ActivityTimeline events={investigation.timeline} />
        </SectionCard>
      )}
    </div>
  )
}
