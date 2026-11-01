import { useEffect, useState, type RefObject } from 'react'

/** Current content width (px) of an element, kept up to date with a ResizeObserver.
 *  Used to switch between an inline side panel and a drawer based on the space the
 *  page actually has (the sidebar changes it), not on the window width. */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    setWidth(element.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return width
}
