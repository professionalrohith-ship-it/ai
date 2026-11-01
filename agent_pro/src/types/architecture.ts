export type ArchitectureViewId = 'application' | 'modules' | 'services' | 'imports'

export type ArchitectureNodeType = 'client' | 'frontend' | 'api' | 'service' | 'database' | 'module' | 'file'

export type ConnectionKind = 'http' | 'call' | 'import' | 'data'

export interface ArchitectureNode {
  id: string
  label: string
  type: ArchitectureNodeType
  /** Short secondary line shown inside the node. */
  subtitle?: string
  description: string
  /** Repository-relative file paths that belong to this module (the backend lists the first few). */
  files: string[]
  /** Files in the module (can be more than `files` lists) and the languages found in it. */
  fileCount?: number
  languages?: string[]
  position: { x: number; y: number }
}

export interface ArchitectureEdge {
  id: string
  source: string
  target: string
  label?: string
  kind: ConnectionKind
}

export interface ArchitectureDiagram {
  view: ArchitectureViewId
  title: string
  description: string
  /** TB: top-to-bottom, LR: left-to-right. Decides where connection handles sit. */
  direction: 'TB' | 'LR'
  nodes: ArchitectureNode[]
  edges: ArchitectureEdge[]
}

export interface ArchitectureOverview {
  totalModules: number
  frontendComponents: number
  backendServices: number
  apiConnections: number
}

/** Facts shown next to the diagrams: heuristics note, important files and circular imports. */
export interface ArchitectureInsights {
  /** Why module types are only a guess (from the backend). */
  typeNote: string
  entryPoints: string[]
  importantFiles: { path: string; fanIn: number; fanOut: number; transitiveDependents: number | null }[]
  circularGroups: { size: number; files: string[]; exampleCycle: string[] }[]
  isAcyclic: boolean
  cycleNote: string
  externalPackages: { name: string; files: number }[]
}

export interface ArchitectureData {
  overview: ArchitectureOverview
  diagrams: Record<ArchitectureViewId, ArchitectureDiagram>
  insights: ArchitectureInsights
  /** ISO timestamp of the analysis the data comes from. */
  analysedAt: string
}

/** What the details panel shows for a selected node. */
export interface ModuleDetails {
  node: ArchitectureNode
  incoming: { edge: ArchitectureEdge; from: ArchitectureNode }[]
  outgoing: { edge: ArchitectureEdge; to: ArchitectureNode }[]
}

/** Outcome of asking for a repository's analysis data. Mirrors what a real API would report. */
export type AnalysisResult<T> =
  | { state: 'ready'; data: T }
  | { state: 'in-progress'; message: string }
  | { state: 'failed'; message: string }
  | { state: 'empty'; message: string }
