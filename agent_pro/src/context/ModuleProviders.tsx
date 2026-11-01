import type { ReactNode } from 'react'

import { ChatProvider } from './ChatProvider'
import { DocumentationProvider } from './DocumentationProvider'
import { InvestigationProvider } from './InvestigationProvider'

/** Mounts every module-level state provider once, inside the dashboard shell, so state
 *  survives navigation between screens. Repository state lives in AppDataProvider. */
export function ModuleProviders({ children }: { children: ReactNode }) {
  return (
    <ChatProvider>
      <InvestigationProvider>
        <DocumentationProvider>{children}</DocumentationProvider>
      </InvestigationProvider>
    </ChatProvider>
  )
}
