import { ChevronDown, FilterX } from 'lucide-react'
import { useId } from 'react'

import type { RepositoryFilterState, SortKey, StatusFilter } from '../../types/repository'
import { cn } from '../../utils/cn'
import { controlClass } from '../../utils/formStyles'
import { PrimaryButton } from '../ui/PrimaryButton'

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All scan statuses' },
  { value: 'indexed', label: 'Indexed' },
  { value: 'indexing', label: 'Indexing' },
  { value: 'not-indexed', label: 'Not indexed' },
  { value: 'error', label: 'Needs attention' },
]

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name-asc', label: 'Name (A to Z)' },
  { value: 'name-desc', label: 'Name (Z to A)' },
  { value: 'scanned-desc', label: 'Last scanned (newest)' },
  { value: 'scanned-asc', label: 'Last scanned (oldest)' },
  { value: 'files-desc', label: 'Most files' },
]

interface FilterSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  className?: string
}

/** Compact select for toolbars: the label is visually hidden but available to screen readers. */
function FilterSelect({ label, value, onChange, options, className }: FilterSelectProps) {
  const id = useId()
  return (
    <div className={cn('relative min-w-0', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={controlClass(false, 'h-10 cursor-pointer appearance-none pr-9')}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-card text-ink">
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-mute" aria-hidden="true" />
    </div>
  )
}

interface RepositoryFiltersProps {
  filters: RepositoryFilterState
  languages: string[]
  onChange: <K extends keyof RepositoryFilterState>(key: K, value: RepositoryFilterState[K]) => void
  onClear: () => void
  hasActiveFilters: boolean
}

/** Status filter, language filter, sort order and a clear button. */
export function RepositoryFilters({ filters, languages, onChange, onClear, hasActiveFilters }: RepositoryFiltersProps) {
  return (
    <div className="flex flex-row flex-wrap items-center gap-3 @max-[40rem]:flex-col @max-[40rem]:items-stretch">
      <FilterSelect
        label="Filter by scan status"
        value={filters.status}
        onChange={(value) => onChange('status', value as StatusFilter)}
        options={STATUS_OPTIONS}
        className="w-44 @max-[40rem]:w-full"
      />
      <FilterSelect
        label="Filter by programming language"
        value={filters.language}
        onChange={(value) => onChange('language', value)}
        options={[{ value: 'all', label: 'All languages' }, ...languages.map((language) => ({ value: language, label: language }))]}
        className="w-44 @max-[40rem]:w-full"
      />
      <FilterSelect
        label="Sort repositories"
        value={filters.sort}
        onChange={(value) => onChange('sort', value as SortKey)}
        options={SORT_OPTIONS}
        className="w-52 @max-[40rem]:w-full"
      />
      {hasActiveFilters && (
        <PrimaryButton
          variant="ghost"
          icon={<FilterX className="size-4" aria-hidden="true" />}
          onClick={onClear}
          className="@max-[40rem]:w-full"
        >
          Clear filters
        </PrimaryButton>
      )}
    </div>
  )
}
