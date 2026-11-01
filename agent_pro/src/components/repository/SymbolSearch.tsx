import { Braces, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { searchSymbols, type SymbolHit } from '../../services/api/repositories'
import { errorMessage } from '../../services/http'
import { SearchInput } from '../ui/SearchInput'

interface SymbolSearchProps {
  repositoryId: string
  /** false when the repository has not been parsed yet: the search says so instead of returning nothing. */
  parsed: boolean
  onOpen: (path: string, line: number) => void
}

interface Results {
  query: string
  hits: SymbolHit[]
  error: string | null
}

/** Finds classes, functions and other definitions by name in the parsed index and opens them in the viewer. */
export function SymbolSearch({ repositoryId, parsed, onOpen }: SymbolSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Results | null>(null)
  const trimmed = query.trim()

  useEffect(() => {
    if (trimmed.length < 2 || !parsed) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      searchSymbols(repositoryId, trimmed)
        .then((hits) => !cancelled && setResults({ query: trimmed, hits, error: null }))
        .catch((reason: unknown) => !cancelled && setResults({ query: trimmed, hits: [], error: errorMessage(reason) }))
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [repositoryId, trimmed, parsed])

  const active = trimmed.length >= 2 ? results : null
  const loading = parsed && trimmed.length >= 2 && (!results || results.query !== trimmed)

  return (
    <div className="relative">
      <SearchInput
        value={query}
        onChange={setQuery}
        label="Search functions and classes"
        placeholder={parsed ? 'Search functions, classes and other symbols by name' : 'Scan the repository to enable symbol search'}
      />
      {trimmed.length >= 2 && (
        <div className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-line bg-card p-1.5 shadow-card">
          {!parsed ? (
            <p className="px-3 py-3 text-xs text-mute">This repository has not been parsed yet. Run a scan to build the symbol index.</p>
          ) : loading ? (
            <p className="flex items-center gap-2 px-3 py-3 text-xs text-mute">
              <Loader2 className="size-4 animate-spin text-brand" aria-hidden="true" />
              Searching...
            </p>
          ) : active?.error ? (
            <p className="px-3 py-3 text-xs text-danger">{active.error}</p>
          ) : active && active.hits.length === 0 ? (
            <p className="px-3 py-3 text-xs text-mute">No symbol named "{active.query}" was found.</p>
          ) : (
            <ul>
              {active?.hits.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onOpen(hit.path, hit.startLine)
                      setQuery('')
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-brand/10"
                  >
                    <Braces className="size-4 shrink-0 text-brand" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {hit.name} <span className="text-xs font-normal text-mute">{hit.kind}</span>
                      </span>
                      <span className="block truncate font-mono text-xs text-mute">
                        {hit.path}:{hit.startLine}
                        {hit.parent ? ` · in ${hit.parent}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
