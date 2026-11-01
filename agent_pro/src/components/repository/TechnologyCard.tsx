import type { DetectionConfidence, TechnologyEntry } from '../../types/repository'
import { Badge, type BadgeTone } from '../ui/Badge'

const CONFIDENCE: Record<DetectionConfidence, { label: string; tone: BadgeTone }> = {
  high: { label: 'High confidence', tone: 'ok' },
  medium: { label: 'Medium confidence', tone: 'warn' },
  low: { label: 'Low confidence', tone: 'neutral' },
}

const CATEGORY_LABEL: Record<TechnologyEntry['category'], string> = {
  language: 'Language',
  'frontend-framework': 'Frontend framework',
  'backend-framework': 'Backend framework',
  database: 'Database',
  'dev-tool': 'Development tool',
  configuration: 'Configuration',
}

/** One detected technology: name, version, category, detection source and confidence. */
export function TechnologyCard({ technology }: { technology: TechnologyEntry }) {
  const confidence = CONFIDENCE[technology.confidence]
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface/70 p-4 transition hover:border-[#454545] hover:bg-card-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-ink">{technology.name}</h4>
          <p className="mt-0.5 text-xs text-mute">{CATEGORY_LABEL[technology.category]}</p>
        </div>
        {technology.version && (
          <span className="shrink-0 rounded-md border border-line bg-white/5 px-2 py-0.5 font-mono text-[0.6875rem] text-ink/90">
            v{technology.version}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-mute">
          Source: <span className="font-mono text-ink/80">{technology.source}</span>
        </p>
        <Badge tone={confidence.tone}>{confidence.label}</Badge>
      </div>
    </article>
  )
}
