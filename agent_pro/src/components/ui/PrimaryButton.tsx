import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from '../../utils/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  iconRight?: ReactNode
  loading?: boolean
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand text-white shadow-[0_8px_20px_-10px_rgba(244,119,33,0.9)] hover:bg-brand-hover active:bg-brand-deep',
  secondary: 'border border-line bg-card text-ink hover:border-[#454545] hover:bg-card-hover',
  ghost: 'text-mute hover:bg-white/5 hover:text-ink',
  danger: 'bg-danger/90 text-white hover:bg-danger',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-[0.8125rem]',
  md: 'h-10 gap-2 px-4 text-sm',
}

export function PrimaryButton({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  className,
  disabled,
  children,
  type = 'button',
  ...rest
}: PrimaryButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition duration-200',
        'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  )
}
