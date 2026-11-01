import { ChevronDown } from 'lucide-react'
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

import { cn } from '../../utils/cn'
import { controlClass } from '../../utils/formStyles'

interface FieldProps {
  label: string
  /** The id of the control this label belongs to. */
  htmlFor: string
  error?: string
  hint?: string
  required?: boolean
  optional?: boolean
  children: ReactNode
  className?: string
}

/** Label + control + hint/error text. */
export function Field({ label, htmlFor, error, hint, required, optional, children, className }: FieldProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline gap-2 text-[0.8125rem] font-medium text-ink">
        {label}
        {required && (
          <span className="text-brand" aria-hidden="true">
            *
          </span>
        )}
        {optional && <span className="text-xs font-normal text-mute">(optional)</span>}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-mute">{hint}</p>
      )}
    </div>
  )
}

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  error?: string
  hint?: string
  optional?: boolean
  fieldClassName?: string
}

export function TextInput({ label, error, hint, optional, fieldClassName, className, required, ...rest }: TextInputProps) {
  const id = useId()
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} required={required} optional={optional} className={fieldClassName}>
      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        className={controlClass(!!error, cn('h-10', className))}
        {...rest}
      />
    </Field>
  )
}

interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string
  error?: string
  hint?: string
  optional?: boolean
  fieldClassName?: string
}

export function TextArea({ label, error, hint, optional, fieldClassName, className, required, rows = 4, ...rest }: TextAreaProps) {
  const id = useId()
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} required={required} optional={optional} className={fieldClassName}>
      <textarea
        id={id}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        className={controlClass(!!error, cn('resize-y py-2.5 leading-relaxed', className))}
        {...rest}
      />
    </Field>
  )
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'children'> {
  label: string
  options: { value: string; label: string }[]
  error?: string
  hint?: string
  optional?: boolean
  fieldClassName?: string
  /** Hides the visible label (it stays available to screen readers); for toolbars. */
  hideLabel?: boolean
}

/** Styled native select (works everywhere, including touch devices). */
export function Select({ label, options, error, hint, optional, fieldClassName, className, required, hideLabel, ...rest }: SelectProps) {
  const id = useId()
  return (
    <Field
      label={hideLabel ? '' : label}
      htmlFor={id}
      error={error}
      hint={hint}
      required={required}
      optional={optional}
      className={fieldClassName}
    >
      {hideLabel && (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          className={controlClass(!!error, cn('h-10 cursor-pointer appearance-none pr-9', className))}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-card text-ink">
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-mute" aria-hidden="true" />
      </div>
    </Field>
  )
}
