import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'

import type { ArchitectureNodeType } from '../../types/architecture'
import { cn } from '../../utils/cn'
import { NODE_TYPE_STYLES } from './nodeStyles'

export type ArchNodeData = {
  label: string
  subtitle?: string
  type: ArchitectureNodeType
  selected: boolean
  dimmed: boolean
  direction: 'TB' | 'LR'
}

export type ArchFlowNode = Node<ArchNodeData, 'arch'>

/** Custom React Flow node: icon chip, name and a short caption. */
export function ArchitectureNodeCard({ data }: NodeProps<ArchFlowNode>) {
  const style = NODE_TYPE_STYLES[data.type]
  const Icon = style.icon
  const vertical = data.direction === 'TB'

  return (
    <div
      className={cn(
        'flex w-[11.5rem] items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 shadow-card transition duration-200',
        data.selected ? 'border-brand shadow-glow' : 'border-line hover:border-[#4a4a4a]',
        data.dimmed && 'opacity-45',
      )}
    >
      <Handle type="target" position={vertical ? Position.Top : Position.Left} className="!size-1.5 !border-0 !bg-[#555]" />
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg ring-1', style.chip)}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.8125rem] leading-tight font-semibold text-ink">{data.label}</span>
        {data.subtitle && <span className="mt-0.5 block truncate text-[0.6875rem] leading-tight text-mute">{data.subtitle}</span>}
      </span>
      <Handle type="source" position={vertical ? Position.Bottom : Position.Right} className="!size-1.5 !border-0 !bg-[#555]" />
    </div>
  )
}
