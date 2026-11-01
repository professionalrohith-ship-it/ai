import { ChevronRight } from 'lucide-react'
import type { KeyboardEvent } from 'react'

import type { TreeRow } from '../../hooks/useFileTree'
import { cn } from '../../utils/cn'
import { FileTypeIcon } from './FileTypeIcon'

interface FileTreeItemProps {
  row: TreeRow
  selected: boolean
  /** Roving tab stop: only one row in the tree is tabbable. */
  focusable: boolean
  query: string
  onActivate: (row: TreeRow) => void
  onFocusRow: (path: string) => void
}

/** Wraps the matching part of `text` in a highlight. */
function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase()
  if (!needle) return <>{text}</>
  const start = text.toLowerCase().indexOf(needle)
  if (start < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-sm bg-brand/30 px-px text-ink">{text.slice(start, start + needle.length)}</mark>
      {text.slice(start + needle.length)}
    </>
  )
}

/** One row of the repository tree (a folder or a file). */
export function FileTreeItem({ row, selected, focusable, query, onActivate, onFocusRow }: FileTreeItemProps) {
  const { node, depth, expanded, matches } = row
  const isFolder = node.type === 'folder'

  return (
    <li
      role="treeitem"
      data-path={node.path}
      aria-level={depth + 1}
      aria-selected={selected}
      aria-expanded={isFolder ? expanded : undefined}
      tabIndex={focusable ? 0 : -1}
      onClick={() => {
        onFocusRow(node.path)
        onActivate(row)
      }}
      onFocus={(event: React.FocusEvent<HTMLLIElement>) => {
        if (event.target === event.currentTarget) onFocusRow(node.path)
      }}
      onKeyDown={(event: KeyboardEvent<HTMLLIElement>) => {
        // Enter/Space handled here so the tree-level handler only deals with navigation keys
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          onActivate(row)
        }
      }}
      style={{ paddingLeft: `${depth * 14 + 8}px` }}
      className={cn(
        'group relative flex h-8 cursor-pointer items-center gap-1.5 rounded-md pr-2 text-[0.8125rem] outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-brand/70 focus-visible:ring-inset',
        selected ? 'bg-brand/15 text-ink' : 'text-ink/85 hover:bg-white/5 hover:text-ink',
        matches && !selected && 'bg-brand/5',
      )}
    >
      {selected && <span aria-hidden="true" className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r-full bg-brand" />}
      <span className="grid size-4 shrink-0 place-items-center text-mute">
        {isFolder && (
          <ChevronRight className={cn('size-3.5 transition-transform duration-150', expanded && 'rotate-90')} aria-hidden="true" />
        )}
      </span>
      <FileTypeIcon name={node.name} type={node.type} open={expanded} />
      <span className="min-w-0 flex-1 truncate">
        <Highlight text={node.name} query={query} />
      </span>
      {isFolder && node.fileCount !== undefined && (
        <span className="shrink-0 rounded-full bg-white/5 px-1.5 py-px font-mono text-[0.625rem] text-mute" title={`${node.fileCount} files`}>
          {node.fileCount}
        </span>
      )}
    </li>
  )
}
