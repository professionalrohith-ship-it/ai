import { ChevronDown } from 'lucide-react'
import { useId } from 'react'

import { cn } from '../../utils/cn'
import { controlClass } from '../../utils/formStyles'

interface FilterSelectProps {
  /** Accessible name (not shown). */
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  className?: string
}

/** Compact native select for toolbars (search / filter / sort rows). */
export function FilterSelect({ label, value, onChange, options, className }: FilterSelectProps) {
  const id = useId()
  return (
    <div className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={controlClass(false, 'h-10 cursor-pointer appearance-none pr-9')}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-card text-ink">
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-mute" aria-hidden="true" />
    </div>
  )
}
