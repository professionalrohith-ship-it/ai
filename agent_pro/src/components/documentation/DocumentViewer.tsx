import { Eye, FileCode2, ListTree } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { GeneratedDocument } from '../../types/documentation'
import { cn } from '../../utils/cn'
import { markdownFileName } from '../../utils/download'
import { extractHeadings } from '../../utils/markdown'
import { CodeBlock } from '../ui/CodeBlock'
import { Markdown } from '../ui/Markdown'
import { Tabs, type TabItem } from '../ui/Tabs'

const VIEW_TABS: TabItem[] = [
  { id: 'preview', label: 'Preview', icon: Eye },
  { id: 'source', label: 'Markdown source', icon: FileCode2 },
]

interface DocumentViewerProps {
  document: GeneratedDocument
  onFileReference: (path: string, line?: number) => void
}

function TocList({ headings }: { headings: { id: string; text: string; level: number }[] }) {
  return (
    <ul className="space-y-1">
      {headings.map((heading) => (
        <li key={heading.id}>
          <a
            href={`#${heading.id}`}
            className={cn(
              'block rounded-md px-2 py-1 text-[0.8125rem] leading-snug text-mute transition hover:bg-white/5 hover:text-brand',
              heading.level === 1 && 'font-semibold text-ink',
              heading.level === 3 && 'pl-5 text-xs',
            )}
          >
            {heading.text}
          </a>
        </li>
      ))}
    </ul>
  )
}

/** Markdown preview (or source) with a table of contents. */
export function DocumentViewer({ document, onFileReference }: DocumentViewerProps) {
  const [view, setView] = useState('preview')
  const headings = useMemo(() => extractHeadings(document.content, 3), [document.content])
  const hasToc = headings.length > 1

  return (
    <div className={cn('grid items-start gap-6', hasToc ? 'grid-cols-[14rem_minmax(0,1fr)] @max-[56rem]:grid-cols-1' : 'grid-cols-1')}>
      {hasToc && (
        <nav
          aria-label="Table of contents"
          className="sticky top-20 max-h-[calc(100dvh/var(--zf,1)-7rem)] overflow-y-auto rounded-card border border-line bg-card p-4 shadow-card @max-[56rem]:hidden"
        >
          <p className="mb-2 flex items-center gap-2 px-2 text-[0.6875rem] font-semibold tracking-wide text-mute uppercase">
            <ListTree className="size-3.5" aria-hidden="true" />
            On this page
          </p>
          <TocList headings={headings} />
        </nav>
      )}

      <div className="min-w-0 space-y-4">
        {hasToc && (
          <details className="hidden rounded-card border border-line bg-card @max-[56rem]:block">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-ink">
              <ListTree className="size-4 text-brand" aria-hidden="true" />
              On this page
            </summary>
            <div className="border-t border-line p-3">
              <TocList headings={headings} />
            </div>
          </details>
        )}

        <Tabs tabs={VIEW_TABS} value={view} onChange={setView} ariaLabel="Document view" />

        {view === 'preview' ? (
          <article className="rounded-card border border-line bg-card p-8 shadow-card max-sm:p-5">
            <Markdown source={document.content} onFileReference={onFileReference} />
          </article>
        ) : (
          <CodeBlock code={document.content} language="md" title={markdownFileName(document.title)} maxHeightClass="max-h-[40rem]" />
        )}
      </div>
    </div>
  )
}
