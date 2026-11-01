import { BrainCircuit, ChevronDown, CircleAlert, RefreshCw } from 'lucide-react'

import type { ChatMessage as ChatMessageData } from '../../types/chat'
import { cn } from '../../utils/cn'
import { AGENT_META } from '../agents/agentMeta'
import { ExecutionProgress } from '../agents/ExecutionProgress'
import { Badge } from '../ui/Badge'
import { CopyButton } from '../ui/CopyButton'
import { PrimaryButton } from '../ui/PrimaryButton'
import { AIResponse } from './AIResponse'
import { formatTime } from './chatFormat'
import { TypingIndicator } from './TypingIndicator'

interface ChatMessageProps {
  message: ChatMessageData
  /** Only the latest answer can be regenerated. */
  canRegenerate: boolean
  onRegenerate: (messageId: string) => void
  onOpenFile: (path: string, line?: number) => void
}

export function ChatMessage({ message, canRegenerate, onRegenerate, onOpenFile }: ChatMessageProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[min(85%,42rem)] min-w-0">
          <div className="rounded-2xl rounded-br-md border border-brand/25 bg-brand/12 px-4 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-ink">
            {message.content}
          </div>
          <p className="mt-1 text-right text-[0.6875rem] text-[#6f6f6f]">You · {formatTime(message.createdAt)}</p>
        </div>
      </div>
    )
  }

  const steps = message.agentSteps ?? []
  const streaming = message.status === 'streaming'

  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-hover to-brand-deep text-white">
        <BrainCircuit className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-xs font-semibold text-ink">CODEMIND AI</span>
          {message.agent && AGENT_META[message.agent] && <Badge tone="info">{AGENT_META[message.agent].name}</Badge>}
          <span className="text-[0.6875rem] text-[#6f6f6f]">{formatTime(message.createdAt)}</span>
        </div>

        <div className="min-w-0 rounded-2xl rounded-tl-md border border-line bg-card/70 p-4 max-sm:p-3.5">
          {streaming && (
            <div className="flex items-center gap-3">
              <TypingIndicator />
              <span className="text-xs text-mute">Searching the repository and asking the AI model… this can take a while with a local model.</span>
            </div>
          )}

          {message.status === 'error' && (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger/8 p-3.5">
              <p className="flex items-center gap-2 text-sm font-semibold text-danger">
                <CircleAlert className="size-4" aria-hidden="true" />
                This answer could not be completed
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-mute">{message.errorMessage ?? 'Something went wrong.'}</p>
              <PrimaryButton
                size="sm"
                variant="secondary"
                className="mt-3"
                icon={<RefreshCw className="size-3.5" aria-hidden="true" />}
                onClick={() => onRegenerate(message.id)}
              >
                Try again
              </PrimaryButton>
            </div>
          )}

          {message.status === 'complete' && (
            <>
              <AIResponse message={message} onOpenFile={onOpenFile} />
              {message.warnings && message.warnings.length > 0 && (
                <ul className="mt-3 space-y-1 rounded-xl border border-warn/25 bg-warn/8 px-3.5 py-2.5 text-xs leading-relaxed text-warn">
                  {message.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-line pt-2.5">
                <CopyButton text={message.content} label="Copy response" showLabel />
                {canRegenerate && (
                  <button
                    type="button"
                    onClick={() => onRegenerate(message.id)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-mute transition hover:bg-white/10 hover:text-ink"
                  >
                    <RefreshCw className="size-3.5" aria-hidden="true" />
                    Regenerate
                  </button>
                )}
              </div>
              {steps.length > 0 && (
                <details className="group/steps mt-2 rounded-xl border border-line bg-surface/50">
                  <summary
                    className={cn(
                      'flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2 text-xs text-mute transition hover:text-ink',
                    )}
                  >
                    {message.agent && AGENT_META[message.agent] ? `Answered by ${AGENT_META[message.agent].name}` : 'How this was answered'}
                    <ChevronDown className="size-4 transition group-open/steps:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="border-t border-line px-3.5 py-3">
                    {message.routeReason && <p className="mb-3 text-xs leading-relaxed text-mute">{message.routeReason}</p>}
                    <ExecutionProgress steps={steps} />
                  </div>
                </details>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
