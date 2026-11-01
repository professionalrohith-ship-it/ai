import { FolderGit2, Route } from 'lucide-react'

import type { ChatMessage } from '../../types/chat'
import { AGENT_META } from '../agents/agentMeta'
import { AgentActivityPanel } from '../agents/AgentActivityPanel'
import { FileReference } from './FileReference'

interface ChatContextPanelProps {
  repositoryName: string | null
  repositoryPath: string | null
  /** The latest assistant message, which drives the activity and file sections. */
  latest: ChatMessage | null
  onOpenFile: (path: string, line?: number) => void
}

/** Right-hand panel: agent activity, repository context and the files behind the latest answer. */
export function ChatContextPanel({ repositoryName, repositoryPath, latest, onOpenFile }: ChatContextPanelProps) {
  const files = latest?.status === 'complete' ? (latest.files ?? []) : []

  return (
    <div className="divide-y divide-line">
      <AgentActivityPanel
        steps={latest?.agentSteps ?? []}
        status={latest?.status ?? null}
        agentName={latest?.agent && AGENT_META[latest.agent] ? AGENT_META[latest.agent].name : null}
        routeReason={latest?.routeReason ?? null}
      />

      <section aria-label="Repository context" className="px-4 py-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Repository context</h3>
        <div className="space-y-2.5 rounded-xl border border-line bg-surface/60 p-3.5">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <FolderGit2 className="size-4 shrink-0 text-brand" aria-hidden="true" />
            <span className="truncate">{repositoryName ?? 'No repository'}</span>
          </p>
          {repositoryPath && <p className="truncate font-mono text-xs text-mute">{repositoryPath}</p>}
          {latest?.agent && AGENT_META[latest.agent] && (
            <p className="flex items-center gap-2 text-xs text-mute">
              <Route className="size-3.5 shrink-0" aria-hidden="true" />
              Last answer: {AGENT_META[latest.agent].name}
            </p>
          )}
        </div>
        <p className="mt-2 text-[0.6875rem] leading-relaxed text-[#6f6f6f]">
          Answers are built from the scanned and parsed index of this repository (files, symbols and imports).
        </p>
      </section>

      <section aria-label="Files referenced" className="px-4 py-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">
          Files referenced {files.length > 0 && <span className="font-normal text-mute">({files.length})</span>}
        </h3>
        {files.length === 0 ? (
          <p className="text-xs leading-relaxed text-mute">Files cited by the latest answer appear here. Click one to open it in the Repository Explorer.</p>
        ) : (
          <div className="space-y-2">
            {files.map((file) => (
              <FileReference key={file.path} file={file} onOpen={onOpenFile} detailed className="w-full" />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
