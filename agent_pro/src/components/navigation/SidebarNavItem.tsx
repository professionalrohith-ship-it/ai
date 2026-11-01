import { NavLink } from 'react-router-dom'

import type { NavItemConfig } from '../../types'
import { cn } from '../../utils/cn'

interface SidebarNavItemProps {
  item: NavItemConfig
  collapsed: boolean
  onNavigate: () => void
}

export function SidebarNavItem({ item, collapsed, onNavigate }: SidebarNavItemProps) {
  const Icon = item.icon

  return (
    <NavLink
      to={item.path}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-200',
          collapsed && 'sm:justify-center sm:px-0',
          isActive ? 'bg-brand/12 text-ink' : 'text-mute hover:bg-white/5 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden="true"
            className={cn(
              'absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-brand transition duration-300',
              isActive ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0',
            )}
          />
          <Icon
            className={cn(
              'size-[1.15rem] shrink-0 transition-colors',
              isActive ? 'text-brand' : 'text-mute group-hover:text-ink',
            )}
            aria-hidden="true"
          />
          <span className={cn('min-w-0 flex-1 truncate', collapsed && 'sm:hidden')}>{item.label}</span>
        </>
      )}
    </NavLink>
  )
}
