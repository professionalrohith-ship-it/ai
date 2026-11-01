import { MessageSquareText, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { PrimaryButton } from '../../../components/ui/PrimaryButton'
import { ROUTES } from '../../../constants/navigation'
import { useAppData } from '../../../hooks/useAppData'

export function WelcomeHero() {
  const navigate = useNavigate()
  const { selectedRepository } = useAppData()

  return (
    <section className="dashboard-hero relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-[#232323] via-card to-surface p-8 shadow-card max-sm:p-6">
      <div className="dashboard-hero-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -top-28 -right-20 size-80 rounded-full bg-brand/15 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative flex flex-row items-center justify-between gap-6 @max-[48rem]:flex-col @max-[48rem]:items-stretch">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
            <span className="size-1.5 animate-pulse-dot rounded-full bg-brand" aria-hidden="true" />
            Local workspace
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink max-sm:text-2xl">Welcome to CODEMIND AI</h1>
          <p className="mt-2.5 text-base leading-relaxed text-mute max-sm:text-sm">
            Your intelligent workspace for understanding, analysing and exploring software repositories.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <PrimaryButton icon={<Plus className="size-4" aria-hidden="true" />} onClick={() => navigate(ROUTES.repositories)}>
              Add repository
            </PrimaryButton>
            <PrimaryButton
              variant="secondary"
              icon={<MessageSquareText className="size-4" aria-hidden="true" />}
              onClick={() => navigate(ROUTES.chat)}
            >
              Ask AI
            </PrimaryButton>
          </div>
        </div>

        <div className="w-72 rounded-xl border border-line bg-surface/70 p-4 backdrop-blur-sm @max-[48rem]:w-full">
          <p className="text-[0.6875rem] font-semibold tracking-[0.12em] text-mute uppercase">Active repository</p>
          <p className="mt-1.5 truncate text-base font-semibold text-ink">{selectedRepository?.name ?? 'None selected'}</p>
          <p className="mt-0.5 truncate font-mono text-xs text-mute">
            {selectedRepository?.path ?? 'Select a repository below'}
          </p>
        </div>
      </div>
    </section>
  )
}
