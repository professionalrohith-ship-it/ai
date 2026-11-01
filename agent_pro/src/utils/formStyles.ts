import { cn } from './cn'

/** Shared class names for text inputs, textareas and selects so every form looks the same. */
export function controlClass(invalid = false, extra?: string): string {
  return cn(
    'w-full rounded-lg border bg-surface px-3 text-sm text-ink placeholder:text-mute/70 transition',
    'focus:bg-card focus:ring-4 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
    invalid
      ? 'border-danger/70 focus:border-danger focus:ring-danger/15'
      : 'border-line focus:border-brand/70 focus:ring-brand/10',
    extra,
  )
}
