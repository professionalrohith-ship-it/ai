import { useParams } from 'react-router-dom'

import { DocumentDetail } from './DocumentDetail'
import { DocumentList } from './DocumentList'

/** /documentation shows the generator and history; /documentation/:documentId shows one document. */
export default function Documentation() {
  const { documentId } = useParams()
  return documentId ? <DocumentDetail documentId={documentId} /> : <DocumentList />
}
