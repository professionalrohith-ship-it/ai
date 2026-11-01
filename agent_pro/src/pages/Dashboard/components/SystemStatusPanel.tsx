import { StatusIndicator } from '../../../components/common/StatusIndicator'
import type { ServiceStatus } from '../../../types'

const LABELS = { online: 'Running', pending: 'Not configured', offline: 'Unavailable' } as const

export function SystemStatusPanel({ services }: { services: ServiceStatus[] }) {
  return (
    <div>
      <ul className="divide-y divide-line">
        {services.map((service) => (
          <li key={service.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                {service.label}
              </p>
              <p className="mt-0.5 truncate text-xs text-mute">{service.detail}</p>
            </div>
            <StatusIndicator state={service.state} label={LABELS[service.state]} className="shrink-0" />
          </li>
        ))}
      </ul>
    </div>
  )
}
