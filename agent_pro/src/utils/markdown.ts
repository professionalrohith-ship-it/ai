// Minimal Markdown parser (headings, paragraphs, lists, code fences, tables, quotes, rules).
// It produces data, not HTML, so rendering stays safe (see components/ui/Markdown.tsx).

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string; id: string }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; lang: string; code: string }
  | { type: 'list'; ordered: boolean; items: { text: string; depth: number }[] }
  | { type: 'table'; header: string[]; rows: string[][]; align: ('left' | 'center' | 'right')[] }
  | { type: 'quote'; text: string }
  | { type: 'hr' }

export interface HeadingInfo {
  id: string
  text: string
  level: number
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[`*_[\]()]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-') || 'section'
  )
}

const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
const LIST_ITEM = /^(\s*)([-*+]|\d+\.)\s+(.*)$/

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isSpecialStart(line: string, next: string | undefined): boolean {
  return (
    /^```/.test(line) ||
    /^#{1,6}\s/.test(line) ||
    /^(-{3,}|\*{3,})\s*$/.test(line) ||
    LIST_ITEM.test(line) ||
    /^>\s?/.test(line) ||
    (line.includes('|') && next !== undefined && TABLE_DIVIDER.test(next))
  )
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  const slugCounts = new Map<string, number>()
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === '') {
      i += 1
      continue
    }

    const fence = /^```(\S*)/.exec(line)
    if (fence) {
      const code: string[] = []
      i += 1
      while (i < lines.length && !/^```/.test(lines[i])) {
        code.push(lines[i])
        i += 1
      }
      i += 1 // closing fence
      blocks.push({ type: 'code', lang: fence[1] || 'text', code: code.join('\n') })
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      const text = heading[2].trim()
      const base = slugify(text)
      const count = slugCounts.get(base) ?? 0
      slugCounts.set(base, count + 1)
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text,
        id: count === 0 ? base : `${base}-${count}`,
      })
      i += 1
      continue
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ type: 'hr' })
      i += 1
      continue
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1])) {
      const header = splitRow(line)
      const align = splitRow(lines[i + 1]).map((cell) =>
        cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left',
      ) as ('left' | 'center' | 'right')[]
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitRow(lines[i]))
        i += 1
      }
      blocks.push({ type: 'table', header, rows, align })
      continue
    }

    const listStart = LIST_ITEM.exec(line)
    if (listStart) {
      const ordered = /\d+\./.test(listStart[2])
      const items: { text: string; depth: number }[] = []
      while (i < lines.length) {
        const match = LIST_ITEM.exec(lines[i])
        if (!match) break
        items.push({ text: match[3], depth: Math.min(3, Math.floor(match[1].replace(/\t/g, '  ').length / 2)) })
        i += 1
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''))
        i += 1
      }
      blocks.push({ type: 'quote', text: quote.join(' ') })
      continue
    }

    const paragraph: string[] = [line.trim()]
    i += 1
    while (i < lines.length && lines[i].trim() !== '' && !isSpecialStart(lines[i], lines[i + 1])) {
      paragraph.push(lines[i].trim())
      i += 1
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
  }

  return blocks
}

/** Headings (levels 1 to 4) for a table of contents. */
export function extractHeadings(source: string, maxLevel = 3): HeadingInfo[] {
  return parseMarkdown(source)
    .filter((block): block is Extract<MarkdownBlock, { type: 'heading' }> => block.type === 'heading')
    .filter((block) => block.level <= maxLevel)
    .map((block) => ({ id: block.id, text: block.text, level: block.level }))
}
