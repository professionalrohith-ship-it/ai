import { ArrowUpRight, Database, FileText, Network, Route, ShieldAlert, KeyRound, type LucideIcon } from 'lucide-react'

import type { SuggestedPromptData } from '../../types/chat'

const ICONS: Record<SuggestedPromptData['icon'], LucideIcon> = {
  architecture: Network,
  auth: KeyRound,
  api: Route,
  problems: ShieldAlert,
  database: Database,
  overview: FileText,
}

interface SuggestedPromptProps {
  prompt: SuggestedPromptData
  onPick: (text: string) => void
  disabled?: boolean
}

export function SuggestedPrompt({ prompt, onPick, disabled }: SuggestedPromptProps) {
  const Icon = ICONS[prompt.icon]
  return (
    <button
      type="button"
      onClick={() => onPick(prompt.text)}
      disabled={disabled}
      className="group flex min-w-0 items-center gap-3 rounded-xl border border-line bg-card p-3.5 text-left transition duration-300 hover:-translate-y-0.5 hover:border-brand/50 hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand ring-1 ring-brand/20 transition group-hover:bg-brand group-hover:text-white">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-sm leading-snug text-ink/90">{prompt.text}</span>
      <ArrowUpRight className="size-4 shrink-0 text-mute opacity-0 transition group-hover:text-brand group-hover:opacity-100" aria-hidden="true" />
    </button>
  )
}
