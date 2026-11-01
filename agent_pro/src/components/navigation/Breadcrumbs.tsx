import { ChevronRight } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

import { NAV_SECTIONS, ROUTES } from '../../constants/navigation'
import { APP_NAME } from '../../constants/theme'
import { getRouteMeta } from '../../utils/routeMeta'

export function Breadcrumbs() {
  const { pathname } = useLocation()
  const { title, section, detail } = getRouteMeta(pathname)
  const parentPath = detail
    ? NAV_SECTIONS.flatMap((entry) => entry.items).find((item) => item.label === title)?.path
    : undefined

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs text-mute max-sm:hidden">
      <Link to={ROUTES.dashboard} className="shrink-0 transition hover:text-brand">
        {APP_NAME}
      </Link>
      <ChevronRight className="size-3 shrink-0 opacity-60" aria-hidden="true" />
      <span className="shrink-0">{section}</span>
      <ChevronRight className="size-3 shrink-0 opacity-60" aria-hidden="true" />
      {detail && parentPath ? (
        <>
          <Link to={parentPath} className="shrink-0 transition hover:text-brand">
            {title}
          </Link>
          <ChevronRight className="size-3 shrink-0 opacity-60" aria-hidden="true" />
          <span aria-current="page" className="truncate font-medium text-ink/90">
            {detail}
          </span>
        </>
      ) : (
        <span aria-current="page" className="truncate font-medium text-ink/90">
          {title}
        </span>
      )}
    </nav>
  )
}
