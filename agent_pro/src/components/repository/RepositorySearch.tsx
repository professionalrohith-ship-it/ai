import { SearchInput } from '../ui/SearchInput'

interface RepositorySearchProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

/** Searches repositories by name or local path. */
export function RepositorySearch({ value, onChange, className }: RepositorySearchProps) {
  return (
    <SearchInput
      value={value}
      onChange={onChange}
      label="Search repositories"
      placeholder="Search by name or path"
      className={className}
    />
  )
}
