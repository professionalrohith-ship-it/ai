import { CodeXml } from 'lucide-react'

import { cn } from '../../utils/cn'

interface LogoProps {
  /** Show only the mark (used when the sidebar is collapsed). */
  compact?: boolean
  className?: string
}

export function Logo({ compact = false, className }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-hover to-brand-deep text-white shadow-[0_8px_20px_-8px_rgba(244,119,33,0.9)]">
        <CodeXml className="size-5" aria-hidden="true" />
      </span>
      {!compact && (
        <span className="text-[0.95rem] font-extrabold tracking-wide whitespace-nowrap text-ink">
          CODEMIND <span className="text-brand">AI</span>
        </span>
      )}
    </div>
  )
}
