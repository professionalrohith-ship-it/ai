import { BookOpenText, BrainCircuit, Bug, CodeXml, FolderSearch, Network, Package, type LucideIcon } from 'lucide-react'

import type { AgentExecutionStatus, AgentIconKey, AgentId } from '../../types/agents'
import type { BadgeTone } from '../ui/Badge'

export const AGENT_ICONS: Record<AgentIconKey, LucideIcon> = {
  supervisor: BrainCircuit,
  explorer: FolderSearch,
  architecture: Network,
  code: CodeXml,
  bug: Bug,
  dependencies: Package,
  documentation: BookOpenText,
}

/** Icon and display names by agent id, for places that only know the id (chat steps, timeline). */
export const AGENT_META: Record<AgentId, { name: string; shortName: string; icon: LucideIcon }> = {
  supervisor: { name: 'Supervisor Agent', shortName: 'Supervisor', icon: AGENT_ICONS.supervisor },
  'repository-explorer': { name: 'Repository Explorer', shortName: 'Explorer', icon: AGENT_ICONS.explorer },
  'architecture-analyst': { name: 'Architecture Analyst', shortName: 'Architecture', icon: AGENT_ICONS.architecture },
  'code-intelligence': { name: 'Code Intelligence', shortName: 'Code Intel', icon: AGENT_ICONS.code },
  'bug-investigator': { name: 'Bug Investigator', shortName: 'Bug Investigator', icon: AGENT_ICONS.bug },
  'dependency-analyst': { name: 'Dependency Analyst', shortName: 'Dependencies', icon: AGENT_ICONS.dependencies },
  documentation: { name: 'Documentation Agent', shortName: 'Documentation', icon: AGENT_ICONS.documentation },
}

export const STATUS_META: Record<AgentExecutionStatus, { label: string; tone: BadgeTone; dot: string }> = {
  idle: { label: 'Idle', tone: 'neutral', dot: 'bg-[#6b6b6b]' },
  working: { label: 'Working', tone: 'brand', dot: 'bg-brand' },
  completed: { label: 'Completed', tone: 'ok', dot: 'bg-ok' },
  failed: { label: 'Failed', tone: 'danger', dot: 'bg-danger' },
}
