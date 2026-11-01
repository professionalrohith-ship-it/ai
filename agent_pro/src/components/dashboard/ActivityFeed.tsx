import { Activity, Bot, FileText, Network, Package, ScanSearch, type LucideIcon } from 'lucide-react'

import type { ActivityItem, ActivityType } from '../../types'
import { timeAgo } from '../../utils/format'
import { EmptyState } from '../common/EmptyState'

const ICONS: Record<ActivityType, LucideIcon> = {
  'repository-scanned': ScanSearch,
  'dependencies-detected': Package,
  'architecture-analysed': Network,
  'documentation-generated': FileText,
  'agent-task-completed': Bot,
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No activity yet"
        description="Scans, analyses and agent tasks will appear here as they happen."
        className="py-8"
      />
    )
  }

  return (
    <ol className="relative space-y-1">
      {items.map((item, index) => {
        const Icon = ICONS[item.type]
        return (
          <li key={item.id} className="relative flex gap-3.5 pb-4 last:pb-0">
            {index < items.length - 1 && (
              <span className="absolute top-9 bottom-0 left-[1.0625rem] w-px bg-line" aria-hidden="true" />
            )}
            <span className="relative z-10 grid size-[2.125rem] shrink-0 place-items-center rounded-full border border-line bg-surface text-brand">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-sm font-medium text-ink">{item.title}</p>
                <time dateTime={item.timestamp} className="shrink-0 text-xs text-mute">
                  {timeAgo(item.timestamp)}
                </time>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-mute">
                {item.description} · <span className="font-mono text-ink/80">{item.repository}</span>
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
