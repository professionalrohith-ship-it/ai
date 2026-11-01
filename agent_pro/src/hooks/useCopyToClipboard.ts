import { useCallback, useEffect, useRef, useState } from 'react'

/** Copies text to the clipboard and exposes a short-lived `copied` flag for UI feedback. */
export function useCopyToClipboard(resetMs = 1800) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      let ok = false
      try {
        await navigator.clipboard.writeText(text)
        ok = true
      } catch {
        // fall back to a temporary textarea (older browsers / insecure contexts)
        try {
          const area = document.createElement('textarea')
          area.value = text
          area.setAttribute('readonly', '')
          area.style.position = 'fixed'
          area.style.opacity = '0'
          document.body.appendChild(area)
          area.select()
          ok = document.execCommand('copy')
          area.remove()
        } catch {
          ok = false
        }
      }
      setCopied(ok)
      window.clearTimeout(timer.current)
      if (ok) timer.current = window.setTimeout(() => setCopied(false), resetMs)
      return ok
    },
    [resetMs],
  )

  return { copied, copy }
}
