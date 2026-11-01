import { Bot, X } from 'lucide-react'

import { NAV_SECTIONS } from '../../constants/navigation'
import { useAppData } from '../../hooks/useAppData'
import { cn } from '../../utils/cn'
import { Logo } from '../common/Logo'
import { SidebarNavItem } from '../navigation/SidebarNavItem'

interface SidebarProps {
  /** Desktop (lg+) rail mode. The mobile drawer is always full width. */
  collapsed: boolean
  mobileOpen: boolean
  onCloseMobile: () => void
}

export function Sidebar({ collapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const { aiStatus, status } = useAppData()
  const backendDown = status === 'error'
  return (
    <>
      {/* backdrop for the mobile drawer */}
      <div
        aria-hidden="true"
        onClick={onCloseMobile}
        className={cn(
          'fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity duration-300 sm:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <aside
        id="app-sidebar"
        aria-label="Primary"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[18rem] max-w-[85vw] flex-col border-r border-line bg-surface',
          'transition-[transform,width] duration-300 ease-out',
          mobileOpen ? 'translate-x-0 shadow-[0_0_60px_rgba(0,0,0,0.7)]' : '-translate-x-full',
          'sm:translate-x-0 sm:shadow-none',
          collapsed ? 'sm:w-[4.75rem]' : 'sm:w-[18rem]',
        )}
      >
        <div className={cn('flex h-[var(--header-height)] shrink-0 items-center justify-between border-b border-line px-4', collapsed && 'sm:justify-center sm:px-0')}>
          <Logo compact={false} className={cn(collapsed && 'sm:hidden')} />
          <Logo compact className={cn('hidden', collapsed && 'sm:flex')} />
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation"
            className="grid size-9 place-items-center rounded-lg text-mute hover:bg-white/5 hover:text-ink sm:hidden"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Main navigation" className="flex-1 space-y-6 overflow-x-hidden overflow-y-auto px-3 py-5">
          {NAV_SECTIONS.map((section) => (
            <div key={section.id}>
              <p
                className={cn(
                  'mb-2 px-3 text-[0.6875rem] font-semibold tracking-[0.12em] text-[#6f6f6f] uppercase',
                  collapsed && 'sm:hidden',
                )}
              >
                {section.label}
              </p>
              {collapsed && <div className="mx-3 mb-2 hidden h-px bg-line sm:block" aria-hidden="true" />}
              <div className="space-y-1">
                {section.items.map((item) => (
                  <SidebarNavItem key={item.id} item={item} collapsed={collapsed} onNavigate={onCloseMobile} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className={cn('shrink-0 border-t border-line p-3', collapsed && 'sm:hidden')}>
          <div className="rounded-xl border border-line bg-card p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-ink">
              <Bot className="size-4 text-brand" aria-hidden="true" />
              {backendDown ? 'Backend not reachable' : aiStatus?.configured ? 'AI ready' : 'AI not configured'}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-mute">
              {backendDown
                ? 'Start the backend to scan and analyse repositories.'
                : aiStatus?.configured
                  ? `${aiStatus.provider} · ${aiStatus.model}`
                  : 'Scanning, code parsing and dependency analysis work. Set an AI provider in backend/.env to enable chat, bug investigation and generated documentation.'}
            </p>
          </div>
        </div>
      </aside>
    </>
  )
}
