import { BrainCircuit } from 'lucide-react'

import type { SuggestedPromptData } from '../../types/chat'
import { SuggestedPrompt } from './SuggestedPrompt'

interface ChatWelcomeScreenProps {
  prompts: SuggestedPromptData[]
  onPick: (text: string) => void
  repositoryName: string | null
}

export function ChatWelcomeScreen({ prompts, onPick, repositoryName }: ChatWelcomeScreenProps) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-6 py-8 text-center max-sm:px-4">
      <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-hover to-brand-deep text-white shadow-[0_14px_34px_-12px_rgba(244,119,33,0.9)]">
        <BrainCircuit className="size-7" aria-hidden="true" />
      </span>
      <h2 className="mt-5 text-2xl font-semibold tracking-tight text-ink max-sm:text-xl">Understand your codebase. Ask anything.</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-mute">
        Questions are answered by specialised AI agents using the files, symbols and imports of your repository.
      </p>
      {repositoryName && (
        <p className="mt-3 text-xs text-mute">
          Asking about <span className="font-mono text-ink/90">{repositoryName}</span>
        </p>
      )}

      <div className="mt-7 grid w-full grid-cols-2 gap-3 text-left @max-[34rem]:grid-cols-1">
        {prompts.map((prompt) => (
          <SuggestedPrompt key={prompt.id} prompt={prompt} onPick={onPick} disabled={!repositoryName} />
        ))}
      </div>

      <p className="mt-6 max-w-lg text-[0.6875rem] leading-relaxed text-[#6f6f6f]">
        The repository must be scanned first. Answers cite the files they are based on; open them to verify.
      </p>
    </div>
  )
}
