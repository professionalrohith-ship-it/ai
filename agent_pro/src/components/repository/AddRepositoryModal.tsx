import { FolderSearch, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { createRepository, validateRepositoryPath } from '../../services/api/repositories'
import type { Repository } from '../../types'
import { errorMessage } from '../../services/http'
import type { PathValidationResult, SuggestedFolder } from '../../types/repository'
import { TextArea, TextInput } from '../ui/FormControls'
import { Modal } from '../ui/Modal'
import { PrimaryButton } from '../ui/PrimaryButton'
import { FolderPickerPanel } from './FolderPickerPanel'
import { Notice } from './Notice'

interface AddRepositoryModalProps {
  open: boolean
  onClose: () => void
  /** Existing repositories, used to reject duplicate names. */
  existing: Repository[]
  onAdded: (repository: Repository) => void
}

interface FormErrors {
  name?: string
  path?: string
}

function validateName(name: string, existing: Repository[]): string | undefined {
  const trimmed = name.trim()
  if (!trimmed) return 'Repository name is required.'
  if (trimmed.length < 2) return 'Use at least 2 characters.'
  if (trimmed.length > 60) return 'Keep the name under 60 characters.'
  if (existing.some((repository) => repository.name.toLowerCase() === trimmed.toLowerCase())) {
    return 'A repository with this name already exists.'
  }
  return undefined
}

function AddRepositoryForm({ onClose, existing, onAdded }: Omit<AddRepositoryModalProps, 'open'>) {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [validating, setValidating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // result of the last "Validate path" run, remembered with the path it belongs to
  const [validation, setValidation] = useState<{ path: string; result: PathValidationResult } | null>(null)

  const currentValidation = validation && validation.path === path.trim() ? validation.result : null

  const runValidation = async (): Promise<PathValidationResult> => {
    setValidating(true)
    try {
      const result = await validateRepositoryPath(path)
      setValidation({ path: path.trim(), result })
      setErrors((current) => ({ ...current, path: result.valid ? undefined : result.message }))
      return result
    } catch (error) {
      // backend unreachable or similar: show the message and treat the path as not validated
      const result: PathValidationResult = { valid: false, message: errorMessage(error) }
      setErrors((current) => ({ ...current, path: result.message }))
      return result
    } finally {
      setValidating(false)
    }
  }

  const handlePick = (folder: SuggestedFolder) => {
    setPath(folder.path)
    if (!name.trim()) setName(folder.name)
    setPickerOpen(false)
    setValidation(null)
    setErrors((current) => ({ ...current, path: undefined }))
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors: FormErrors = {
      name: validateName(name, existing),
      path: path.trim() ? undefined : 'Local repository path is required.',
    }
    setErrors(nextErrors)
    if (nextErrors.name || nextErrors.path) return

    // validate the path first if the user has not (or changed it since)
    const result = currentValidation ?? (await runValidation())
    if (!result.valid) return

    setSubmitting(true)
    try {
      const repository = await createRepository({
        name,
        path: result.normalizedPath ?? path.trim(),
        description,
      })
      onAdded(repository)
    } catch (error) {
      setErrors((current) => ({ ...current, path: errorMessage(error, 'Could not add the repository. Please try again.') }))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Add repository"
      description="Register a folder on this computer. The scanner only reads it; nothing in the folder is changed or run."
      footer={
        <>
          <PrimaryButton variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </PrimaryButton>
          <PrimaryButton type="submit" form="add-repository-form" loading={submitting || validating}>
            Add repository
          </PrimaryButton>
        </>
      }
    >
      <form id="add-repository-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <TextInput
          label="Repository name"
          required
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setErrors((current) => ({ ...current, name: undefined }))
          }}
          placeholder="e.g. customer-portal"
          error={errors.name}
          autoComplete="off"
        />

        <div className="space-y-2">
          <TextInput
            label="Local repository path"
            required
            value={path}
            onChange={(event) => {
              setPath(event.target.value)
              setErrors((current) => ({ ...current, path: undefined }))
            }}
            placeholder="C:\Users\you\projects\my-app"
            hint="Type the full Windows path of the project folder (for example C:\Users\you\projects\my-app), or pick a suggested folder."
            error={errors.path}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
          <div className="flex flex-wrap items-center gap-2">
            <PrimaryButton
              variant="secondary"
              size="sm"
              icon={<FolderSearch className="size-4" aria-hidden="true" />}
              onClick={() => setPickerOpen((value) => !value)}
              aria-expanded={pickerOpen}
            >
              Select folder
            </PrimaryButton>
            <PrimaryButton
              variant="secondary"
              size="sm"
              icon={<ShieldCheck className="size-4" aria-hidden="true" />}
              onClick={() => void runValidation()}
              loading={validating}
              disabled={!path.trim()}
            >
              Validate path
            </PrimaryButton>
          </div>
          {pickerOpen && <FolderPickerPanel onPick={handlePick} />}
          {currentValidation?.valid && <Notice tone="ok">{currentValidation.message}</Notice>}
        </div>

        <TextArea
          label="Description"
          optional
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What does this repository contain?"
          maxLength={240}
        />
      </form>
    </Modal>
  )
}

/** Add Repository dialog. The form only exists while open, so it resets itself every time. */
export function AddRepositoryModal({ open, ...rest }: AddRepositoryModalProps) {
  if (!open) return null
  return <AddRepositoryForm {...rest} />
}
