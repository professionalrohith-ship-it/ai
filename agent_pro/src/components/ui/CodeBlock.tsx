import { useMemo } from 'react'

import { highlight, type TokenType } from '../../utils/highlight'
import { cn } from '../../utils/cn'
import { CopyButton } from './CopyButton'

const TOKEN_CLASS: Record<TokenType, string> = {
  comment: 'text-[#6f7a6f] italic',
  string: 'text-[#9fd8a7]',
  keyword: 'text-[#ff9a52]',
  literal: 'text-[#d6a2ff]',
  number: 'text-[#7fb8ff]',
  decorator: 'text-[#ffd479]',
  plain: 'text-[#e6e6e6]',
}

interface CodeBlockProps {
  code: string
  /** Highlighter key such as ts, tsx, py, json (see utils/highlight). */
  language?: string
  /** Optional title shown in the header (usually a file name). */
  title?: string
  showLineNumbers?: boolean
  /** Number of the first line (for snippets taken from the middle of a file). */
  startLine?: number
  /** Lines (in file numbering) to emphasise. */
  highlightLines?: number[]
  /** Max height before the block scrolls vertically. */
  maxHeightClass?: string
  className?: string
}

/** Read-only, syntax-highlighted code with line numbers and a copy button. Never executes code. */
export function CodeBlock({
  code,
  language = 'text',
  title,
  showLineNumbers = true,
  startLine = 1,
  highlightLines = [],
  maxHeightClass,
  className,
}: CodeBlockProps) {
  const lines = useMemo(() => highlight(code.replace(/\n$/, ''), language), [code, language])
  const gutter = String(startLine + lines.length - 1).length

  return (
    <figure className={cn('min-w-0 overflow-hidden rounded-xl border border-line bg-[#141414]', className)}>
      <figcaption className="flex items-center justify-between gap-3 border-b border-line bg-surface px-3.5 py-1.5">
        <span className="min-w-0 truncate font-mono text-xs text-mute">{title ?? language}</span>
        <div className="flex shrink-0 items-center gap-2">
          {title && <span className="text-[0.6875rem] tracking-wide text-[#6f6f6f] uppercase">{language}</span>}
          <CopyButton text={code} label="Copy code" />
        </div>
      </figcaption>
      <div className={cn('overflow-auto', maxHeightClass)}>
        <pre className="m-0 min-w-max py-3 font-mono text-[0.8125rem] leading-[1.65]">
          <code>
            {lines.map((tokens, index) => {
              const number = startLine + index
              const emphasised = highlightLines.includes(number)
              return (
                <div key={index} className={cn('flex px-3.5', emphasised && 'bg-brand/10 shadow-[inset_2px_0_0_var(--brand)]')}>
                  {showLineNumbers && (
                    <span
                      aria-hidden="true"
                      className="mr-4 shrink-0 text-right text-[#5c5c5c] select-none"
                      style={{ minWidth: `${gutter}ch` }}
                    >
                      {number}
                    </span>
                  )}
                  <span className="whitespace-pre">
                    {tokens.length === 0
                      ? ' '
                      : tokens.map((token, tokenIndex) => (
                          <span key={tokenIndex} className={TOKEN_CLASS[token.type]}>
                            {token.text}
                          </span>
                        ))}
                  </span>
                </div>
              )
            })}
          </code>
        </pre>
      </div>
    </figure>
  )
}
