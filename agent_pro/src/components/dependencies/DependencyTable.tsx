import { ChevronRight } from 'lucide-react'

import type { Dependency } from '../../types/dependencies'
import { cn } from '../../utils/cn'
import { Badge } from '../ui/Badge'
import { ECOSYSTEM_LABEL, TYPE_LABEL, USAGE_LABEL, USAGE_TONE } from './dependencyUtils'

interface DependencyTableProps {
  items: Dependency[]
  selectedId: string | null
  onSelect: (id: string) => void
}

/** Dependency list. A full table on wide pages, stacked cards when the page gets narrow. */
export function DependencyTable({ items, selectedId, onSelect }: DependencyTableProps) {
  return (
    <>
      <div className="@container overflow-x-auto rounded-card border border-line bg-card shadow-card @max-[44rem]:hidden">
        <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
          <thead className="bg-surface text-[0.6875rem] tracking-wide text-mute uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                Package
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                Version
              </th>
              <th scope="col" className="px-3 py-3 font-semibold @max-[38rem]:hidden">
                Ecosystem
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                Type
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                Usage
              </th>
              <th scope="col" className="px-3 py-3 font-semibold @max-[50rem]:hidden">
                Source manifest
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((dependency) => {
              const selected = dependency.id === selectedId
              return (
                <tr
                  key={dependency.id}
                  onClick={() => onSelect(dependency.id)}
                  className={cn('cursor-pointer transition-colors', selected ? 'bg-brand/8' : 'hover:bg-white/[0.03]')}
                  aria-selected={selected}
                >
                  <td className="px-4 py-3">
                    <span className="block font-medium text-ink">{dependency.name}</span>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-ink/90">{dependency.version}</td>
                  <td className="px-3 py-3 text-mute @max-[38rem]:hidden">{ECOSYSTEM_LABEL[dependency.ecosystem]}</td>
                  <td className="px-3 py-3">
                    <Badge tone={dependency.type === 'production' ? 'brand' : 'neutral'}>{TYPE_LABEL[dependency.type]}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={USAGE_TONE[dependency.usage]}>{USAGE_LABEL[dependency.usage]}</Badge>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-mute @max-[50rem]:hidden">{dependency.manifest}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onSelect(dependency.id)
                      }}
                      aria-label={`View details for ${dependency.name}`}
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-white/5 px-3 text-xs font-semibold text-ink transition hover:bg-brand hover:text-white"
                    >
                      Details
                      <ChevronRight className="size-3.5" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ul className="hidden gap-3 @max-[44rem]:grid">
        {items.map((dependency) => {
          const selected = dependency.id === selectedId
          return (
            <li key={dependency.id}>
              <button
                type="button"
                onClick={() => onSelect(dependency.id)}
                aria-label={`View details for ${dependency.name}`}
                className={cn(
                  'flex w-full flex-col gap-2.5 rounded-card border bg-card p-4 text-left shadow-card transition',
                  selected ? 'border-brand/70' : 'border-line hover:border-[#454545]',
                )}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 font-semibold break-all text-ink">{dependency.name}</span>
                  <span className="shrink-0 font-mono text-xs text-mute">{dependency.version}</span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <Badge tone={dependency.type === 'production' ? 'brand' : 'neutral'}>{TYPE_LABEL[dependency.type]}</Badge>
                  <Badge>{ECOSYSTEM_LABEL[dependency.ecosystem]}</Badge>
                  <Badge tone={USAGE_TONE[dependency.usage]}>{USAGE_LABEL[dependency.usage]}</Badge>
                </span>
                <span className="font-mono text-xs break-all text-mute">{dependency.manifest}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
