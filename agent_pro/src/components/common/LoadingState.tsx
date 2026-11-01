import { Loader2 } from 'lucide-react'

import { cn } from '../../utils/cn'

/** Shimmering placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-shimmer rounded-md bg-[linear-gradient(90deg,#222_25%,#2c2c2c_50%,#222_75%)] bg-[length:200%_100%]',
        className,
      )}
    />
  )
}

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-12 text-sm text-mute">
      <Loader2 className="size-5 animate-spin text-brand" aria-hidden="true" />
      {label}
    </div>
  )
}
