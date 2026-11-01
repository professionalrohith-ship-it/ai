import type {
  AnalysisResult,
  ArchitectureData,
  ArchitectureDiagram,
  ArchitectureEdge,
  ArchitectureNode,
  ArchitectureNodeType,
  ArchitectureViewId,
} from '../../types/architecture'
import { apiRequest, errorMessage } from '../http'
import { blockedReason, getGraphStats } from './analysisShared'
import { columnLayout, rowLayout, TYPE_ORDER, type Point } from './architectureLayout'

// Architecture views built from the backend's parsed-repository data: modules (folders) and the imports
// between them, plus file-level imports from the dependency graph. Nothing is invented on the client.

interface ModuleRecord {
  id: string
  path: string
  label: string
  type: string
  subtitle?: string | null
  description?: string | null
  fileCount?: number
  languages?: string[]
  files?: string[]
}

interface ArchitectureResponse {
  modules: ModuleRecord[]
  edges: { source: string; target: string; imports: number; label?: string | null }[]
  externalPackages?: { name: string; files: number }[]
  entryPoints?: string[]
  analysedAt?: string
  typeNote?: string | null
}

interface GraphResponse {
  nodes: { id: string; type: string; language?: string | null; label?: string | null }[]
  edges: { source: string; target: string; depType: string; count: number }[]
  truncated?: boolean
}

const TYPE_NOTE =
  'Module types (frontend, API, service, database) are guessed from folder names, file types and detected frameworks. They are a reading aid, not a verified layer boundary.'
const NODE_TYPES: ArchitectureNodeType[] = ['client', 'frontend', 'api', 'service', 'database', 'module', 'file']

const asType = (value: string): ArchitectureNodeType => (NODE_TYPES.includes(value as ArchitectureNodeType) ? (value as ArchitectureNodeType) : 'module')
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

function placed(positions: Map<string, Point>, id: string): Point {
  return positions.get(id) ?? { x: 0, y: 0 }
}

function moduleNode(record: ModuleRecord, position: Point): ArchitectureNode {
  const fileCount = record.fileCount ?? record.files?.length ?? 0
  const languages = record.languages ?? []
  return {
    id: record.id,
    label: record.label,
    type: asType(record.type),
    subtitle: record.subtitle ?? plural(fileCount, 'file'),
    description:
      record.description ||
      `The folder "${record.path}" with ${plural(fileCount, 'file')}${languages.length ? ` (${languages.slice(0, 4).join(', ')})` : ''}.`,
    files: record.files ?? [],
    fileCount,
    languages,
    position,
  }
}

const makeEdge = (source: string, target: string, kind: ArchitectureEdge['kind'], label?: string): ArchitectureEdge => ({
  id: `${kind}:${source}->${target}`,
  source,
  target,
  kind,
  label,
})

function moduleEdges(response: ArchitectureResponse, ids: Set<string>): ArchitectureEdge[] {
  return response.edges
    .filter((edge) => edge.source !== edge.target && ids.has(edge.source) && ids.has(edge.target))
    .map((edge) => makeEdge(edge.source, edge.target, 'import', edge.label || plural(edge.imports, 'import')))
}

function applicationView(modules: ModuleRecord[], response: ArchitectureResponse): ArchitectureDiagram {
  const ids = modules.map((module) => module.id)
  const byId = new Map(modules.map((module) => [module.id, module]))
  const positions = rowLayout(ids, (id) => TYPE_ORDER.indexOf(asType(byId.get(id)?.type ?? 'module')))
  return {
    view: 'application',
    title: 'Application architecture',
    description: 'The folders of the repository grouped by their likely role, with the imports between them.',
    direction: 'TB',
    nodes: modules.map((module) => moduleNode(module, placed(positions, module.id))),
    edges: moduleEdges(response, new Set(ids)),
  }
}

