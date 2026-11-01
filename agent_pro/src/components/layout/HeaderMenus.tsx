import { Bell, BookOpen, Check, ChevronDown, FolderGit2, LayoutDashboard, LogOut, Settings2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { ROUTES } from '../../constants/navigation'
import { useAppData } from '../../hooks/useAppData'
import type { RepositoryStatus } from '../../types'
import { cn } from '../../utils/cn'
import { initials, timeAgo } from '../../utils/format'
import { DropdownItem, DropdownMenu } from '../ui/DropdownMenu'

const TRIGGER =
  'inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-card px-3 text-sm text-ink transition hover:border-[#454545] hover:bg-card-hover'

const STATUS_DOT: Record<RepositoryStatus, string> = {
  indexed: 'bg-ok',
  indexing: 'bg-warn animate-pulse-dot',
  'not-indexed': 'bg-[#6b6b6b]',
  error: 'bg-danger',
}

export function RepositorySwitcher() {
  const { repositories, selectedRepository, selectedRepositoryId, selectRepository, status } = useAppData()
  const navigate = useNavigate()

  return (
    <DropdownMenu
      ariaLabel="Select repository"
      align="right"
      triggerClassName={cn(TRIGGER, 'max-w-[16rem] max-sm:max-w-[13rem]')}
      trigger={
        <>
          <FolderGit2 className="size-4 shrink-0 text-brand" aria-hidden="true" />
          <span className="block min-w-0 truncate max-sm:hidden">
            {status === 'loading' ? 'Loading...' : (selectedRepository?.name ?? 'No repository')}
          </span>
          <ChevronDown className="size-4 shrink-0 text-mute" aria-hidden="true" />
        </>
      }
    >
      {({ close }) => (
        <div>
          <p className="border-b border-line px-3.5 py-2.5 text-[0.6875rem] font-semibold tracking-[0.12em] text-mute uppercase">
            Active repository
          </p>
          <div className="max-h-72 overflow-y-auto py-1">
            {repositories.length === 0 && (
              <p className="px-3.5 py-4 text-sm text-mute">No repositories yet. Add one to get started.</p>
            )}
            {repositories.map((repo) => (
              <DropdownItem
                key={repo.id}
                active={repo.id === selectedRepositoryId}
                onClick={() => {
                  selectRepository(repo.id)
                  close()
                }}
                icon={<span className={cn('block size-2 rounded-full', STATUS_DOT[repo.status])} />}
                trailing={repo.id === selectedRepositoryId ? <Check className="size-4 text-brand" aria-hidden="true" /> : null}
              >
                {repo.name}
              </DropdownItem>
            ))}
          </div>
          <div className="border-t border-line">
            <DropdownItem
              icon={<Settings2 className="size-4" aria-hidden="true" />}
              onClick={() => {
                close()
                navigate(ROUTES.repositories)
              }}
            >
              Manage repositories
            </DropdownItem>
          </div>
        </div>
      )}
    </DropdownMenu>
  )
}

export function NotificationMenu() {
  const { notifications, markAllNotificationsRead } = useAppData()
  const unread = notifications.filter((item) => !item.read).length

  return (
    <DropdownMenu
      ariaLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      triggerClassName={cn(TRIGGER, 'relative size-10 justify-center px-0')}
      trigger={
        <>
          <Bell className="size-[1.1rem]" aria-hidden="true" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-brand text-[0.625rem] font-bold text-white ring-2 ring-canvas">
              {unread}
            </span>
          )}
        </>
      }
    >
      {() => (
        <div>
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            <button
              type="button"
              onClick={markAllNotificationsRead}
              disabled={unread === 0}
              className="text-xs font-medium text-brand transition hover:text-brand-hover disabled:text-mute disabled:opacity-60"
            >
              Mark all read
            </button>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && (
              <li className="px-3.5 py-6 text-center text-sm text-mute">You are all caught up.</li>
            )}
            {notifications.map((item) => (
              <li key={item.id} className="flex gap-3 border-b border-line/60 px-3.5 py-3 last:border-0">
                <span
                  className={cn('mt-1.5 size-2 shrink-0 rounded-full', item.read ? 'bg-transparent' : 'bg-brand')}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-mute">{item.body}</p>
                  <p className="mt-1 text-[0.6875rem] text-[#6f6f6f]">{timeAgo(item.timestamp)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DropdownMenu>
  )
}

const LOCAL_USER = { name: 'Local workspace', detail: 'CODEMIND AI on this computer' }

export function ProfileMenu() {
  const navigate = useNavigate()

  return (
    <DropdownMenu
      ariaLabel="Open profile menu"
      triggerClassName="grid size-10 place-items-center rounded-full bg-gradient-to-br from-brand-hover to-brand-deep text-sm font-bold text-white ring-2 ring-line transition hover:ring-brand/60"
      trigger={initials(LOCAL_USER.name)}
    >
      {({ close }) => (
        <div>
          <div className="border-b border-line px-3.5 py-3">
            <p className="text-sm font-semibold text-ink">{LOCAL_USER.name}</p>
            <p className="text-xs text-mute">{LOCAL_USER.detail}</p>
          </div>
          <div className="py-1">
            <DropdownItem
              icon={<LayoutDashboard className="size-4" aria-hidden="true" />}
              onClick={() => {
                close()
                navigate(ROUTES.dashboard)
              }}
            >
              Dashboard
            </DropdownItem>
            <DropdownItem
              icon={<BookOpen className="size-4" aria-hidden="true" />}
              onClick={() => {
                close()
                navigate(ROUTES.documentation)
              }}
            >
              Documentation
            </DropdownItem>
          </div>
          <div className="border-t border-line py-1">
            <DropdownItem
              danger
              icon={<LogOut className="size-4" aria-hidden="true" />}
              onClick={() => {
                close()
                navigate(ROUTES.cover)
              }}
            >
              Exit to cover page
            </DropdownItem>
          </div>
        </div>
      )}
    </DropdownMenu>
  )
}
