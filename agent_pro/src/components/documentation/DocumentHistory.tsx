import { Eye, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { typeLabel } from '../../constants/documentation'
import { documentPath } from '../../constants/navigation'
import type { GeneratedDocument } from '../../types/documentation'
import { formatDateTime } from '../analysis/formatDateTime'
import { Badge } from '../ui/Badge'
import { DOC_STATUS_META } from './documentationUtils'

interface DocumentHistoryProps {
  documents: GeneratedDocument[]
  onDelete: (id: string) => void
}

/** Generated documents: a table on wide pages, stacked cards when the page gets narrow. */
export function DocumentHistory({ documents, onDelete }: DocumentHistoryProps) {
  return (
    <>
      <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card @max-[44rem]:hidden">
        <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
          <thead className="bg-surface text-[0.6875rem] tracking-wide text-mute uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                Document
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                Repository
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                Type
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                Generated
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                Status
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {documents.map((document) => {
              const status = DOC_STATUS_META[document.status]
              return (
                <tr key={document.id} className="transition-colors hover:bg-white/[0.03]">
                  <td className="max-w-72 px-4 py-3">
                    <Link to={documentPath(document.id)} className="block truncate font-medium text-ink transition hover:text-brand">
                      {document.title}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-mute">{document.repositoryName}</td>
                  <td className="px-3 py-3">
                    <Badge>{typeLabel(document.type)}</Badge>
                  </td>
                  <td className="px-3 py-3 text-xs whitespace-nowrap text-mute">{formatDateTime(document.createdAt)}</td>
                  <td className="px-3 py-3">
                    <Badge tone={status.tone} pulse={document.status === 'generating'}>
                      {status.label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        to={documentPath(document.id)}
                        aria-label={`View ${document.title}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/5 px-3 text-xs font-semibold text-ink transition hover:bg-brand hover:text-white"
                      >
                        <Eye className="size-3.5" aria-hidden="true" />
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => onDelete(document.id)}
                        aria-label={`Delete ${document.title}`}
                        className="grid size-8 place-items-center rounded-lg text-mute transition hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ul className="hidden gap-3 @max-[44rem]:grid">
        {documents.map((document) => {
          const status = DOC_STATUS_META[document.status]
          return (
            <li key={document.id} className="space-y-3 rounded-card border border-line bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <Link to={documentPath(document.id)} className="min-w-0 font-semibold break-words text-ink transition hover:text-brand">
                  {document.title}
                </Link>
                <Badge tone={status.tone} pulse={document.status === 'generating'}>
                  {status.label}
                </Badge>
              </div>
              <p className="flex flex-wrap items-center gap-2 text-xs text-mute">
                <Badge>{typeLabel(document.type)}</Badge>
                {document.repositoryName} · {formatDateTime(document.createdAt)}
              </p>
              <div className="flex items-center justify-between">
                <Link
                  to={documentPath(document.id)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/5 px-3 text-xs font-semibold text-ink transition hover:bg-brand hover:text-white"
                >
                  <Eye className="size-3.5" aria-hidden="true" />
                  View
                </Link>
                <button
                  type="button"
                  onClick={() => onDelete(document.id)}
                  aria-label={`Delete ${document.title}`}
                  className="grid size-8 place-items-center rounded-lg text-mute transition hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
