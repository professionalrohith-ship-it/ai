import { useCallback, useMemo, useState } from 'react'

import { ancestorFolders } from '../utils/paths'
import type { FileTreeNode } from '../types/repository'

export interface TreeRow {
  node: FileTreeNode
  depth: number
  expanded: boolean
  /** The node's own name or path matches the search query. */
  matches: boolean
}

function collectFolders(nodes: FileTreeNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type === 'folder') {
      into.push(node.path)
      collectFolders(node.children ?? [], into)
    }
  }
  return into
}

/**
 * Expand/collapse state, search filtering and the flattened list of visible rows for the
 * repository tree. Pure UI state: the tree itself comes from the service layer.
 */
export function useFileTree(tree: FileTreeNode[], selectedPath: string | null, query: string) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [initialised, setInitialised] = useState(false)
  const [revealed, setRevealed] = useState<string | null>(null)

  // Expand the top-level folders once the tree has loaded (derived state, no effect needed).
  if (!initialised && tree.length > 0) {
    setInitialised(true)
    const topLevel = tree.filter((node) => node.type === 'folder').map((node) => node.path)
    // keep anything already revealed (e.g. by a deep link that was read before the tree loaded)
    setExpanded((current) => new Set([...current, ...topLevel]))
  }

  // Whenever the selection changes (click, URL, deep link) make sure its folders are open.
  if (selectedPath !== revealed) {
    setRevealed(selectedPath)
    if (selectedPath) setExpanded((current) => new Set([...current, ...ancestorFolders(selectedPath)]))
  }

  const needle = query.trim().toLowerCase()

  const { rows, matchCount } = useMemo(() => {
    const result: TreeRow[] = []
    let matched = 0

    const nameMatches = (node: FileTreeNode) =>
      node.name.toLowerCase().includes(needle) || (node.type === 'file' && node.path.toLowerCase().includes(needle))

    const hasVisibleDescendant = (node: FileTreeNode): boolean =>
      (node.children ?? []).some((child) => nameMatches(child) || (child.type === 'folder' && hasVisibleDescendant(child)))

    const walk = (nodes: FileTreeNode[], depth: number, forced: boolean) => {
      for (const node of nodes) {
        const matches = needle !== '' && nameMatches(node)
        if (needle !== '') {
          const visible = forced || matches || (node.type === 'folder' && hasVisibleDescendant(node))
          if (!visible) continue
        }
        if (matches && node.type === 'file') matched += 1

        const isOpen = node.type === 'folder' && (needle !== '' ? true : expanded.has(node.path))
        result.push({ node, depth, expanded: isOpen, matches })
        if (node.type === 'folder' && isOpen) walk(node.children ?? [], depth + 1, forced || (needle !== '' && matches))
      }
    }
    walk(tree, 0, false)
    return { rows: result, matchCount: matched }
  }, [tree, expanded, needle])

  const toggle = useCallback((path: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const setOpen = useCallback((path: string, open: boolean) => {
    setExpanded((current) => {
      if (current.has(path) === open) return current
      const next = new Set(current)
      if (open) next.add(path)
      else next.delete(path)
      return next
    })
  }, [])

  const expandAll = useCallback(() => setExpanded(new Set(collectFolders(tree))), [tree])
  const collapseAll = useCallback(() => setExpanded(new Set()), [])

  return { rows, matchCount, searching: needle !== '', toggle, setOpen, expandAll, collapseAll }
}
