import { Bot, ListChecks } from 'lucide-react'

import { INVESTIGATION_STEPS } from '../../constants/investigation'
import type { Investigation, InvestigationEvent } from '../../types/investigation'
import { formatTime } from '../analysis/formatDateTime'
import { Badge } from '../ui/Badge'

/** Steps the backend really performed, in order, with their timestamps. */
export function ActivityTimeline({ events }: { events: InvestigationEvent[] }) {
  if (events.length === 0) return <p className="text-xs text-mute">The backend did not report any steps.</p>
  return (
    <ol className="relative space-y-3">
      {events.map((event, index) => (
        <li key={event.id} className="relative flex gap-3">
          {index < events.length - 1 && <span className="absolute top-5 bottom-[-0.75rem] left-[0.4375rem] w-px bg-line" aria-hidden="true" />}
          <span className="relative z-10 mt-1 size-3.5 shrink-0 rounded-full border-2 border-brand bg-surface" />
          <div className="min-w-0">
            <p className="text-xs leading-relaxed text-ink/90">{event.message}</p>
            <p className="mt-0.5 text-[0.6875rem] text-mute">
              {event.agent} · {formatTime(event.at)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** View while the request is pending (indeterminate: the backend reports no live progress) or after a failure. */
export function ExecutionProgress({ investigation }: { investigation: Investigation }) {
  const running = investigation.status === 'running'

  return (
    <section aria-label="Investigation progress" className="space-y-5 rounded-card border border-line bg-card p-5 shadow-card max-sm:p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{running ? 'Investigation in progress' : 'Investigation stopped'}</h2>
          <p className="mt-1 text-xs text-mute">
            {running
              ? 'The Bug Investigator is reading the code evidence. With a local model this can take a few minutes.'
              : 'The investigation did not finish.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={running ? 'brand' : 'danger'} pulse={running}>
            {running ? 'Working' : 'Failed'}
          </Badge>
          <Badge icon={<Bot className="size-3" aria-hidden="true" />}>Bug Investigator</Badge>
        </div>
      </header>

      {running && (
        <div
          role="progressbar"
          aria-label="Investigation in progress"
          className="h-2 w-full overflow-hidden rounded-full bg-white/8"
        >
          <div className="h-full w-full animate-shimmer rounded-full bg-gradient-to-r from-white/5 via-brand to-white/5 bg-[length:200%_100%]" />
        </div>
      )}

      {!running && investigation.failureReason && (
        <p role="alert" className="rounded-lg border border-danger/25 bg-danger/10 p-3 text-xs leading-relaxed text-danger">
          {investigation.failureReason}
        </p>
      )}

      <div>
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-mute uppercase">
          <ListChecks className="size-3.5" aria-hidden="true" />
          What the investigator does
        </h3>
        <ul className="space-y-1.5">
          {INVESTIGATION_STEPS.map((step) => (
            <li key={step} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-[0.8125rem] text-mute">
              <span className="size-1.5 shrink-0 rounded-full bg-brand/70" aria-hidden="true" />
              <span className="min-w-0">{step}</span>
            </li>
          ))}
        </ul>
      </div>

      {investigation.timeline.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-mute uppercase">Activity timeline</h3>
          <ActivityTimeline events={investigation.timeline} />
        </div>
      )}
    </section>
  )
}
