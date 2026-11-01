import { useContext } from 'react'

import { DocumentationContext, type DocumentationContextValue } from '../context/documentationContext'

export function useDocumentation(): DocumentationContextValue {
  const value = useContext(DocumentationContext)
  if (!value) throw new Error('useDocumentation must be used inside <DocumentationProvider>')
  return value
}
