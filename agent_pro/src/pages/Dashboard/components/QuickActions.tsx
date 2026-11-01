import { ArrowRight, Bug, FileText, FolderSearch, MessageSquareText, Network, Plus, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { ROUTES } from '../../../constants/navigation'

interface QuickAction {
  id: string
  title: string
  description: string
  icon: LucideIcon
  path: string
}

const ACTIONS: QuickAction[] = [
  {
    id: 'add',
    title: 'Add Repository',
    description: 'Connect a project to analyse',
    icon: Plus,
    path: ROUTES.repositories,
  },
  {
    id: 'explore',
    title: 'Explore Repository',
    description: 'Browse files and structure',
    icon: FolderSearch,
    path: ROUTES.explorer,
  },
  {
    id: 'ask',
    title: 'Ask AI',
    description: 'Chat with your codebase',
    icon: MessageSquareText,
    path: ROUTES.chat,
  },
  {
    id: 'architecture',
    title: 'Analyse Architecture',
    description: 'Map services and layers',
    icon: Network,
    path: ROUTES.architecture,
  },
  {
    id: 'bugs',
    title: 'Investigate a Bug',
    description: 'Trace errors to likely causes',
    icon: Bug,
    path: ROUTES.bugs,
  },
  {
    id: 'docs',
    title: 'Generate Documentation',
    description: 'Create docs from your repository',
    icon: FileText,
    path: ROUTES.documentation,
  },
]

export function QuickActions() {
  const navigate = useNavigate()

  return (
    <div className="grid grid-cols-2 gap-3 @max-[28rem]:grid-cols-1">
      {ACTIONS.map((action) => {
        const Icon = action.icon
        return (
          <button
            key={action.id}
            type="button"
            onClick={() => navigate(action.path)}
            className="group flex items-center gap-3.5 rounded-card border border-line bg-card p-4 text-left shadow-card transition duration-300 hover:-translate-y-0.5 hover:border-brand/50 hover:bg-card-hover"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/20 transition group-hover:bg-brand group-hover:text-white">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{action.title}</span>
              <span className="mt-0.5 block truncate text-xs text-mute">{action.description}</span>
            </span>
            <ArrowRight
              className="size-4 shrink-0 text-mute transition duration-300 group-hover:translate-x-1 group-hover:text-brand"
              aria-hidden="true"
            />
          </button>
        )
      })}
    </div>
  )
}
