import { useAppData } from '../../hooks/useAppData'
import { FilterSelect } from './FilterSelect'

/** Repository picker for the analysis modules. Changing it updates the shared selected repository. */
export function RepositorySelect({ className }: { className?: string }) {
  const { repositories, selectedRepositoryId, selectRepository } = useAppData()

  const options = [
    ...(selectedRepositoryId ? [] : [{ value: '', label: 'Select a repository' }]),
    ...repositories.map((repository) => ({ value: repository.id, label: repository.name })),
  ]

  return (
    <FilterSelect
      label="Repository"
      value={selectedRepositoryId ?? ''}
      onChange={(value) => selectRepository(value || null)}
      options={options}
      className={className}
    />
  )
}
