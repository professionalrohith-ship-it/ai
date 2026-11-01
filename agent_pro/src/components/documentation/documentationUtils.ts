import { DOCUMENTATION_TYPES } from '../../constants/documentation'
import type { DocumentationStatus, GeneratedDocument } from '../../types/documentation'
import type { BadgeTone } from '../ui/Badge'

export const DOC_STATUS_META: Record<DocumentationStatus, { label: string; tone: BadgeTone }> = {
  generating: { label: 'Generating', tone: 'brand' },
  ready: { label: 'Ready', tone: 'ok' },
  failed: { label: 'Failed', tone: 'danger' },
}

export const DOC_TYPE_OPTIONS = [{ value: 'all', label: 'All document types' }, ...DOCUMENTATION_TYPES.map((type) => ({ value: type.id, label: type.label }))]

export function filterDocuments(documents: GeneratedDocument[], filters: { query: string; type: string }): GeneratedDocument[] {
  const needle = filters.query.trim().toLowerCase()
  return documents.filter(
    (document) =>
      (filters.type === 'all' || document.type === filters.type) &&
      (needle === '' ||
        document.title.toLowerCase().includes(needle) ||
        document.repositoryName.toLowerCase().includes(needle) ||
        (document.module ?? '').toLowerCase().includes(needle)),
  )
}
