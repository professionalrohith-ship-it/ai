import { ArrowUpRight, FileQuestion, Package } from 'lucide-react'
import type { ReactNode } from 'react'

import type { RepositoryFileContent } from '../../services/api/repositories'
import { timeAgo } from '../../utils/format'
import { EmptyState } from '../common/EmptyState'
import { Skeleton } from '../common/LoadingState'
import { Badge } from '../ui/Badge'
import { FileTypeIcon } from './FileTypeIcon'
import { formatBytes } from './format'

interface FileInformationPanelProps {
  file: RepositoryFileContent | null
  loading: boolean
  onOpenFile: (path: string) => void
  /** Jumps to a line of the current file (used by the symbol list). */
  onOpenLine?: (line: number) => void
  /** Whether the repository has been parsed (symbols and imports exist). */
  parsed?: boolean
  /** Backend message when the file could not be loaded. */
  error?: string | null
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/70 py-2 text-xs last:border-0">
      <dt className="shrink-0 text-mute">{label}</dt>
      <dd className="min-w-0 truncate text-right text-ink/90">{children}</dd>
    </div>
  )
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-4">
      <h3 className="mb-2.5 flex items-center gap-2 text-xs font-semibold tracking-wide text-mute uppercase">
        {title}
        {count !== undefined && <span className="rounded-full bg-white/5 px-1.5 py-px text-[0.625rem] text-mute">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

/** Details for the selected file: type, size, path, language, imports, related files, metadata. */
export function FileInformationPanel({ file, loading, onOpenFile, onOpenLine, parsed = true, error = null }: FileInformationPanelProps) {
  if (loading) {
    return (
      <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading file information">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-5" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="grid h-full place-items-center p-4">
        <EmptyState icon={FileQuestion} title="No file information" description={error} className="px-4 py-8" />
      </div>
    )
  }

  if (!file) {
    return (
      <div className="grid h-full place-items-center p-4">
        <EmptyState icon={FileQuestion} title="No file selected" description="File details appear here when you pick a file." className="px-4 py-8" />
      </div>
    )
  }

  const { metadata, importLinks } = file
  const name = file.path.split('/').pop() ?? file.path

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <header className="flex items-start gap-3 px-4 py-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 ring-1 ring-brand/20">
          <FileTypeIcon name={name} type="file" className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-ink" title={name}>
            {name}
          </h2>
          <p className="mt-0.5 text-xs text-mute">{metadata.language}</p>
        </div>
      </header>

      <div className="px-4 pb-4">
        <Badge tone="neutral">{metadata.language}</Badge>
        <dl className="mt-3">
          <Row label="File type">{metadata.extension ? `.${metadata.extension}` : 'No extension'}</Row>
          <Row label="Size">{formatBytes(metadata.sizeBytes)}</Row>
          <Row label="Lines">{metadata.lineCount}</Row>
          <Row label="Language">{metadata.language}</Row>
          <Row label="Encoding">{metadata.encoding}</Row>
          <Row label="Last modified">{timeAgo(metadata.lastModified)}</Row>
        </dl>
        <p className="mt-3 text-[0.6875rem] text-mute">Path</p>
        <p className="mt-1 rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-xs break-all text-ink/90">{file.path}</p>
      </div>

      <Section title="Imports" count={importLinks.length}>
        {importLinks.length === 0 ? (
          <p className="text-xs text-mute">This file has no imports.</p>
        ) : (
          <ul className="space-y-1">
            {importLinks.map((link) => (
              <li key={link.specifier}>
                {link.path ? (
                  <button
                    type="button"
                    onClick={() => onOpenFile(link.path!)}
                    title={link.path}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-xs text-ink/90 transition hover:bg-brand/10 hover:text-brand"
                  >
                    <ArrowUpRight className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
                    <span className="min-w-0 truncate">{link.specifier}</span>
                  </button>
                ) : (
                  <span className="flex items-center gap-2 px-2 py-1.5 font-mono text-xs text-mute">
                    <Package className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 truncate">{link.specifier}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Symbols" count={file.symbols.length}>
        {file.symbols.length === 0 ? (
          <p className="text-xs text-mute">
            {parsed ? 'No classes, functions or other symbols were found in this file.' : 'Run a scan to parse this repository and list its symbols.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {file.symbols.map((symbol, index) => (
              <li key={`${symbol.name}:${symbol.startLine}:${index}`}>
                <button
                  type="button"
                  onClick={() => onOpenLine?.(symbol.startLine)}
                  title={`${symbol.kind} ${symbol.name}, lines ${symbol.startLine}-${symbol.endLine}`}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-brand/10"
                >
                  <span className="w-16 shrink-0 truncate text-[0.625rem] font-semibold tracking-wide text-brand uppercase">{symbol.kind}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink/90">
                    {symbol.parent ? `${symbol.parent}.` : ''}
                    {symbol.name}
                  </span>
                  <span className="shrink-0 font-mono text-[0.6875rem] text-mute">:{symbol.startLine}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Related files" count={metadata.relatedFiles.length}>
        {metadata.relatedFiles.length === 0 ? (
          <p className="text-xs text-mute">No related files found.</p>
        ) : (
          <ul className="space-y-1">
            {metadata.relatedFiles.map((path) => (
              <li key={path}>
                <button
                  type="button"
                  onClick={() => onOpenFile(path)}
                  title={path}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-brand/10"
                >
                  <FileTypeIcon name={path} type="file" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-ink">{path.split('/').pop()}</span>
                    <span className="block truncate font-mono text-[0.6875rem] text-mute">{path}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
