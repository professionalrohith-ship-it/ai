// Small dependency-free syntax highlighter for display only. It never executes code.

export type TokenType = 'comment' | 'string' | 'keyword' | 'literal' | 'number' | 'decorator' | 'plain'

export interface Token {
  type: TokenType
  text: string
}

type Rule = [Exclude<TokenType, 'plain'>, string]

const JS_KEYWORDS =
  'const|let|var|function|return|if|else|for|while|do|import|from|export|default|class|extends|new|async|await|try|catch|finally|throw|type|interface|enum|as|typeof|in|of|switch|case|break|continue|void|public|private|protected|readonly|static|implements|yield|delete|instanceof'
const PY_KEYWORDS =
  'def|class|return|if|elif|else|for|while|import|from|as|with|try|except|finally|raise|pass|lambda|yield|async|await|in|not|and|or|is|global|nonlocal|assert|del|break|continue'

const JS_RULES: Rule[] = [
  ['comment', String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`],
  ['string', String.raw`\x60(?:\\.|[^\x60\\])*\x60|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"`],
  ['keyword', String.raw`\b(?:${JS_KEYWORDS})\b`],
  ['literal', String.raw`\b(?:true|false|null|undefined|this)\b`],
  ['number', String.raw`\b\d+(?:\.\d+)?\b`],
]

const PY_RULES: Rule[] = [
  ['comment', String.raw`#[^\n]*`],
  ['string', String.raw`"""[\s\S]*?"""|'''[\s\S]*?'''|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"`],
  ['decorator', String.raw`@[A-Za-z_][\w.]*`],
  ['keyword', String.raw`\b(?:${PY_KEYWORDS})\b`],
  ['literal', String.raw`\b(?:True|False|None|self|cls)\b`],
  ['number', String.raw`\b\d+(?:\.\d+)?\b`],
]

const JSON_RULES: Rule[] = [
  ['string', String.raw`"(?:\\.|[^"\\\n])*"`],
  ['literal', String.raw`\b(?:true|false|null)\b`],
  ['number', String.raw`-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b`],
]

const CSS_RULES: Rule[] = [
  ['comment', String.raw`\/\*[\s\S]*?\*\/`],
  ['string', String.raw`'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"`],
  ['keyword', String.raw`@[a-z-]+`],
  ['number', String.raw`#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms)?\b`],
]

const SHELL_RULES: Rule[] = [
  ['comment', String.raw`#[^\n]*`],
  ['string', String.raw`'[^'\n]*'|"(?:\\.|[^"\\\n])*"`],
  ['keyword', String.raw`\b(?:npm|npx|pip|python|uvicorn|git|cd|export|echo|run|install|source|docker|curl)\b`],
  ['number', String.raw`\b\d+(?:\.\d+)?\b`],
]

const YAML_RULES: Rule[] = [
  ['comment', String.raw`#[^\n]*`],
  ['string', String.raw`'[^'\n]*'|"(?:\\.|[^"\\\n])*"`],
  ['literal', String.raw`\b(?:true|false|null|yes|no)\b`],
  ['number', String.raw`\b\d+(?:\.\d+)?\b`],
]

const MD_RULES: Rule[] = [
  ['keyword', String.raw`^#{1,6} [^\n]*`],
  ['string', String.raw`\x60[^\x60\n]+\x60`],
]

const LANGUAGE_RULES: Record<string, Rule[]> = {
  ts: JS_RULES,
  tsx: JS_RULES,
  js: JS_RULES,
  jsx: JS_RULES,
  javascript: JS_RULES,
  typescript: JS_RULES,
  py: PY_RULES,
  python: PY_RULES,
  json: JSON_RULES,
  css: CSS_RULES,
  sh: SHELL_RULES,
  bash: SHELL_RULES,
  shell: SHELL_RULES,
  yaml: YAML_RULES,
  yml: YAML_RULES,
  md: MD_RULES,
  markdown: MD_RULES,
}

const compiled = new Map<string, RegExp>()

function regexFor(language: string, rules: Rule[]): RegExp {
  let regex = compiled.get(language)
  if (!regex) {
    regex = new RegExp(rules.map(([, pattern]) => `(${pattern})`).join('|'), 'gm')
    compiled.set(language, regex)
  }
  return regex
}

/** Maps a file name or language label to a highlighter key (or 'text'). */
export function languageFromFileName(name: string): string {
  const extension = name.includes('.') ? name.split('.').pop()!.toLowerCase() : name.toLowerCase()
  return extension in LANGUAGE_RULES ? extension : 'text'
}

/** Human readable language name for a file name. */
export function languageLabel(name: string): string {
  const key = languageFromFileName(name)
  const labels: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript (TSX)',
    js: 'JavaScript',
    jsx: 'JavaScript (JSX)',
    py: 'Python',
    json: 'JSON',
    css: 'CSS',
    md: 'Markdown',
    yml: 'YAML',
    yaml: 'YAML',
    sh: 'Shell',
    text: 'Plain text',
  }
  return labels[key] ?? key.toUpperCase()
}

/** Splits `code` into lines of tokens. Unknown languages come back as plain text. */
export function highlight(code: string, language: string): Token[][] {
  const key = language.toLowerCase()
  const rules = LANGUAGE_RULES[key]
  const tokens: Token[] = []

  if (!rules) {
    tokens.push({ type: 'plain', text: code })
  } else {
    const regex = regexFor(key, rules)
    regex.lastIndex = 0
    let cursor = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(code)) !== null) {
      if (match[0] === '') {
        regex.lastIndex += 1
        continue
      }
      if (match.index > cursor) tokens.push({ type: 'plain', text: code.slice(cursor, match.index) })
      const groupIndex = match.findIndex((value, index) => index > 0 && value !== undefined)
      tokens.push({ type: rules[groupIndex - 1][0], text: match[0] })
      cursor = match.index + match[0].length
    }
    if (cursor < code.length) tokens.push({ type: 'plain', text: code.slice(cursor) })
  }

  // split multi-line tokens so every rendered line is self-contained
  const lines: Token[][] = [[]]
  for (const token of tokens) {
    const parts = token.text.split('\n')
    parts.forEach((part, index) => {
      if (index > 0) lines.push([])
      if (part) lines[lines.length - 1].push({ type: token.type, text: part })
    })
  }
  return lines
}
