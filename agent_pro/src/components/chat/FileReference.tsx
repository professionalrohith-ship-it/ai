import { FileCode2 } from 'lucide-react'

import type { ReferencedFile } from '../../types/chat'
import { cn } from '../../utils/cn'

interface FileReferenceProps {
  file: ReferencedFile
  onOpen: (path: string, line?: number) => void
  /** Stack the reason under the path (used in the side panel). */
  detailed?: boolean
  className?: string
}

/** Clickable chip for a file an answer is based on; opens it in the Repository Explorer. */
export function FileReference({ file, onOpen, detailed = false, className }: FileReferenceProps) {
  const label = file.line ? `${file.path}:${file.line}` : file.path
  return (
    <button
      type="button"
      onClick={() => onOpen(file.path, file.line)}
      title={`${file.reason}\nOpen in Repository Explorer`}
      aria-label={`Open ${label} in Repository Explorer`}
      className={cn(
        'group flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-line bg-surface/80 px-2.5 py-1.5 text-left transition',
        'hover:border-brand/50 hover:bg-brand/8',
        className,
      )}
    >
      <FileCode2 className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate font-mono text-xs text-ink/90 group-hover:text-brand">{label}</span>
        {detailed && <span className="mt-0.5 block text-[0.6875rem] leading-snug text-mute">{file.reason}</span>}
      </span>
    </button>
  )
}
