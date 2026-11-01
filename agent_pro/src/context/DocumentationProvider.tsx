import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { typeLabel } from '../constants/documentation'
import { useAppData } from '../hooks/useAppData'
import { createDocumentRecord, documentationApi, isLocalDocument } from '../services/api/documentation'
import { errorMessage } from '../services/http'
import type { GeneratedDocument, GenerateDocumentInput } from '../types/documentation'
import { DocumentationContext, type DocumentationContextValue, type DocumentationLoadStatus } from './documentationContext'

// Documents are generated and stored by the backend. This provider lists them for every registered
// repository and shows a placeholder 'generating' record while a request is pending.

const byNewest = (a: GeneratedDocument, b: GeneratedDocument) => b.createdAt.localeCompare(a.createdAt)

const titleFor = (input: GenerateDocumentInput, repositoryName: string) =>
  input.type === 'module' && input.module ? `${repositoryName}: ${input.module} module` : `${repositoryName}: ${typeLabel(input.type)}`

const toInput = (item: GeneratedDocument): GenerateDocumentInput => ({
  repositoryId: item.repositoryId,
  type: item.type,
  module: item.module,
  instructions: item.instructions,
  format: item.format,
})

export function DocumentationProvider({ children }: { children: ReactNode }) {
  const { repositories, status: appStatus } = useAppData()
  const [items, setItems] = useState<GeneratedDocument[]>([])
  const [aliases, setAliases] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState<{ key: string; error: string | null } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [actionError, setActionError] = useState<string | null>(null)
  const deletedWhileRunning = useRef(new Set<string>())

  const repositoryKey = repositories.map((repository) => repository.id).join('|')

  useEffect(() => {
    if (repositoryKey === '') return
    let cancelled = false
    Promise.allSettled(repositories.map((repository) => documentationApi.list(repository.id, repository.name))).then((results) => {
      if (cancelled) return
      const fulfilled = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
      const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
      setItems((current) => [...current.filter((item) => isLocalDocument(item.id)), ...fulfilled.flat()])
      setLoaded({ key: repositoryKey, error: fulfilled.length === 0 && rejected ? errorMessage(rejected.reason, 'Could not load documents.') : null })
    })
    return () => {
      cancelled = true
    }
    // `repositories` is read only to build the requests; the key already captures its ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositoryKey, attempt])

  const status: DocumentationLoadStatus =
    appStatus === 'loading' ? 'loading' : repositoryKey === '' ? 'ready' : loaded?.key !== repositoryKey ? 'loading' : loaded.error ? 'error' : 'ready'

  const reload = useCallback(() => {
    setLoaded(null)
    setAttempt((value) => value + 1)
  }, [])

  const documents = useMemo(() => {
    const known = new Set(repositories.map((repository) => repository.id))
    return items.filter((item) => known.has(item.repositoryId)).sort(byNewest)
  }, [items, repositories])

  const resolve = useCallback((id: string) => aliases[id] ?? id, [aliases])

  const execute = useCallback((record: GeneratedDocument, replacesStoredId?: string) => {
    documentationApi
      .generate(toInput(record), record.repositoryName)
      .then((result) => {
        if (deletedWhileRunning.current.delete(record.id)) {
          void documentationApi.remove(result.id).catch(() => undefined)
          return
        }
        setItems((current) => current.map((item) => (item.id === record.id ? result : item)))
        setAliases((current) => ({ ...current, [record.id]: result.id }))
        if (replacesStoredId) void documentationApi.remove(replacesStoredId).catch(() => undefined)
      })
      .catch((reason: unknown) => {
        deletedWhileRunning.current.delete(record.id)
        setItems((current) =>
          current.map((item) =>
            item.id === record.id
              ? { ...item, status: 'failed' as const, progress: 0, updatedAt: new Date().toISOString(), failureReason: errorMessage(reason, 'The document could not be generated.') }
              : item,
          ),
        )
      })
  }, [])

  const generateDocument = useCallback(
    (input: GenerateDocumentInput) => {
      const name = repositories.find((repository) => repository.id === input.repositoryId)?.name ?? input.repositoryId
      const record = createDocumentRecord(input, name, titleFor(input, name))
      setItems((current) => [record, ...current])
      execute(record)
      return record.id
    },
    [repositories, execute],
  )

  const regenerateDocument = useCallback(
    (id: string) => {
      const real = resolve(id)
      const existing = items.find((item) => item.id === real)
      if (!existing || existing.status === 'generating') return
      const reset: GeneratedDocument = {
        ...existing,
        status: 'generating',
        progress: 0,
        content: '',
        failureReason: undefined,
        aiEnhanced: undefined,
        warnings: undefined,
        updatedAt: new Date().toISOString(),
      }
      setItems((current) => current.map((item) => (item.id === real ? reset : item)))
      execute(reset, isLocalDocument(real) ? undefined : real)
    },
    [items, execute, resolve],
  )

  const deleteDocument = useCallback(
    (id: string) => {
      const real = resolve(id)
      const existing = items.find((item) => item.id === real)
      if (!existing) return
      if (isLocalDocument(real)) {
        if (existing.status === 'generating') deletedWhileRunning.current.add(real)
        setItems((current) => current.filter((item) => item.id !== real))
        return
      }
      setActionError(null)
      documentationApi
        .remove(real)
        .then(() => setItems((current) => current.filter((item) => item.id !== real)))
        .catch((reason: unknown) => setActionError(errorMessage(reason, 'Could not delete the document.')))
    },
    [items, resolve],
  )

  const value = useMemo<DocumentationContextValue>(
    () => ({
      documents,
      status,
      error: status === 'error' ? (loaded?.error ?? null) : null,
      reload,
      generatingCount: documents.filter((item) => item.status === 'generating').length,
      getDocument: (id) => documents.find((item) => item.id === resolve(id)),
      generateDocument,
      regenerateDocument,
      deleteDocument,
      actionError,
    }),
    [documents, status, loaded, reload, resolve, generateDocument, regenerateDocument, deleteDocument, actionError],
  )

  return <DocumentationContext.Provider value={value}>{children}</DocumentationContext.Provider>
}
