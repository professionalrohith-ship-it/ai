import { useContext } from 'react'

import { InvestigationContext, type InvestigationContextValue } from '../context/investigationContext'

export function useInvestigations(): InvestigationContextValue {
  const value = useContext(InvestigationContext)
  if (!value) throw new Error('useInvestigations must be used inside <InvestigationProvider>')
  return value
}
