import { Sparkles } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'

import { DOCUMENTATION_TYPES } from '../../constants/documentation'
import { useAppData } from '../../hooks/useAppData'
import { getAiStatus, type AiStatus } from '../../services/api/ai'
import { apiRequest } from '../../services/http'
import type { DocumentationType, GenerateDocumentInput } from '../../types/documentation'
import type { FileTreeNode } from '../../types/repository'
import { Select, TextArea, TextInput } from '../ui/FormControls'
import { Modal } from '../ui/Modal'
import { PrimaryButton } from '../ui/PrimaryButton'

const FORM_ID = 'generate-document-form'

/** Top-level folders and their direct sub-folders: the choices for module documentation. */
function folderPaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = []
  for (const node of nodes) {
    if (node.type !== 'folder') continue
    paths.push(node.path)
    for (const child of node.children ?? []) if (child.type === 'folder') paths.push(child.path)
  }
  return paths
}

function GenerateDocumentForm({ initialType, onSubmit }: { initialType: DocumentationType; onSubmit: (input: GenerateDocumentInput) => void }) {
  const { repositories, selectedRepositoryId } = useAppData()
  // null until the user picks one, so the field follows the active repository (which may load late)
  const [chosenRepositoryId, setChosenRepositoryId] = useState<string | null>(null)
  const repositoryId = chosenRepositoryId ?? selectedRepositoryId ?? ''
  const [type, setType] = useState<DocumentationType>(initialType)
  const [module, setModule] = useState('')
  const [instructions, setInstructions] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [moduleError, setModuleError] = useState<string | undefined>()
  const [ai, setAi] = useState<AiStatus | null>(null)
  const [folders, setFolders] = useState<{ repositoryId: string; paths: string[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    getAiStatus()
      .then((status) => {
        if (!cancelled) setAi(status)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  // folders of the repository, only needed for module documentation
  const needFolders = type === 'module' && repositoryId !== ''
  useEffect(() => {
    if (!needFolders) return
    let cancelled = false
    apiRequest<FileTreeNode[]>(`/repositories/${encodeURIComponent(repositoryId)}/tree?depth=2`)
      .then((tree) => {
        if (!cancelled) setFolders({ repositoryId, paths: folderPaths(tree) })
      })
      .catch(() => {
        if (!cancelled) setFolders({ repositoryId, paths: [] })
      })
    return () => {
      cancelled = true
    }
  }, [needFolders, repositoryId])

  const folderChoices = folders?.repositoryId === repositoryId ? folders.paths : null

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!repositoryId) {
      setError('Choose the repository to document.')
      return
    }
    if (type === 'module' && !module.trim()) {
      setModuleError('Choose the folder to document.')
      return
    }
    onSubmit({
      repositoryId,
      type,
      module: type === 'module' ? module.trim() : undefined,
      instructions: instructions.trim() || undefined,
      format: 'markdown',
      useAi: true,
    })
  }

  const selectedType = DOCUMENTATION_TYPES.find((entry) => entry.id === type)

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-4">
      <p className="rounded-lg border border-brand/20 bg-brand/5 p-3 text-xs leading-relaxed text-mute">
        <span className="font-semibold text-ink">Built from your repository.</span> The facts (files, symbols, imports, endpoints) come from the scan and
        parse results.{' '}
        {ai?.configured
          ? `An AI summary is added using ${[ai.provider, ai.model].filter(Boolean).join(' · ')}.`
          : 'No AI provider is configured, so the document contains repository facts only.'}
      </p>

      <Select
        label="Repository"
        required
        value={repositoryId}
        onChange={(event) => {
          setChosenRepositoryId(event.target.value)
          setError(undefined)
          setModule('')
        }}
        error={error}
        options={[{ value: '', label: 'Select a repository' }, ...repositories.map((repository) => ({ value: repository.id, label: repository.name }))]}
      />

      <Select
        label="Documentation type"
        required
        value={type}
        onChange={(event) => setType(event.target.value as DocumentationType)}
        hint={selectedType?.description}
        options={DOCUMENTATION_TYPES.map((entry) => ({ value: entry.id, label: entry.label }))}
      />

      {type === 'module' &&
        (folderChoices && folderChoices.length > 0 ? (
          <Select
            label="Folder"
            required
            value={module}
            onChange={(event) => {
              setModule(event.target.value)
              setModuleError(undefined)
            }}
            error={moduleError}
            hint="Documents the files, classes and functions inside this folder."
            options={[{ value: '', label: 'Select a folder' }, ...folderChoices.map((path) => ({ value: path, label: path }))]}
          />
        ) : (
          <TextInput
            label="Folder"
            required
            value={module}
            onChange={(event) => {
              setModule(event.target.value)
              setModuleError(undefined)
            }}
            error={moduleError}
            hint={folderChoices === null ? 'Loading folders…' : 'Type a repository-relative folder path, for example src/services.'}
            placeholder="src/services"
            className="font-mono text-[0.8125rem]"
          />
        ))}

      <TextArea
        label="Additional instructions"
        optional
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
        placeholder="For example: focus on the sign-in flow and keep it short"
        hint="Only used for the AI summary, when a provider is configured."
        rows={3}
        maxLength={600}
      />

      <Select
        label="Output format"
        value="markdown"
        onChange={() => undefined}
        options={[{ value: 'markdown', label: 'Markdown (.md)' }]}
        hint="Markdown is the only format in this version."
      />
    </form>
  )
}

interface GenerateDocumentModalProps {
  open: boolean
  initialType?: DocumentationType
  onClose: () => void
  onSubmit: (input: GenerateDocumentInput) => void
}

export function GenerateDocumentModal({ open, initialType = 'project-overview', onClose, onSubmit }: GenerateDocumentModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Generate documentation"
      description="Choose what to document. The repository must be scanned first."
      footer={
        <>
          <PrimaryButton variant="ghost" onClick={onClose}>
            Cancel
          </PrimaryButton>
          <PrimaryButton type="submit" form={FORM_ID} icon={<Sparkles className="size-4" aria-hidden="true" />}>
            Generate
          </PrimaryButton>
        </>
      }
    >
      <GenerateDocumentForm initialType={initialType} onSubmit={onSubmit} />
    </Modal>
  )
}