function modulesView(modules: ModuleRecord[], response: ArchitectureResponse): ArchitectureDiagram {
  const edges = moduleEdges(response, new Set(modules.map((module) => module.id)))
  const positions = columnLayout(
    modules.map((module) => module.id),
    edges,
  )
  return {
    view: 'modules',
    title: 'Module relationships',
    description: 'Which folders import which, with the number of import statements. Importers are on the left.',
    direction: 'LR',
    nodes: modules.map((module) => moduleNode(module, placed(positions, module.id))),
    edges,
  }
}

function moduleOf(file: string, modules: ModuleRecord[]): ModuleRecord | undefined {
  // longest folder path that contains the file
  return modules.reduce<ModuleRecord | undefined>((best, module) => {
    const inside = module.path === '' || file === module.path || file.startsWith(`${module.path}/`)
    return inside && (!best || module.path.length > best.path.length) ? module : best
  }, undefined)
}

function servicesView(modules: ModuleRecord[], response: ArchitectureResponse, graph: GraphResponse | null): ArchitectureDiagram {
  const backend = modules.filter((module) => ['api', 'service', 'database'].includes(module.type))
  const chosen = backend.length > 0 ? backend : modules.filter((module) => !['client', 'frontend'].includes(module.type))
  const selected = chosen.length > 0 ? chosen : modules
  const ids = new Set(selected.map((module) => module.id))

  // external packages and the selected modules that import them (from file-level import edges)
  const users = new Map<string, Set<string>>()
  for (const edge of graph?.edges ?? []) {
    if (edge.depType !== 'external' || !edge.target.startsWith('pkg:')) continue
    const module = moduleOf(edge.source, modules)
    if (!module || !ids.has(module.id)) continue
    users.set(edge.target, (users.get(edge.target) ?? new Set()).add(module.id))
  }
  const topPackages = [...users.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0])).slice(0, 8)

  const layerOf = (id: string) => (id.startsWith('pkg:') ? 99 : TYPE_ORDER.indexOf(asType(selected.find((module) => module.id === id)?.type ?? 'module')))
  const allIds = [...selected.map((module) => module.id), ...topPackages.map(([id]) => id)]
  const positions = rowLayout(allIds, layerOf)

  const packageNodes: ArchitectureNode[] = topPackages.map(([id, moduleIds]) => ({
    id,
    label: id.slice('pkg:'.length),
    type: 'service',
    subtitle: 'External package',
    description: `Third-party package imported by ${plural(moduleIds.size, 'module')} shown here.`,
    files: [],
    position: placed(positions, id),
  }))
  const packageEdges = topPackages.flatMap(([id, moduleIds]) => [...moduleIds].sort().map((moduleId) => makeEdge(moduleId, id, 'call', 'imports')))

  return {
    view: 'services',
    title: 'Service communication',
    description:
      backend.length > 0
        ? 'Server-side folders (API, service, database), the imports between them and the external packages they use.'
        : 'No folder looks like an API, service or database layer, so all non-UI folders are shown with the packages they use.',
    direction: 'TB',
    nodes: [...selected.map((module) => moduleNode(module, placed(positions, module.id))), ...packageNodes],
    edges: [...moduleEdges(response, ids), ...packageEdges],
  }
}

