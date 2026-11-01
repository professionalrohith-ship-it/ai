import type { ArchitectureNodeType } from '../../types/architecture'

// Simple deterministic placement for the architecture diagrams. Nodes are 184px wide and about 56px tall
// (see ArchitectureNodeCard), so the steps below leave a gap between neighbours.

export interface Point {
  x: number
  y: number
}

const X_STEP = 236
const ROW_STEP = 124
const COLUMN_STEP = 290
const LR_ROW_STEP = 92
const MAX_PER_ROW = 6
const MAX_PER_COLUMN = 8

/** Top-to-bottom order of layers in the application view. */
export const TYPE_ORDER: ArchitectureNodeType[] = ['client', 'frontend', 'api', 'service', 'database', 'module', 'file']

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size))
  return out
}

/** Places nodes in horizontal rows grouped by `group` (a layer index), wrapping long rows. */
export function rowLayout(ids: string[], groupOf: (id: string) => number): Map<string, Point> {
  const groups = new Map<number, string[]>()
  for (const id of [...ids].sort()) {
    const group = groupOf(id)
    groups.set(group, [...(groups.get(group) ?? []), id])
  }
  const positions = new Map<string, Point>()
  let row = 0
  for (const group of [...groups.keys()].sort((a, b) => a - b)) {
    for (const line of chunk(groups.get(group) ?? [], MAX_PER_ROW)) {
      line.forEach((id, index) => positions.set(id, { x: (index - (line.length - 1) / 2) * X_STEP, y: row * ROW_STEP }))
      row += 1
    }
  }
  return positions
}

/** Dependency level of every node (0 = nothing points at it). Back edges of import cycles are ignored. */
export function dependencyLevels(ids: string[], edges: { source: string; target: string }[]): Map<string, number> {
  const out = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const edge of edges) if (edge.source !== edge.target && out.has(edge.source) && out.has(edge.target)) out.get(edge.source)?.push(edge.target)

  // depth-first walk (explicit stack) marking back edges
  const state = new Map<string, 'open' | 'done'>()
  const back = new Set<string>()
  for (const start of [...ids].sort()) {
    if (state.has(start)) continue
    const stack: { id: string; next: number }[] = [{ id: start, next: 0 }]
    state.set(start, 'open')
    while (stack.length > 0) {
      const top = stack[stack.length - 1]
      const targets = out.get(top.id) ?? []
      if (top.next >= targets.length) {
        state.set(top.id, 'done')
        stack.pop()
        continue
      }
      const target = targets[top.next]
      top.next += 1
      const seen = state.get(target)
      if (seen === 'open') back.add(`${top.id}\u0000${target}`)
      else if (!seen) {
        state.set(target, 'open')
        stack.push({ id: target, next: 0 })
      }
    }
  }

  const levels = new Map<string, number>(ids.map((id) => [id, 0]))
  // Relaxation on the remaining acyclic edges settles in at most `ids.length` passes.
  for (let pass = 0; pass < ids.length; pass += 1) {
    let changed = false
    for (const edge of edges) {
      if (edge.source === edge.target || back.has(`${edge.source}\u0000${edge.target}`)) continue
      const level = (levels.get(edge.source) ?? 0) + 1
      if (levels.has(edge.target) && level > (levels.get(edge.target) ?? 0)) {
        levels.set(edge.target, level)
        changed = true
      }
    }
    if (!changed) break
  }
  return levels
}

/** Left-to-right columns by dependency level (importers on the left, what they import on the right). */
export function columnLayout(ids: string[], edges: { source: string; target: string }[]): Map<string, Point> {
  const levels = dependencyLevels(ids, edges)
  const byLevel = new Map<number, string[]>()
  for (const id of [...ids].sort()) byLevel.set(levels.get(id) ?? 0, [...(byLevel.get(levels.get(id) ?? 0) ?? []), id])
  const positions = new Map<string, Point>()
  let column = 0
  for (const level of [...byLevel.keys()].sort((a, b) => a - b)) {
    for (const lane of chunk(byLevel.get(level) ?? [], MAX_PER_COLUMN)) {
      lane.forEach((id, index) => positions.set(id, { x: column * COLUMN_STEP, y: (index - (lane.length - 1) / 2) * LR_ROW_STEP }))
      column += 1
    }
  }
  return positions
}
