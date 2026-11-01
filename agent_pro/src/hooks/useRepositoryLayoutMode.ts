import { useCallback, useRef, useState } from 'react'

export type ExplorerLayoutMode = 'wide' | 'medium' | 'narrow'

const WIDE_MIN = 1040
const MEDIUM_MIN = 720

/**
 * Chooses the Explorer layout from the width of its own container (not the window), so it adapts
 * when the sidebar is expanded or collapsed. wide = three panels, medium = tree + viewer (info in a
 * drawer), narrow = one panel at a time with tabs.
 */
export function useRepositoryLayoutMode() {
  const [width, setWidth] = useState(0)
  const observer = useRef<ResizeObserver | null>(null)

  const ref = useCallback((element: HTMLElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!element) return
    setWidth(element.getBoundingClientRect().width)
    observer.current = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.current.observe(element)
  }, [])

  const mode: ExplorerLayoutMode = width >= WIDE_MIN ? 'wide' : width >= MEDIUM_MIN ? 'medium' : 'narrow'
  return { ref, width, mode }
}
