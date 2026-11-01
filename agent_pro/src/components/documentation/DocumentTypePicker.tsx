import { BookOpen, Boxes, Cable, FileText, Network, Package, type LucideIcon } from 'lucide-react'

import { DOCUMENTATION_TYPES } from '../../constants/documentation'
import type { DocumentationType } from '../../types/documentation'

const ICONS: Record<DocumentationType, LucideIcon> = {
  'project-overview': BookOpen,
  architecture: Network,
  module: Boxes,
  api: Cable,
  'dependency-report': Package,
}

/** Grid of the document types; choosing one opens the generate dialog with it preselected. */
export function DocumentTypePicker({ onPick }: { onPick: (type: DocumentationType) => void }) {
  return (
    <div className="grid grid-cols-4 gap-3 @max-[64rem]:grid-cols-3 @max-[44rem]:grid-cols-2 @max-[28rem]:grid-cols-1">
      {DOCUMENTATION_TYPES.map((type) => {
        const Icon = ICONS[type.id] ?? FileText
        return (
          <button
            key={type.id}
            type="button"
            onClick={() => onPick(type.id)}
            className="group flex flex-col items-start gap-3 rounded-card border border-line bg-card p-4 text-left shadow-card transition duration-300 hover:-translate-y-0.5 hover:border-brand/50 hover:bg-card-hover"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/20 transition group-hover:bg-brand group-hover:text-white">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{type.label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-mute">{type.description}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
