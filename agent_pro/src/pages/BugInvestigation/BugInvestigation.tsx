import { useParams } from 'react-router-dom'

import { InvestigationDetail } from './InvestigationDetail'
import { InvestigationList } from './InvestigationList'

/** /bugs shows the history; /bugs/:investigationId shows one investigation. */
export default function BugInvestigation() {
  const { investigationId } = useParams()
  return investigationId ? <InvestigationDetail investigationId={investigationId} /> : <InvestigationList />
}
