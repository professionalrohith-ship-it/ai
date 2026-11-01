import { useEffect, useRef, useState, type RefObject } from 'react'

/** Width (px) of an element, kept up to date with ResizeObserver. Lets panels react to the
 *  space they actually have (the sidebar and window size both change it). */
export function useElementWidth<T extends HTMLElement>(initial = 1200): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(initial)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width
      if (next !== undefined) setWidth(Math.round(next))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

export type ChatLayoutMode = 'full' | 'medium' | 'compact'

/** full: history + chat + activity panel inline; medium: activity panel in a drawer;
 *  compact: history and activity panel are both drawers. */
export function chatLayoutFor(width: number): ChatLayoutMode {
  if (width >= 1100) return 'full'
  if (width >= 760) return 'medium'
  return 'compact'
}
