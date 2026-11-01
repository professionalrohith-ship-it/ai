/** Saves text as a file through a temporary Blob link (works without a server). */
export function downloadTextFile(fileName: string, content: string, mimeType = 'text/markdown;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // revoke on the next tick so the download has started
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** A safe file name from a document title, e.g. "web-storefront: Setup Guide" -> "web-storefront-setup-guide.md". */
export function markdownFileName(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${base || 'document'}.md`
}
