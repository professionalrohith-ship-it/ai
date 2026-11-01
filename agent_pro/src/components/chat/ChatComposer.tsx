import { ArrowUp, FolderGit2, Info, Loader2 } from 'lucide-react'
import { useEffect, useRef, type ChangeEvent, type KeyboardEvent } from 'react'

import { cn } from '../../utils/cn'

interface ChatComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: (text: string) => void
  /** true while an answer is in progress. */
  busy: boolean
  repositoryName: string | null
  /** Message shown above the input (AI not configured, last send failed, ...). */
  notice?: { tone: 'info' | 'warn'; text: string } | null
}

const MAX_HEIGHT_PX = 168

export function ChatComposer({ value, onChange, onSend, busy, repositoryName, notice }: ChatComposerProps) {
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const canSend = value.trim().length > 0 && !busy

  const resize = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto'
    // An empty box stays one row: a wrapping placeholder would otherwise inflate scrollHeight.
    if (element.value === '') return
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT_PX)}px`
  }

  // shrink back after sending or when the draft is replaced from outside
  useEffect(() => {
    if (areaRef.current) resize(areaRef.current)
  }, [value])

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (canSend) onSend(value)
  }

  return (
    <div className="shrink-0 border-t border-line bg-surface/60 p-3.5 max-sm:p-3">
      {notice && (
        <p
          role={notice.tone === 'warn' ? 'alert' : 'status'}
          className={cn(
            'mb-2.5 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-relaxed',
            notice.tone === 'warn' ? 'border-warn/25 bg-warn/8 text-warn' : 'border-info/25 bg-info/8 text-info',
          )}
        >
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">{notice.text}</span>
        </p>
      )}
      <div className="rounded-2xl border border-line bg-card transition focus-within:border-brand/60 focus-within:ring-4 focus-within:ring-brand/10">
        <label htmlFor="chat-composer-input" className="sr-only">
          Message CODEMIND AI
        </label>
        <textarea
          id="chat-composer-input"
          ref={areaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={repositoryName ? `Ask anything about ${repositoryName}` : 'Select a repository to start asking questions'}
          disabled={!repositoryName}
          className="block max-h-[10.5rem] w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm leading-relaxed text-ink placeholder:text-mute/70 focus:outline-none disabled:cursor-not-allowed"
        />
        <div className="flex flex-wrap items-center gap-2 px-3 pt-1 pb-2.5">
          <span
            className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs text-ink/90"
            title="Repository this conversation is about"
          >
            <FolderGit2 className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
            <span className="truncate">{repositoryName ?? 'No repository'}</span>
          </span>

          <span className="ml-auto text-[0.6875rem] text-[#6f6f6f] max-sm:hidden">Enter to send · Shift+Enter for a new line</span>

          <button
            type="button"
            onClick={() => canSend && onSend(value)}
            disabled={!canSend}
            aria-label={busy ? 'Waiting for the answer' : 'Send message'}
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-xl transition',
              canSend
                ? 'bg-brand text-white shadow-[0_8px_20px_-10px_rgba(244,119,33,0.9)] hover:bg-brand-hover active:scale-95'
                : 'bg-white/8 text-mute',
            )}
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ArrowUp className="size-4" aria-hidden="true" />}
          </button>
        </div>
      </div>
      <p className="mt-2 text-center text-[0.6875rem] text-[#6f6f6f]">
        Answers come from your repository index and an AI model. They can be wrong, so check the cited files.
      </p>
    </div>
  )
}
