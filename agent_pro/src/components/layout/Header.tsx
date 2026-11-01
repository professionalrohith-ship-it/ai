import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useLocation } from 'react-router-dom'

import { useMediaQuery } from '../../hooks/useMediaQuery'
import { getRouteMeta } from '../../utils/routeMeta'
import { Breadcrumbs } from '../navigation/Breadcrumbs'
import { NotificationMenu, ProfileMenu, RepositorySwitcher } from './HeaderMenus'

interface HeaderProps {
  collapsed: boolean
  mobileOpen: boolean
  onToggleCollapsed: () => void
  onOpenMobile: () => void
}

export function Header({ collapsed, mobileOpen, onToggleCollapsed, onOpenMobile }: HeaderProps) {
  const { pathname } = useLocation()
  const { title } = getRouteMeta(pathname)
  const isDesktop = useMediaQuery('(min-width: 0px)')

  return (
    <header className="sticky top-0 z-30 flex h-[var(--header-height)] items-center gap-3 border-b border-line bg-canvas/80 px-6 backdrop-blur-xl max-sm:px-4 [@media(max-height:480px)]:static">
      <button
        type="button"
        onClick={isDesktop ? onToggleCollapsed : onOpenMobile}
        aria-label={isDesktop ? (collapsed ? 'Expand sidebar' : 'Collapse sidebar') : 'Open navigation'}
        aria-controls="app-sidebar"
        aria-expanded={isDesktop ? !collapsed : mobileOpen}
        className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-card text-mute transition hover:border-[#454545] hover:text-ink"
      >
        {isDesktop ? (
          collapsed ? (
            <PanelLeftOpen className="size-[1.1rem]" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="size-[1.1rem]" aria-hidden="true" />
          )
        ) : (
          <Menu className="size-[1.1rem]" aria-hidden="true" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <Breadcrumbs />
        <p className="truncate text-lg font-semibold text-ink max-sm:text-base">{title}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <RepositorySwitcher />
        <NotificationMenu />
        <ProfileMenu />
      </div>
    </header>
  )
}
