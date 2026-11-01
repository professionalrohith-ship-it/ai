import { useRef, type KeyboardEvent, type PointerEvent } from 'react'

import { cn } from '../../utils/cn'

interface ResizeHandleProps {
  /** Current width in px of the panel this handle resizes. */
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  /** 'right' = panel is on the handle's left (drag right to grow); 'left' = panel is on its right. */
  grows: 'right' | 'left'
  label: string
}

const STEP = 16

/** Draggable and keyboard-operable (arrow keys) divider between two panels. */
export function ResizeHandle({ value, min, max, onChange, grows, label }: ResizeHandleProps) {
  const start = useRef<{ x: number; value: number } | null>(null)
  const direction = grows === 'right' ? 1 : -1
  const clamp = (next: number) => Math.max(min, Math.min(max, Math.round(next)))

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    start.current = { x: event.clientX, value }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    onChange(clamp(start.current.value + (event.clientX - start.current.x) * direction))
  }

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    start.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const sign = event.key === 'ArrowRight' ? 1 : -1
      onChange(clamp(value + sign * STEP * direction))
    } else if (event.key === 'Home') {
      event.preventDefault()
      onChange(min)
    } else if (event.key === 'End') {
      event.preventDefault()
      onChange(max)
    }
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      className={cn(
        'group relative w-2 cursor-col-resize touch-none outline-none',
        'before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-transparent before:transition-colors',
        'hover:before:bg-brand/60 focus-visible:before:bg-brand active:before:bg-brand',
      )}
    />
  )
}
