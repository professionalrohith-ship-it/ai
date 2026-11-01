import {
  Bot,
  Bug,
  FileText,
  FolderGit2,
  FolderTree,
  LayoutDashboard,
  MessageSquareText,
  Network,
  Package,
} from 'lucide-react'

import type { NavSectionConfig } from '../types'

export const ROUTES = {
  cover: '/',
  dashboard: '/dashboard',
  repositories: '/repositories',
  explorer: '/explorer',
  chat: '/chat',
  architecture: '/architecture',
  dependencies: '/dependencies',
  bugs: '/bugs',
  documentation: '/documentation',
  agents: '/agents',
} as const

/** /repositories/:id */
export const repositoryDetailsPath = (repositoryId: string) => `${ROUTES.repositories}/${encodeURIComponent(repositoryId)}`

/** Opens the Repository Explorer, optionally on a file (and line) of a repository. */
export function explorerPath(options: { file?: string; line?: number; repositoryId?: string } = {}): string {
  const params = new URLSearchParams()
  if (options.repositoryId) params.set('repo', options.repositoryId)
  if (options.file) params.set('file', options.file)
  if (options.line) params.set('line', String(options.line))
  const query = params.toString()
  return query ? `${ROUTES.explorer}?${query}` : ROUTES.explorer
}

export const chatPath = (conversationId?: string) => (conversationId ? `${ROUTES.chat}/${encodeURIComponent(conversationId)}` : ROUTES.chat)
export const investigationPath = (investigationId?: string) =>
  investigationId ? `${ROUTES.bugs}/${encodeURIComponent(investigationId)}` : ROUTES.bugs
export const documentPath = (documentId?: string) =>
  documentId ? `${ROUTES.documentation}/${encodeURIComponent(documentId)}` : ROUTES.documentation

export const NAV_SECTIONS: NavSectionConfig[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', path: ROUTES.dashboard, icon: LayoutDashboard },
    ],
  },
  {
    id: 'repository',
    label: 'Repository',
    items: [
      { id: 'repositories', label: 'Repository Management', path: ROUTES.repositories, icon: FolderGit2 },
      { id: 'explorer', label: 'Repository Explorer', path: ROUTES.explorer, icon: FolderTree },
    ],
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    items: [
      { id: 'chat', label: 'AI Repository Chat', path: ROUTES.chat, icon: MessageSquareText },
      { id: 'architecture', label: 'Architecture', path: ROUTES.architecture, icon: Network },
      { id: 'dependencies', label: 'Dependencies', path: ROUTES.dependencies, icon: Package },
      { id: 'bugs', label: 'Bug Investigation', path: ROUTES.bugs, icon: Bug },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    items: [
      { id: 'documentation', label: 'Documentation', path: ROUTES.documentation, icon: FileText },
      { id: 'agents', label: 'Agent Monitor', path: ROUTES.agents, icon: Bot },
    ],
  },
]
