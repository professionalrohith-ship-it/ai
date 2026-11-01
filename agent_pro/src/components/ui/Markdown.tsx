import { Fragment, useMemo, type ReactNode } from 'react'

import { cn } from '../../utils/cn'
import { parseMarkdown, type MarkdownBlock } from '../../utils/markdown'
import { CodeBlock } from './CodeBlock'

interface MarkdownProps {
  source: string
  /** When set, inline code that looks like a file path becomes a clickable reference. */
  onFileReference?: (path: string, line?: number) => void
  className?: string
}

const FILE_PATH = /^([\w@.-]+\/)+[\w@.-]+\.[A-Za-z0-9]+(?::(\d+))?$/
const INLINE_SOURCE = String.raw`(\x60[^\x60\n]+\x60)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|(_[^_\s][^_\n]*_)|(\[[^\]\n]+\]\([^)\s]+\))`
const SAFE_URL = /^(https?:\/\/|mailto:|#|\/)/i

function renderInline(text: string, onFileReference?: MarkdownProps['onFileReference']): ReactNode[] {
  const nodes: ReactNode[] = []
  let cursor = 0
  let key = 0
  // A fresh regex per call: renderInline recurses (bold / italic), and a shared global regex
  // would have its lastIndex reset by the nested call, looping forever.
  const INLINE = new RegExp(INLINE_SOURCE, 'g')
  let match: RegExpExecArray | null

  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index))
    const raw = match[0]

    if (match[1]) {
      const code = raw.slice(1, -1)
      const file = FILE_PATH.exec(code)
      if (file && onFileReference) {
        const path = code.replace(/:\d+$/, '')
        const line = file[2] ? Number(file[2]) : undefined
        nodes.push(
          <button
            key={key++}
            type="button"
            onClick={() => onFileReference(path, line)}
            className="rounded-md border border-brand/25 bg-brand/10 px-1.5 py-px font-mono text-[0.85em] text-brand transition hover:bg-brand hover:text-white"
          >
            {code}
          </button>,
        )
      } else {
        nodes.push(
          <code key={key++} className="rounded-md border border-line bg-white/5 px-1.5 py-px font-mono text-[0.85em] text-[#ffb27a]">
            {code}
          </code>,
        )
      }
    } else if (match[2]) {
      nodes.push(
        <strong key={key++} className="font-semibold text-ink">
          {renderInline(raw.slice(2, -2), onFileReference)}
        </strong>,
      )
    } else if (match[3] || match[4]) {
      nodes.push(<em key={key++}>{renderInline(raw.slice(1, -1), onFileReference)}</em>)
    } else if (match[5]) {
      const parts = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(raw)
      if (parts && SAFE_URL.test(parts[2])) {
        const external = /^https?:/i.test(parts[2])
        nodes.push(
          <a
            key={key++}
            href={parts[2]}
            {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
            className="text-brand underline decoration-brand/40 underline-offset-2 transition hover:decoration-brand"
          >
            {parts[1]}
          </a>,
        )
      } else {
        nodes.push(parts ? parts[1] : raw)
      }
    }
    cursor = match.index + raw.length
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

const HEADING_CLASS: Record<number, string> = {
  1: 'mt-8 mb-4 text-2xl font-semibold tracking-tight text-ink first:mt-0',
  2: 'mt-8 mb-3 border-b border-line pb-2 text-xl font-semibold tracking-tight text-ink first:mt-0',
  3: 'mt-6 mb-2 text-base font-semibold text-ink first:mt-0',
  4: 'mt-5 mb-2 text-sm font-semibold text-ink first:mt-0',
  5: 'mt-4 mb-1.5 text-sm font-semibold text-mute',
  6: 'mt-4 mb-1.5 text-xs font-semibold tracking-wide text-mute uppercase',
}

function renderBlock(block: MarkdownBlock, index: number, onFileReference?: MarkdownProps['onFileReference']) {
  switch (block.type) {
    case 'heading': {
      const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
      return (
        <Tag key={index} id={block.id} className={cn('scroll-mt-24', HEADING_CLASS[block.level])}>
          {renderInline(block.text, onFileReference)}
        </Tag>
      )
    }
    case 'paragraph':
      return (
        <p key={index} className="my-3 text-sm leading-relaxed text-ink/90 first:mt-0 last:mb-0">
          {renderInline(block.text, onFileReference)}
        </p>
      )
    case 'code':
      return <CodeBlock key={index} code={block.code} language={block.lang} className="my-4" />
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul'
      return (
        <Tag
          key={index}
          className={cn('my-3 space-y-1.5 text-sm leading-relaxed text-ink/90', block.ordered ? 'list-decimal' : 'list-disc', 'pl-5 marker:text-brand')}
        >
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex} style={{ marginLeft: `${item.depth * 1.25}rem` }}>
              {renderInline(item.text, onFileReference)}
            </li>
          ))}
        </Tag>
      )
    }
    case 'table':
      return (
        <div key={index} className="my-4 max-w-full overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-max border-collapse text-left text-sm">
            <thead className="bg-surface text-xs tracking-wide text-mute uppercase">
              <tr>
                {block.header.map((cell, cellIndex) => (
                  <th key={cellIndex} className="px-3.5 py-2.5 font-semibold" style={{ textAlign: block.align[cellIndex] }}>
                    {renderInline(cell, onFileReference)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-white/[0.03]">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-3.5 py-2.5 align-top text-ink/90" style={{ textAlign: block.align[cellIndex] }}>
                      {renderInline(cell, onFileReference)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'quote':
      return (
        <blockquote key={index} className="my-4 rounded-r-lg border-l-2 border-brand bg-brand/5 px-4 py-2.5 text-sm text-mute">
          {renderInline(block.text, onFileReference)}
        </blockquote>
      )
    case 'hr':
      return <hr key={index} className="my-6 border-line" />
  }
}

/** Renders Markdown as React elements (no raw HTML is ever injected). */
export function Markdown({ source, onFileReference, className }: MarkdownProps) {
  const blocks = useMemo(() => parseMarkdown(source), [source])
  return (
    <div className={cn('min-w-0 break-words', className)}>
      {blocks.map((block, index) => (
        <Fragment key={index}>{renderBlock(block, index, onFileReference)}</Fragment>
      ))}
    </div>
  )
}
