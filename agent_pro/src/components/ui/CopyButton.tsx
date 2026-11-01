import { Check, Copy } from 'lucide-react'

import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'
import { cn } from '../../utils/cn'

interface CopyButtonProps {
  text: string
  label?: string
  /** Show the text label next to the icon. */
  showLabel?: boolean
  className?: string
}

/** Icon button that copies `text` and briefly confirms with a check mark. */
export function CopyButton({ text, label = 'Copy', showLabel = false, className }: CopyButtonProps) {
  const { copied, copy } = useCopyToClipboard()

  return (
    <button
      type="button"
      onClick={() => void copy(text)}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition',
        copied ? 'text-ok' : 'text-mute hover:bg-white/10 hover:text-ink',
        className,
      )}
    >
      {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      {showLabel && <span>{copied ? 'Copied' : label}</span>}
    </button>
  )
}
