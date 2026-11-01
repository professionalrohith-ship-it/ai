import { FilePlus2, FileText, SearchX, ServerCrash, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { FilterSelect } from '../../components/analysis/FilterSelect'
import { RepositorySelect } from '../../components/analysis/RepositorySelect'
import { EmptyState } from '../../components/common/EmptyState'
import { Skeleton } from '../../components/common/LoadingState'
import { PageHeader } from '../../components/common/PageHeader'
import { DocumentHistory } from '../../components/documentation/DocumentHistory'
import { DocumentTypePicker } from '../../components/documentation/DocumentTypePicker'
import { DOC_TYPE_OPTIONS, filterDocuments } from '../../components/documentation/documentationUtils'
import { GenerateDocumentModal } from '../../components/documentation/GenerateDocumentModal'
import { ConfirmationModal } from '../../components/ui/ConfirmationModal'
import { PrimaryButton } from '../../components/ui/PrimaryButton'
import { SearchInput } from '../../components/ui/SearchInput'
import { documentPath } from '../../constants/navigation'
import { useDocumentation } from '../../hooks/useDocumentation'
import type { DocumentationType, GeneratedDocument, GenerateDocumentInput } from '../../types/documentation'

/** /documentation: type picker, generate dialog and the history of generated documents. */
export function DocumentList() {
  const navigate = useNavigate()
  const { documents, status: loadStatus, error: loadError, reload, generateDocument, deleteDocument, actionError } = useDocumentation()

  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [modalType, setModalType] = useState<DocumentationType | null>(null)
  const [pendingDelete, setPendingDelete] = useState<GeneratedDocument | null>(null)

  const visible = useMemo(() => filterDocuments(documents, { query, type }), [documents, query, type])
  const filtering = query.trim() !== '' || type !== 'all'

  const clear = () => {
    setQuery('')
    setType('all')
  }

  const submit = (input: GenerateDocumentInput) => {
    const id = generateDocument(input)
    setModalType(null)
    navigate(documentPath(id))
  }

  const confirmDelete = () => {
    if (pendingDelete) deleteDocument(pendingDelete.id)
    setPendingDelete(null)
  }

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Documentation Generator"
        description="Generate structured technical documentation for your software projects."
        actions={
          <>
            <RepositorySelect className="w-56 @max-[40rem]:w-full" />
            <PrimaryButton icon={<FilePlus2 className="size-4" aria-hidden="true" />} onClick={() => setModalType('project-overview')}>
              New documentation
            </PrimaryButton>
          </>
        }
      />

      <section aria-label="Document types" className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Choose a document type</h2>
        <DocumentTypePicker onPick={setModalType} />
      </section>

      <section aria-label="Recently generated documents" className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">
          Recently generated documents
          <span className="ml-2 font-normal text-mute" aria-live="polite">
            ({visible.length})
          </span>
        </h2>

        {documents.length > 0 && (
          <div className="flex flex-row flex-wrap items-center gap-3 @max-[40rem]:flex-col @max-[40rem]:items-stretch">
            <SearchInput
              value={query}
              onChange={setQuery}
              label="Search documents"
              placeholder="Search by name, repository or module"
              className="min-w-56 flex-1"
            />
            <FilterSelect label="Filter by document type" value={type} onChange={setType} options={DOC_TYPE_OPTIONS} className="w-60 @max-[40rem]:w-full" />
            {filtering && (
              <PrimaryButton variant="ghost" icon={<X className="size-4" aria-hidden="true" />} onClick={clear}>
                Clear filters
              </PrimaryButton>
            )}
          </div>
        )}

        {actionError && (
          <p role="alert" className="rounded-lg border border-danger/25 bg-danger/10 p-3 text-xs text-danger">
            {actionError}
          </p>
        )}

        {documents.length === 0 && loadStatus === 'loading' ? (
          <div className="grid gap-3">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : documents.length === 0 && loadStatus === 'error' ? (
          <EmptyState
            icon={ServerCrash}
            title="Could not load documents"
            description={loadError ?? 'The backend did not answer.'}
            action={<PrimaryButton onClick={reload}>Try again</PrimaryButton>}
          />
        ) : documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No documentation generated"
            description="Pick a document type above to generate your first document from a scanned repository."
            action={
              <PrimaryButton icon={<FilePlus2 className="size-4" aria-hidden="true" />} onClick={() => setModalType('project-overview')}>
                New documentation
              </PrimaryButton>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No documents found"
            description="No document matches your search and filter. Try different words or clear the filters."
            action={
              <PrimaryButton variant="secondary" onClick={clear}>
                Clear filters
              </PrimaryButton>
            }
          />
        ) : (
          <DocumentHistory documents={visible} onDelete={(id) => setPendingDelete(documents.find((item) => item.id === id) ?? null)} />
        )}
      </section>

      <GenerateDocumentModal
        key={modalType ?? 'closed'}
        open={modalType !== null}
        initialType={modalType ?? 'project-overview'}
        onClose={() => setModalType(null)}
        onSubmit={submit}
      />

      <ConfirmationModal
        open={pendingDelete !== null}
        danger
        title="Delete this document?"
        description={`"${pendingDelete?.title ?? ''}" will be removed from the history.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
