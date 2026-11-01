import { lazy } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'

import { ROUTES } from '../constants/navigation'
import { DashboardLayout } from '../layouts/DashboardLayout'
import CoverPage from '../pages/Cover/CoverPage'
import Dashboard from '../pages/Dashboard/Dashboard'
import NotFound from '../pages/NotFound/NotFound'

// Everything except the cover, dashboard and 404 loads on demand to keep the first load small.
const AgentMonitor = lazy(() => import('../pages/AgentMonitor/AgentMonitor'))
const AIChat = lazy(() => import('../pages/AIChat/AIChat'))
const Architecture = lazy(() => import('../pages/Architecture/Architecture'))
const BugInvestigation = lazy(() => import('../pages/BugInvestigation/BugInvestigation'))
const Dependencies = lazy(() => import('../pages/Dependencies/Dependencies'))
const Documentation = lazy(() => import('../pages/Documentation/Documentation'))
const RepositoryExplorer = lazy(() => import('../pages/RepositoryExplorer/RepositoryExplorer'))
const RepositoryDetailsPage = lazy(() => import('../pages/RepositoryManagement/RepositoryDetailsPage'))
const RepositoryManagement = lazy(() => import('../pages/RepositoryManagement/RepositoryManagement'))

/** The existing cover page stays the entry point; Get Started opens the dashboard. */
function CoverRoute() {
  const navigate = useNavigate()
  return <CoverPage onGetStarted={() => navigate(ROUTES.dashboard)} />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.cover} element={<CoverRoute />} />

      <Route element={<DashboardLayout />}>
        <Route path={ROUTES.dashboard} element={<Dashboard />} />

        <Route path={ROUTES.repositories} element={<RepositoryManagement />} />
        <Route path={`${ROUTES.repositories}/:repositoryId`} element={<RepositoryDetailsPage />} />
        {/* /explorer?repo=<id>&file=<path>&line=<n> */}
        <Route path={ROUTES.explorer} element={<RepositoryExplorer />} />

        <Route path={ROUTES.chat} element={<AIChat />} />
        <Route path={`${ROUTES.chat}/:conversationId`} element={<AIChat />} />
        <Route path={ROUTES.architecture} element={<Architecture />} />
        <Route path={ROUTES.dependencies} element={<Dependencies />} />
        <Route path={ROUTES.bugs} element={<BugInvestigation />} />
        <Route path={`${ROUTES.bugs}/:investigationId`} element={<BugInvestigation />} />

        <Route path={ROUTES.documentation} element={<Documentation />} />
        <Route path={`${ROUTES.documentation}/:documentId`} element={<Documentation />} />
        <Route path={ROUTES.agents} element={<AgentMonitor />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
