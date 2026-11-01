import { FileSearch, FileX2, Info } from 'lucide-react'
import { useEffect, useRef } from 'react'

import type { RepositoryFileContent } from '../../services/api/repositories'
import { languageFromFileName } from '../../utils/highlight'
import { EmptyState } from '../common/EmptyState'
import { Skeleton } from '../common/LoadingState'
import { Badge } from '../ui/Badge'
import { CodeBlock } from '../ui/CodeBlock'
import { FileTypeIcon } from './FileTypeIcon'
import { Notice } from './Notice'

interface CodeViewerProps {
  file: RepositoryFileContent | null
  loading: boolean
  /** Backend message when the requested file cannot be shown (missing, sensitive, too large...). */
  error: string | null
  /** The requested path, for the error message. */
  requestedPath: string | null
  /** 1-based line to highlight and scroll to. */
  line?: number
  /** Shown when the info panel lives in a drawer/tab instead of beside the viewer. */
  onOpenInfo?: () => void
}

/** Read-only file preview with line numbers, syntax highlighting and a copy button. Never executes code. */
export function CodeViewer({ file, loading, error, requestedPath, line, onOpenInfo }: CodeViewerProps) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const path = file?.path
  const lineCount = file?.metadata.lineCount ?? 0

  // Scroll the highlighted line into view inside the code's own scroll area (the page does not move).
  useEffect(() => {
    if (!path || !line || line > lineCount) return
    const frame = requestAnimationFrame(() => {
      const body = bodyRef.current
      const target = body?.querySelector<HTMLElement>(`code > div:nth-child(${line})`)
      const scroller = target?.closest<HTMLElement>('.overflow-auto')
      if (!target || !scroller) return
      const offset = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      scroller.scrollTop += offset - scroller.clientHeight / 3
    })
    return () => cancelAnimationFrame(frame)
  }, [path, line, lineCount])

  let body
  if (error) {
    body = (
      <div className="grid h-full place-items-center p-6">
        <EmptyState
          tone="error"
          icon={FileX2}
          title="This file cannot be shown"
          description={`${requestedPath ? `"${requestedPath}": ` : ''}${error}`}
        />
      </div>
    )
  } else if (loading) {
    body = (
      <div className="space-y-2 p-5" aria-busy="true" aria-label="Loading file">
        {Array.from({ length: 14 }, (_, index) => (
          <Skeleton key={index} className={`h-4 ${['w-3/4', 'w-full', 'w-5/6', 'w-2/3', 'w-11/12'][index % 5]}`} />
        ))}
      </div>
    )
  } else if (!file) {
    body = (
      <div className="grid h-full place-items-center p-6">
        <EmptyState icon={FileSearch} title="Select a file to preview" description="Choose a file in the explorer to see its contents here." />
      </div>
    )
  } else if (file.content.trim() === '') {
    body = (
      <div className="grid h-full place-items-center p-6">
        <EmptyState icon={FileSearch} title="This file is empty" description="It exists in the repository but contains no code." />
      </div>
    )
  } else {
    body = (
      <div className="flex h-full flex-col">
        {(file.stale || file.truncated) && (
          <Notice tone="warn" className="m-3 mb-0 shrink-0">
            {file.truncated && 'Only the first part of this large file is shown. '}
            {file.stale && 'This file changed after the last scan, so symbol line numbers may be off. Scan the repository again to refresh them.'}
          </Notice>
        )}
      <CodeBlock
        code={file.content}
        language={languageFromFileName(file.path)}
        title={file.path.split('/').pop()}
        highlightLines={line ? [line] : []}
        maxHeightClass="min-h-0 flex-1"
        className="flex min-h-0 flex-1 flex-col rounded-none! border-0!"
      />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {file && <FileTypeIcon name={file.path} type="file" className="size-[1.1rem]" />}
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-ink">{file ? file.path.split('/').pop() : 'File viewer'}</h2>
              {file && file.metadata.extension && <Badge tone="neutral">.{file.metadata.extension}</Badge>}
            </div>
            <p className="truncate font-mono text-xs text-mute" title={file?.path}>
              {file ? file.path.split('/').join(' / ') : 'No file selected'}
            </p>
          </div>
        </div>
        {onOpenInfo && file && (
          <button
            type="button"
            onClick={onOpenInfo}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-mute transition hover:border-[#454545] hover:text-ink"
          >
            <Info className="size-3.5" aria-hidden="true" />
            File info
          </button>
        )}
      </header>
      <div ref={bodyRef} className="min-h-0 flex-1">
        {body}
      </div>
    </div>
  )
}
