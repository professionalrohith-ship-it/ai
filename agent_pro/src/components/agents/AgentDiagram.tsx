import '@xyflow/react/dist/style.css'

import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react'
import { useMemo } from 'react'

import { useElementWidth } from '../../hooks/useChatLayout'
import type { Agent, AgentId } from '../../types/agents'
import { cn } from '../../utils/cn'
import { timeAgo } from '../../utils/format'
import { AGENT_ICONS } from './agentMeta'
import { AgentStatusDot } from './AgentStatus'

interface AgentNodeData extends Record<string, unknown> {
  agent: Agent
  selected: boolean
}

type AgentFlowNode = Node<AgentNodeData, 'agent'>

const NODE_WIDTH = 188
const NODE_HEIGHT = 92

function AgentNode({ data }: NodeProps<AgentFlowNode>) {
  const { agent, selected } = data
  const Icon = AGENT_ICONS[agent.icon]
  const supervisor = agent.id === 'supervisor'
  return (
    <div
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      className={cn(
        'cursor-pointer rounded-xl border bg-card p-3 text-left shadow-card transition',
        supervisor && 'bg-gradient-to-br from-[#2a2118] to-card',
        selected ? 'border-brand shadow-glow' : supervisor ? 'border-brand/40' : 'border-line hover:border-[#5a5a5a]',
      )}
    >
      {/* Handles are invisible anchors for the edges; the diagram is read-only. */}
      <Handle id="t" type="target" position={Position.Top} isConnectable={false} className="!opacity-0" />
      <Handle id="st" type="source" position={Position.Top} isConnectable={false} className="!opacity-0" />
      <Handle id="b" type="target" position={Position.Bottom} isConnectable={false} className="!opacity-0" />
      <Handle id="sb" type="source" position={Position.Bottom} isConnectable={false} className="!opacity-0" />
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-lg ring-1',
            supervisor ? 'bg-brand text-white ring-brand' : 'bg-brand/10 text-brand ring-brand/20',
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[0.8125rem] font-semibold text-ink">{agent.shortName}</p>
          <p className="truncate text-[0.6875rem] text-mute">{agent.role}</p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <AgentStatusDot status={agent.status} />
        <span className="truncate text-[0.6875rem] text-[#6f6f6f]">{timeAgo(agent.lastActivity)}</span>
      </div>
    </div>
  )
}

const NODE_TYPES = { agent: AgentNode }

const SPECIALISTS: AgentId[] = [
  'repository-explorer',
  'architecture-analyst',
  'code-intelligence',
  'bug-investigator',
  'dependency-analyst',
  'documentation',
]

/** Wide: three specialists above and three below the Supervisor. Narrow: two columns below it. */
function positions(narrow: boolean): Record<AgentId, { x: number; y: number }> {
  if (narrow) {
    const gap = 16
    const columnX = [0, NODE_WIDTH + gap]
    const rows = [150, 150 + NODE_HEIGHT + 24, 150 + (NODE_HEIGHT + 24) * 2]
    const result = { supervisor: { x: (NODE_WIDTH + gap) / 2, y: 0 } } as Record<AgentId, { x: number; y: number }>
    SPECIALISTS.forEach((id, index) => {
      result[id] = { x: columnX[index % 2], y: rows[Math.floor(index / 2)] }
    })
    return result
  }
  const columnX = [0, NODE_WIDTH + 70, (NODE_WIDTH + 70) * 2]
  const result = { supervisor: { x: columnX[1], y: 170 } } as Record<AgentId, { x: number; y: number }>
  SPECIALISTS.forEach((id, index) => {
    result[id] = { x: columnX[index % 3], y: index < 3 ? 0 : 340 }
  })
  return result
}

interface AgentDiagramProps {
  agents: Agent[]
  selectedId: AgentId | null
  onSelect: (id: AgentId) => void
}

/** Supervisor Agent in the middle, connected to the six specialist agents. Read-only. */
export function AgentDiagram({ agents, selectedId, onSelect }: AgentDiagramProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>(900)
  const narrow = width < 640

  const { nodes, edges } = useMemo(() => {
    const place = positions(narrow)
    const flowNodes: AgentFlowNode[] = agents.map((agent) => ({
      id: agent.id,
      type: 'agent',
      position: place[agent.id],
      data: { agent, selected: agent.id === selectedId },
      draggable: false,
      connectable: false,
    }))
    const flowEdges: Edge[] = agents
      .filter((agent) => agent.id !== 'supervisor')
      .map((agent) => {
        const above = !narrow && SPECIALISTS.indexOf(agent.id) < 3
        return {
          id: `supervisor-${agent.id}`,
          source: 'supervisor',
          target: agent.id,
          sourceHandle: above ? 'st' : 'sb',
          targetHandle: above ? 'b' : 't',
          type: 'smoothstep',
          animated: agent.status === 'working',
          markerEnd: { type: MarkerType.ArrowClosed, color: agent.status === 'working' ? '#F47721' : '#5a5a5a' },
          style: { stroke: agent.status === 'working' ? '#F47721' : '#5a5a5a', strokeWidth: 1.6 },
        }
      })
    return { nodes: flowNodes, edges: flowEdges }
  }, [agents, selectedId, narrow])

  return (
    <div
      ref={ref}
      className="agent-flow h-[30rem] overflow-hidden rounded-card border border-line bg-[#141414] max-sm:h-[34rem]"
      role="group"
      aria-label="Supervisor Agent and specialist agents diagram"
    >
      <ReactFlow
        key={narrow ? 'narrow' : 'wide'}
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={(_, node) => onSelect(node.id as AgentId)}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.3}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        preventScrolling={false}
      >
        <Background gap={22} size={1} color="#2a2a2a" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
    </div>
  )
}
