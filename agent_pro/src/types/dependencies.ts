export type DependencyEcosystem = 'npm' | 'PyPI' | 'Cargo' | 'Go' | 'Maven' | 'NuGet' | 'Composer' | 'RubyGems' | 'Other'

export type DependencyType = 'production' | 'development'

/** Neutral usage indicator. It says nothing about security or freshness. */
export type DependencyUsage = 'imported' | 'declared-only' | 'tooling'

export type DependencyCategory = 'all' | 'production' | 'development' | 'python' | 'javascript' | 'other'

export interface ObservedImport {
  file: string
  /** The import as recorded from the source file, e.g. "import react". */
  statement: string
}

export interface Dependency {
  id: string
  name: string
  /** Version exactly as declared in the manifest. */
  version: string
  ecosystem: DependencyEcosystem
  type: DependencyType
  usage: DependencyUsage
  /** Manifest the dependency is declared in. */
  manifest: string
  description: string
  observedImports: ObservedImport[]
  relatedFiles: string[]
}

export interface DependencyOverview {
  total: number
  production: number
  development: number
  ecosystems: number
}

/** Repository-wide import classification and cycles, from the dependency analysis. */
export interface DependencyInsights {
  /** false when the code has not been parsed: import data (usage, counts) is then missing. */
  parsed: boolean
  counts: Record<'internal' | 'external' | 'stdlib' | 'unresolved', number>
  internalFileEdges: number
  filesWithImports: number
  isAcyclic: boolean
  circularGroups: { size: number; files: string[]; exampleCycle: string[] }[]
  unresolved: { module: string; files: number; note: string | null }[]
  cycleNote: string
  resolutionNote: string
}

export interface DependencyData {
  dependencies: Dependency[]
  analysedAt: string
  insights: DependencyInsights | null
}

export type DependencySortKey = 'name-asc' | 'name-desc' | 'version-asc' | 'version-desc'