function importsView(
  important: { path: string; fanIn: number; fanOut: number; transitiveDependents?: number | null }[],
  graph: GraphResponse | null,
): ArchitectureDiagram {
  const internal = (graph?.edges ?? []).filter((edge) => edge.depType === 'internal' && !edge.source.startsWith('pkg:') && !edge.target.startsWith('pkg:'))
  const languageOf = new Map((graph?.nodes ?? []).map((node) => [node.id, node.language ?? null]))
  const stats = new Map(important.map((file) => [file.path, file]))

  // the most depended-on files plus a few of their direct importers and imports
  const included = new Set<string>()
  const CAP = 25
  for (const file of important.slice(0, 8)) {
    if (included.size < CAP) included.add(file.path)
    for (const edge of internal.filter((entry) => entry.target === file.path).slice(0, 3)) if (included.size < CAP) included.add(edge.source)
    for (const edge of internal.filter((entry) => entry.source === file.path).slice(0, 3)) if (included.size < CAP) included.add(edge.target)
  }

  const edges = internal
    .filter((edge) => included.has(edge.source) && included.has(edge.target))
    .map((edge) => makeEdge(edge.source, edge.target, 'import', plural(edge.count, 'import')))
  const ids = [...included]
  const positions = columnLayout(ids, edges)

  const nodes: ArchitectureNode[] = ids.map((path) => {
    const slash = path.lastIndexOf('/')
    const directory = slash > 0 ? path.slice(0, slash) : '.'
    const info = stats.get(path)
    return {
      id: path,
      label: slash >= 0 ? path.slice(slash + 1) : path,
      type: 'file',
      subtitle: directory.length > 24 ? `…${directory.slice(-23)}` : directory,
      description: info
        ? `${path} is imported by ${plural(info.fanIn, 'file')} and imports ${plural(info.fanOut, 'file')} of this repository.${languageOf.get(path) ? ` Language: ${languageOf.get(path)}.` : ''}`
        : `${path}: a direct neighbour of one of the most imported files.`,
      files: [path],
      position: placed(positions, path),
    }
  })

  return {
    view: 'imports',
    title: 'Import relationships',
    description: 'The most imported files and their direct importers and imports. Arrows point from the importing file to the imported one.',
    direction: 'LR',
    nodes,
    edges,
  }
}

/** Architecture of a scanned and parsed repository, or the reason it cannot be shown yet. */
export async function getArchitecture(repositoryId: string): Promise<AnalysisResult<ArchitectureData>> {
  const { blocked, repository } = await blockedReason(repositoryId, true)
  if (blocked || !repository) return blocked ?? { state: 'failed', message: 'The repository could not be loaded.' }

  try {
    const id = encodeURIComponent(repositoryId)
    const [response, stats, graph] = await Promise.all([
      apiRequest<ArchitectureResponse>(`/repositories/${id}/architecture`),
      getGraphStats(repositoryId),
      // the file-level graph only feeds two views: if it fails the others still work
      apiRequest<GraphResponse>(`/repositories/${id}/dependency-graph?types=internal,external&limit=5000`, { timeoutMs: 60_000 }).catch(() => null),
    ])
    if (response.modules.length === 0) {
      return { state: 'empty', message: 'No source modules were found in this repository, so there is nothing to draw.' }
    }

    const modules = response.modules
    const diagrams: Record<ArchitectureViewId, ArchitectureDiagram> = {
      application: applicationView(modules, response),
      modules: modulesView(modules, response),
      services: servicesView(modules, response, graph),
      imports: importsView(stats.importantModules, graph),
    }

    return {
      state: 'ready',
      data: {
        overview: {
          totalModules: modules.length,
          frontendComponents: modules.filter((module) => module.type === 'frontend' || module.type === 'client').length,
          backendServices: modules.filter((module) => module.type === 'api' || module.type === 'service').length,
          apiConnections: diagrams.modules.edges.length,
        },
        diagrams,
        insights: {
          typeNote: response.typeNote || TYPE_NOTE,
          entryPoints: response.entryPoints ?? [],
          importantFiles: stats.importantModules.slice(0, 6).map((file) => ({
            path: file.path,
            fanIn: file.fanIn,
            fanOut: file.fanOut,
            transitiveDependents: file.transitiveDependents ?? null,
          })),
          circularGroups: stats.circularDependencies.map((group) => ({ size: group.size, files: group.files, exampleCycle: group.exampleCycle })),
          isAcyclic: stats.isAcyclic,
          cycleNote: stats.cycleNote,
          externalPackages: (response.externalPackages ?? []).slice(0, 8),
        },
        analysedAt: response.analysedAt ?? repository.lastParsedAt ?? repository.lastAnalysed ?? new Date().toISOString(),
      },
    }
  } catch (error) {
    return { state: 'failed', message: errorMessage(error, 'The architecture analysis could not be loaded.') }
  }
}
