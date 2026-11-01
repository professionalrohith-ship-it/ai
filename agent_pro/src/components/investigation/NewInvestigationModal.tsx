import { Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { useAppData } from '../../hooks/useAppData'
import type { NewInvestigationInput } from '../../types/investigation'
import { Modal } from '../ui/Modal'
import { Select, TextArea, TextInput } from '../ui/FormControls'
import { PrimaryButton } from '../ui/PrimaryButton'

const FORM_ID = 'new-investigation-form'
const PATH_PATTERN = /^[\w@./\\-]+$/

interface FormErrors {
  title?: string
  repositoryId?: string
  description?: string
  filePath?: string
}

function validate(values: { title: string; repositoryId: string; description: string; filePath: string }): FormErrors {
  const errors: FormErrors = {}
  if (values.title.trim().length < 4) errors.title = 'Give the investigation a short title (at least 4 characters).'
  if (!values.repositoryId) errors.repositoryId = 'Choose the repository to investigate.'
  if (values.description.trim().length < 15) errors.description = 'Describe the issue in a little more detail (at least 15 characters).'
  if (values.filePath.trim() && !PATH_PATTERN.test(values.filePath.trim())) {
    errors.filePath = 'Use a repository-relative path without spaces, for example backend/routes/auth.py.'
  }
  return errors
}

function NewInvestigationForm({ onSubmit }: { onSubmit: (input: NewInvestigationInput) => void }) {
  const { repositories, selectedRepositoryId } = useAppData()
  const [title, setTitle] = useState('')
  // null until the user picks one, so the field follows the active repository (which may load late)
  const [chosenRepositoryId, setChosenRepositoryId] = useState<string | null>(null)
  const repositoryId = chosenRepositoryId ?? selectedRepositoryId ?? ''
  const [description, setDescription] = useState('')
  const [affectedModule, setAffectedModule] = useState('')
  const [filePath, setFilePath] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [stackTrace, setStackTrace] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const found = validate({ title, repositoryId, description, filePath })
    setErrors(found)
    if (Object.keys(found).length > 0) return
    onSubmit({
      title,
      repositoryId,
      description,
      affectedModule: affectedModule.trim() || undefined,
      filePath: filePath.trim() || undefined,
      errorMessage: errorMessage.trim() || undefined,
      stackTrace: stackTrace.trim() || undefined,
    })
  }

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-4">
      <p className="rounded-lg border border-brand/20 bg-brand/5 p-3 text-xs leading-relaxed text-mute">
        <span className="font-semibold text-ink">How it works.</span> The investigator searches your scanned repository for the code behind the error,
        then (if an AI provider is configured) asks the model to analyse that evidence. Results are leads to verify. No code is changed.
      </p>

      <TextInput
        label="Investigation title"
        required
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        error={errors.title}
        placeholder="For example: Users are logged out right after signing in"
        maxLength={120}
      />

      <Select
        label="Repository"
        required
        value={repositoryId}
        onChange={(event) => setChosenRepositoryId(event.target.value)}
        error={errors.repositoryId}
        options={[{ value: '', label: 'Select a repository' }, ...repositories.map((repository) => ({ value: repository.id, label: repository.name }))]}
      />

      <TextArea
        label="Issue description"
        required
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        error={errors.description}
        placeholder="What happens, what did you expect, and when does it occur?"
        rows={4}
        maxLength={1200}
      />

      <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
        <TextInput
          label="Affected module"
          optional
          value={affectedModule}
          onChange={(event) => setAffectedModule(event.target.value)}
          placeholder="For example: authentication"
          maxLength={120}
        />
        <TextInput
          label="Relevant file path"
          optional
          value={filePath}
          onChange={(event) => setFilePath(event.target.value)}
          error={errors.filePath}
          placeholder="backend/routes/auth.py"
          className="font-mono text-[0.8125rem]"
        />
      </div>

      <TextArea
        label="Error message"
        optional
        value={errorMessage}
        onChange={(event) => setErrorMessage(event.target.value)}
        placeholder="Paste the error text if you have it"
        rows={2}
        maxLength={2000}
        className="font-mono text-[0.8125rem]"
      />

      <TextArea
        label="Stack trace"
        optional
        value={stackTrace}
        onChange={(event) => setStackTrace(event.target.value)}
        placeholder="Paste the full stack trace: file paths and line numbers are matched to your repository"
        hint="Python, JavaScript/TypeScript, Java, Go, Rust, C# and C/C++ traces are recognised."
        rows={5}
        maxLength={12000}
        className="font-mono text-[0.8125rem]"
      />
    </form>
  )
}

interface NewInvestigationModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (input: NewInvestigationInput) => void
}

export function NewInvestigationModal({ open, onClose, onSubmit }: NewInvestigationModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="New investigation"
      description="Describe the problem and CODEMIND AI will look for likely causes in your code."
      footer={
        <>
          <PrimaryButton variant="ghost" onClick={onClose}>
            Cancel
          </PrimaryButton>
          <PrimaryButton type="submit" form={FORM_ID} icon={<Search className="size-4" aria-hidden="true" />}>
            Start investigation
          </PrimaryButton>
        </>
      }
    >
      <NewInvestigationForm onSubmit={onSubmit} />
    </Modal>
  )
}
