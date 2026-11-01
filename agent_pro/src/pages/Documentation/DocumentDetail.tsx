import { ArrowLeft, Check, CircleAlert, Copy, Download, FileText, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { formatDateTime } from '../../components/analysis/formatDateTime'
import { EmptyState } from '../../components/common/EmptyState'
import { PageHeader } from '../../components/common/PageHeader'
import { DOC_STATUS_META } from '../../components/documentation/documentationUtils'
import { DocumentViewer } from '../../components/documentation/DocumentViewer'
import { Badge } from '../../components/ui/Badge'
import { ConfirmationModal } from '../../components/ui/ConfirmationModal'
import { PrimaryButton } from '../../components/ui/PrimaryButton'
import { typeLabel } from '../../constants/documentation'
import { documentPath, explorerPath, ROUTES } from '../../constants/navigation'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'
import { useDocumentation } from '../../hooks/useDocumentation'
import { downloadTextFile, markdownFileName } from '../../utils/download'

/** /documentation/:documentId: generation progress, then the Markdown viewer. */
export function DocumentDetail({ documentId }: { documentId: string }) {
  const navigate = useNavigate()
  const { getDocument, regenerateDocument, deleteDocument } = useDocumentation()
  const { copied, copy } = useCopyToClipboard()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const document = getDocument(documentId)

  // a finished generation gets its stored id from the backend: move the URL to it
  useEffect(() => {
    if (document && document.id !== documentId) navigate(documentPath(document.id), { replace: true })
  }, [document, documentId, navigate])

  if (!document) {
    return (
      <div className="animate-fade-up py-4">
        <EmptyState
          icon={FileText}
          title="Document not found"
          description="This document may have been deleted. Go back to the list to pick another one."
          action={<PrimaryButton onClick={() => navigate(ROUTES.documentation)}>Back to documentation</PrimaryButton>}
        />
      </div>
    )
  }

  const status = DOC_STATUS_META[document.status]
  const ready = document.status === 'ready'

  return (
    <div className="animate-fade-up space-y-6">
      <button
        type="button"
        onClick={() => navigate(ROUTES.documentation)}
        className="inline-flex items-center gap-2 text-sm font-medium text-mute transition hover:text-brand"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All documents
      </button>

      <PageHeader
        title={document.title}
        description={`${typeLabel(document.type)} · ${document.repositoryName} · ${ready ? 'generated' : 'started'} ${formatDateTime(document.updatedAt)}`}
        actions={
          <>
            <Badge tone={status.tone} pulse={document.status === 'generating'}>
              {status.label}
            </Badge>
            {ready && (
              <>
                <PrimaryButton
                  variant="secondary"
                  icon={copied ? <Check className="size-4 text-ok" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                  onClick={() => void copy(document.content)}
                >
                  {copied ? 'Copied' : 'Copy Markdown'}
                </PrimaryButton>
                <PrimaryButton
                  variant="secondary"
                  icon={<Download className="size-4" aria-hidden="true" />}
                  onClick={() => downloadTextFile(markdownFileName(document.title), document.content)}
                >
                  Download .md
                </PrimaryButton>
              </>
            )}
            {document.status !== 'generating' && (
              <PrimaryButton variant="secondary" icon={<RefreshCw className="size-4" aria-hidden="true" />} onClick={() => regenerateDocument(document.id)}>
                Regenerate
              </PrimaryButton>
            )}
            <PrimaryButton variant="ghost" icon={<Trash2 className="size-4" aria-hidden="true" />} onClick={() => setConfirmDelete(true)}>
              Delete
            </PrimaryButton>
          </>
        }
      />

      {document.status === 'generating' && (
        <section aria-label="Generation progress" className="space-y-4 rounded-card border border-line bg-card p-6 shadow-card max-sm:p-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">Generating document</h2>
            <p className="mt-1 text-xs text-mute">
              Collecting facts from the repository index and writing the document. An AI summary can take a few minutes with a local model.
            </p>
          </div>
          <div role="progressbar" aria-label="Generating document" className="h-2 w-full overflow-hidden rounded-full bg-white/8">
            <div className="h-full w-full animate-shimmer rounded-full bg-gradient-to-r from-white/5 via-brand to-white/5 bg-[length:200%_100%]" />
          </div>
        </section>
      )}

      {document.status === 'failed' && (
        <EmptyState
          tone="error"
          icon={CircleAlert}
          title="Generation failed"
          description={document.failureReason ?? 'The document could not be generated.'}
          action={
            <PrimaryButton icon={<RefreshCw className="size-4" aria-hidden="true" />} onClick={() => regenerateDocument(document.id)}>
              Regenerate
            </PrimaryButton>
          }
        />
      )}

      {ready && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-mute">
            <Badge tone={document.aiEnhanced ? 'ok' : 'neutral'}>{document.aiEnhanced ? 'AI summary included' : 'Generated from repository data'}</Badge>
            <span>The facts in this document come from the scan and parse results of the repository.</span>
          </div>
          {(document.warnings ?? []).length > 0 && (
            <ul className="space-y-1 rounded-xl border border-warn/25 bg-warn/8 px-3.5 py-2.5 text-xs leading-relaxed text-warn">
              {(document.warnings ?? []).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          <DocumentViewer
            document={document}
            onFileReference={(path, line) => navigate(explorerPath({ file: path, line, repositoryId: document.repositoryId }))}
          />
        </>
      )}

      <ConfirmationModal
        open={confirmDelete}
        danger
        title="Delete this document?"
        description="It will be removed from the history."
        confirmLabel="Delete"
        onConfirm={() => {
          deleteDocument(document.id)
          setConfirmDelete(false)
          navigate(ROUTES.documentation)
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
