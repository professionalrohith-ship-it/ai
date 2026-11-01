import {
  Background,
  BackgroundVariant,
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type OnError,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Maximize2, Minus, Plus } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'

import type { ArchitectureDiagram as DiagramData } from '../../types/architecture'
import { cn } from '../../utils/cn'
import { ArchitectureNodeCard, type ArchFlowNode } from './ArchitectureNodeCard'
import './ArchitectureDiagram.css'
import { EDGE_COLORS, NODE_TYPE_STYLES } from './nodeStyles'

const NODE_TYPES = { arch: ArchitectureNodeCard }
const FIT_OPTIONS = { padding: 0.16, duration: 350 }

// React Flow reports error 004 ("parent has no size") for a split second while the window or an
// emulated viewport is resized; the diagram sizes itself right afterwards. That one code is
// ignored, every other message is still logged.
const handleFlowError: OnError = (code, message) => {
  if (code === '004') return
  console.warn(message)
}

interface ArchitectureDiagramProps {
  diagram: DiagramData
  selectedId: string | null
  onSelect: (id: string | null) => void
  className?: string
}

function ToolbarButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center text-mute transition hover:bg-white/10 hover:text-ink"
    >
      {children}
    </button>
  )
}

function Flow({ diagram, selectedId, onSelect }: Omit<ArchitectureDiagramProps, 'className'>) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()

  const connected = useMemo(() => {
    const set = new Set<string>()
    if (!selectedId) return set
    set.add(selectedId)
    diagram.edges.forEach((edge) => {
      if (edge.source === selectedId) set.add(edge.target)
      if (edge.target === selectedId) set.add(edge.source)
    })
    return set
  }, [diagram.edges, selectedId])

  const nodes = useMemo<ArchFlowNode[]>(
    () =>
      diagram.nodes.map((node) => ({
        id: node.id,
        type: 'arch',
        position: node.position,
        draggable: false,
        selected: node.id === selectedId,
        data: {
          label: node.label,
          subtitle: node.subtitle,
          type: node.type,
          direction: diagram.direction,
          selected: node.id === selectedId,
          dimmed: selectedId !== null && !connected.has(node.id),
        },
      })),
    [diagram.nodes, diagram.direction, selectedId, connected],
  )

  const edges = useMemo<Edge[]>(
    () =>
      diagram.edges.map((edge) => {
        const active = selectedId !== null && (edge.source === selectedId || edge.target === selectedId)
        const dimmed = selectedId !== null && !active
        const color = active ? '#F47721' : EDGE_COLORS[edge.kind]
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label,
          type: 'smoothstep',
          animated: edge.kind === 'http' && !dimmed,
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
          style: { stroke: color, strokeWidth: active ? 2.25 : 1.5, opacity: dimmed ? 0.25 : 1 },
          labelStyle: { fill: active ? '#f5f5f5' : '#a0a0a0', fontSize: 11, fontWeight: 500 },
          labelBgStyle: { fill: '#181818', fillOpacity: 0.95 },
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 5,
        }
      }),
    [diagram.edges, selectedId],
  )

  return (
    <ReactFlow
      className="arch-flow"
      colorMode="dark"
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      fitView
      fitViewOptions={FIT_OPTIONS}
      minZoom={0.15}
      maxZoom={1.75}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      zoomOnScroll={false}
      preventScrolling={false}
      panOnDrag
      onNodeClick={(_, node) => onSelect(node.id === selectedId ? null : node.id)}
      onPaneClick={() => onSelect(null)}
      onError={handleFlowError}
      aria-label={`${diagram.title} diagram`}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} />
      <Panel position="top-right" className="!m-3">
        <div className="flex overflow-hidden rounded-lg border border-line bg-surface/95 shadow-card backdrop-blur">
          <ToolbarButton label="Zoom in" onClick={() => void zoomIn({ duration: 200 })}>
            <Plus className="size-4" aria-hidden="true" />
          </ToolbarButton>
          <span className="w-px bg-line" aria-hidden="true" />
          <ToolbarButton label="Zoom out" onClick={() => void zoomOut({ duration: 200 })}>
            <Minus className="size-4" aria-hidden="true" />
          </ToolbarButton>
          <span className="w-px bg-line" aria-hidden="true" />
          <ToolbarButton label="Fit to screen" onClick={() => void fitView(FIT_OPTIONS)}>
            <Maximize2 className="size-4" aria-hidden="true" />
          </ToolbarButton>
        </div>
      </Panel>
    </ReactFlow>
  )
}

/** Interactive diagram for one architecture view. Remounts per view so it fits itself on switch. */
export function ArchitectureDiagram({ diagram, selectedId, onSelect, className }: ArchitectureDiagramProps) {
  const typesInDiagram = useMemo(() => Array.from(new Set(diagram.nodes.map((node) => node.type))), [diagram.nodes])

  return (
    <div className="min-w-0 overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{diagram.title}</h2>
          <p className="mt-0.5 text-xs text-mute">{diagram.description}</p>
        </div>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5" aria-label="Legend">
          {typesInDiagram.map((type) => {
            const style = NODE_TYPE_STYLES[type]
            const Icon = style.icon
            return (
              <li key={type} className="flex items-center gap-1.5 text-[0.6875rem] text-mute">
                <span className={cn('grid size-5 place-items-center rounded-md ring-1', style.chip)}>
                  <Icon className="size-3" aria-hidden="true" />
                </span>
                {style.label}
              </li>
            )
          })}
        </ul>
      </div>
      {/* minHeight is inline on purpose: React Flow needs a non-zero parent at mount, even if CSS lands late */}
      <div className={cn('h-[38rem] w-full @max-[40rem]:h-[28rem]', className)} style={{ minHeight: '26rem' }}>
        <ReactFlowProvider key={diagram.view}>
          <Flow diagram={diagram} selectedId={selectedId} onSelect={onSelect} />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
