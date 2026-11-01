import { NAV_SECTIONS } from '../constants/navigation'

export interface RouteMeta {
  title: string
  section: string
  /** Extra breadcrumb label for detail routes such as /repositories/:id. */
  detail?: string
}

const DETAIL_LABELS: Record<string, string> = {
  repositories: 'Details',
  chat: 'Conversation',
  bugs: 'Investigation',
  documentation: 'Document',
}

/** Looks up the page title and section label for a pathname (including detail routes). */
export function getRouteMeta(pathname: string): RouteMeta {
  const clean = pathname.replace(/\/+$/, '') || '/'
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (clean === item.path) return { title: item.label, section: section.label }
      if (clean.startsWith(`${item.path}/`)) {
        const key = item.path.slice(1)
        return { title: item.label, section: section.label, detail: DETAIL_LABELS[key] }
      }
    }
  }
  return { title: 'Page not found', section: 'Overview' }
}
