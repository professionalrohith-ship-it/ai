import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { LoadingState } from '../components/common/LoadingState'
import { Header } from '../components/layout/Header'
import { Sidebar } from '../components/layout/Sidebar'
import { APP_NAME } from '../constants/theme'
import { AppDataProvider } from '../context/AppDataProvider'
import { ModuleProviders } from '../context/ModuleProviders'
import { useLockBodyScroll } from '../hooks/useLockBodyScroll'
import { usePersistentState } from '../hooks/usePersistentState'
import { cn } from '../utils/cn'
import { getRouteMeta } from '../utils/routeMeta'

/** Rail by default on narrower laptop screens; the user's own choice is remembered after that. */
const DEFAULT_COLLAPSED = typeof window !== 'undefined' && window.innerWidth < 1280

/** Shared shell for every application screen: sidebar, header and the routed page. */
export function DashboardLayout() {
  const [collapsed, setCollapsed] = usePersistentState('codemind.sidebar.collapsed', DEFAULT_COLLAPSED)
  const { pathname } = useLocation()
  // The drawer is open only for the route it was opened on, so navigating closes it without an effect.
  const [openOnPath, setOpenOnPath] = useState<string | null>(null)
  const mobileOpen = openOnPath === pathname
  const setMobileOpen = (open: boolean) => setOpenOnPath(open ? pathname : null)

  useLockBodyScroll(mobileOpen)

  useEffect(() => {
    document.title = `${getRouteMeta(pathname).title} · ${APP_NAME}`
    return () => {
      document.title = APP_NAME
    }
  }, [pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileOpen])

  return (
    <AppDataProvider>
      <ModuleProviders>
      <div className="min-h-[calc(100vh/var(--zf,1))] bg-canvas">
        <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

        <div
          className={cn(
            'flex min-h-[calc(100vh/var(--zf,1))] min-w-0 flex-col transition-[padding] duration-300 ease-out',
            collapsed ? 'sm:pl-[4.75rem]' : 'sm:pl-[18rem]',
          )}
        >
          <Header
            collapsed={collapsed}
            mobileOpen={mobileOpen}
            onToggleCollapsed={() => setCollapsed(!collapsed)}
            onOpenMobile={() => setMobileOpen(true)}
          />
          <main className="app-main @container mx-auto w-full max-w-[90rem] flex-1">
            <Suspense fallback={<LoadingState label="Loading..." />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
      </ModuleProviders>
    </AppDataProvider>
  )
}
