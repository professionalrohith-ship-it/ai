import type { ArchitectureDiagram, ModuleDetails } from '../../types/architecture'

/** Looks up a node and its incoming/outgoing connections within one diagram. */
export function buildModuleDetails(diagram: ArchitectureDiagram, nodeId: string | null): ModuleDetails | null {
  if (!nodeId) return null
  const node = diagram.nodes.find((entry) => entry.id === nodeId)
  if (!node) return null
  const byId = new Map(diagram.nodes.map((entry) => [entry.id, entry]))

  const incoming = diagram.edges
    .filter((edge) => edge.target === nodeId)
    .flatMap((edge) => {
      const from = byId.get(edge.source)
      return from ? [{ edge, from }] : []
    })
  const outgoing = diagram.edges
    .filter((edge) => edge.source === nodeId)
    .flatMap((edge) => {
      const to = byId.get(edge.target)
      return to ? [{ edge, to }] : []
    })

  return { node, incoming, outgoing }
}
