import { ChevronsDownUp, ChevronsUpDown, SearchX } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'

import { useFileTree, type TreeRow } from '../../hooks/useFileTree'
import type { FileTreeNode } from '../../types/repository'
import { Skeleton } from '../common/LoadingState'
import { SearchInput } from '../ui/SearchInput'
import { FileTreeItem } from './FileTreeItem'

interface RepositoryTreeProps {
  repositoryName: string
  tree: FileTreeNode[]
  loading: boolean
  /** Backend message when the tree could not be loaded. */
  error?: string | null
  selectedPath: string | null
  totalFiles: number
  onSelectFile: (path: string) => void
}

/**
 * File explorer: search, expand/collapse controls and a keyboard-operable tree
 * (arrows move/expand/collapse, Enter or Space selects, Home/End jump).
 */
export function RepositoryTree({ repositoryName, tree, loading, error = null, selectedPath, totalFiles, onSelectFile }: RepositoryTreeProps) {
  const [query, setQuery] = useState('')
  const [focusedPath, setFocusedPath] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const { rows, matchCount, searching, toggle, setOpen, expandAll, collapseAll } = useFileTree(tree, selectedPath, query)

  const paths = rows.map((row) => row.node.path)
  const tabStop =
    focusedPath && paths.includes(focusedPath) ? focusedPath : selectedPath && paths.includes(selectedPath) ? selectedPath : paths[0]

  const focusRow = (path: string) => {
    setFocusedPath(path)
    requestAnimationFrame(() => {
      const target = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-path]') ?? []).find((element) => element.dataset.path === path)
      target?.focus()
    })
  }

  const activate = (row: TreeRow) => {
    if (row.node.type === 'file') onSelectFile(row.node.path)
    else if (!searching) toggle(row.node.path)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const index = rows.findIndex((row) => row.node.path === tabStop)
    if (index < 0) return
    const row = rows[index]
    const go = (target: number) => {
      event.preventDefault()
      focusRow(rows[Math.max(0, Math.min(rows.length - 1, target))].node.path)
    }

    switch (event.key) {
      case 'ArrowDown':
        return go(index + 1)
      case 'ArrowUp':
        return go(index - 1)
      case 'Home':
        return go(0)
      case 'End':
        return go(rows.length - 1)
      case 'ArrowRight':
        if (row.node.type !== 'folder') return
        event.preventDefault()
        if (!row.expanded && !searching) setOpen(row.node.path, true)
        else if (rows[index + 1] && rows[index + 1].depth > row.depth) focusRow(rows[index + 1].node.path)
        return
      case 'ArrowLeft': {
        event.preventDefault()
        if (row.node.type === 'folder' && row.expanded && !searching) {
          setOpen(row.node.path, false)
          return
        }
        for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
          if (rows[cursor].depth < row.depth) return focusRow(rows[cursor].node.path)
        }
        return
      }
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-line p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-ink">{repositoryName}</h2>
            <p className="text-xs text-mute">{totalFiles} files</p>
          </div>
        </div>
        <SearchInput value={query} onChange={setQuery} label="Search files" placeholder="Search files" />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-mute" aria-live="polite">
            {searching ? `${matchCount} ${matchCount === 1 ? 'match' : 'matches'}` : 'Folders and files'}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={expandAll}
              disabled={searching}
              aria-label="Expand all folders"
              title="Expand all"
              className="grid size-7 place-items-center rounded-md text-mute transition hover:bg-white/10 hover:text-ink disabled:opacity-40"
            >
              <ChevronsUpDown className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={collapseAll}
              disabled={searching}
              aria-label="Collapse all folders"
              title="Collapse all"
              className="grid size-7 place-items-center rounded-md text-mute transition hover:bg-white/10 hover:text-ink disabled:opacity-40"
            >
              <ChevronsDownUp className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
        {loading ? (
          <div className="space-y-2 p-1" aria-busy="true" aria-label="Loading file tree">
            {Array.from({ length: 10 }, (_, index) => (
              <Skeleton key={index} className="h-6" />
            ))}
          </div>
        ) : error ? (
          <p className="px-4 py-10 text-center text-sm text-danger">{error}</p>
        ) : tree.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-mute">No files in the inventory yet. Scan the repository to list its files.</p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <SearchX className="size-6 text-mute" aria-hidden="true" />
            <p className="text-sm text-ink">No files match "{query}"</p>
            <button type="button" onClick={() => setQuery('')} className="text-xs font-medium text-brand hover:underline">
              Clear search
            </button>
          </div>
        ) : (
          <ul ref={listRef} role="tree" aria-label={`${repositoryName} files`} onKeyDown={handleKeyDown} className="space-y-px">
            {rows.map((row) => (
              <FileTreeItem
                key={row.node.path}
                row={row}
                selected={row.node.path === selectedPath}
                focusable={row.node.path === tabStop}
                query={query}
                onActivate={activate}
                onFocusRow={setFocusedPath}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
