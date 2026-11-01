/** "Oct 31, 2026, 9:41 AM" */
export function formatDateTime(iso: string | undefined): string {
  if (!iso) return 'Not available'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Not available'
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** "9:41:05 AM" */
export function formatTime(iso: string | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}
