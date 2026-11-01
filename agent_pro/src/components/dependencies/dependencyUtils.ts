import type {
  Dependency,
  DependencyCategory,
  DependencyEcosystem,
  DependencyOverview,
  DependencySortKey,
  DependencyType,
  DependencyUsage,
} from '../../types/dependencies'
import type { BadgeTone } from '../ui/Badge'

export const ECOSYSTEM_LABEL: Record<DependencyEcosystem, string> = {
  npm: 'JavaScript (npm)',
  PyPI: 'Python (PyPI)',
  Cargo: 'Rust (Cargo)',
  Go: 'Go modules',
  Maven: 'Java (Maven/Gradle)',
  NuGet: '.NET (NuGet)',
  Composer: 'PHP (Composer)',
  RubyGems: 'Ruby (RubyGems)',
  Other: 'Other',
}

export const TYPE_LABEL: Record<DependencyType, string> = {
  production: 'Production',
  development: 'Development',
}

/** Neutral wording on purpose: it describes what was observed, not whether a package is good or bad. */
export const USAGE_LABEL: Record<DependencyUsage, string> = {
  imported: 'Imported in source',
  'declared-only': 'Declared only',
  tooling: 'Tooling / config',
}

export const USAGE_TONE: Record<DependencyUsage, BadgeTone> = {
  imported: 'info',
  'declared-only': 'neutral',
  tooling: 'neutral',
}

/** Ecosystem filter options: only the ecosystems that actually occur in the repository. */
export function ecosystemOptions(dependencies: Dependency[]) {
  const present = new Set(dependencies.map((dependency) => dependency.ecosystem))
  return [
    { value: 'all', label: 'All ecosystems' },
    ...(Object.keys(ECOSYSTEM_LABEL) as DependencyEcosystem[]).filter((key) => present.has(key)).map((key) => ({ value: key, label: ECOSYSTEM_LABEL[key] })),
  ]
}

export const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'production', label: 'Production' },
  { value: 'development', label: 'Development' },
]

export const SORT_OPTIONS: { value: DependencySortKey; label: string }[] = [
  { value: 'name-asc', label: 'Name (A to Z)' },
  { value: 'name-desc', label: 'Name (Z to A)' },
  { value: 'version-asc', label: 'Version (low to high)' },
  { value: 'version-desc', label: 'Version (high to low)' },
]

export const CATEGORY_LABEL: Record<DependencyCategory, string> = {
  all: 'All',
  production: 'Production',
  development: 'Development',
  python: 'Python packages',
  javascript: 'JavaScript packages',
  other: 'Other ecosystems',
}

export function inCategory(dependency: Dependency, category: DependencyCategory): boolean {
  switch (category) {
    case 'all':
      return true
    case 'production':
      return dependency.type === 'production'
    case 'development':
      return dependency.type === 'development'
    case 'python':
      return dependency.ecosystem === 'PyPI'
    case 'javascript':
      return dependency.ecosystem === 'npm'
    case 'other':
      return dependency.ecosystem !== 'npm' && dependency.ecosystem !== 'PyPI'
  }
}

/** Compares the numeric parts of two declared versions ("^1.7.9" vs ">=20"). */
export function compareVersions(a: string, b: string): number {
  const left = a.match(/\d+/g)?.map(Number) ?? []
  const right = b.match(/\d+/g)?.map(Number) ?? []
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

export interface DependencyFilters {
  query: string
  ecosystem: string
  type: string
  category: DependencyCategory
  sort: DependencySortKey
}

export const DEFAULT_FILTERS: DependencyFilters = { query: '', ecosystem: 'all', type: 'all', category: 'all', sort: 'name-asc' }

export function hasActiveFilters(filters: DependencyFilters): boolean {
  return filters.query.trim() !== '' || filters.ecosystem !== 'all' || filters.type !== 'all' || filters.category !== 'all'
}

export function applyFilters(dependencies: Dependency[], filters: DependencyFilters): Dependency[] {
  const needle = filters.query.trim().toLowerCase()
  const matched = dependencies.filter(
    (dependency) =>
      inCategory(dependency, filters.category) &&
      (filters.ecosystem === 'all' || dependency.ecosystem === filters.ecosystem) &&
      (filters.type === 'all' || dependency.type === filters.type) &&
      (needle === '' || dependency.name.toLowerCase().includes(needle) || dependency.description.toLowerCase().includes(needle)),
  )

  const direction = filters.sort.endsWith('desc') ? -1 : 1
  const byName = (a: Dependency, b: Dependency) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
  return [...matched].sort((a, b) =>
    filters.sort.startsWith('version') ? direction * compareVersions(a.version, b.version) || byName(a, b) : direction * byName(a, b),
  )
}

export function summarize(dependencies: Dependency[]): DependencyOverview {
  return {
    total: dependencies.length,
    production: dependencies.filter((entry) => entry.type === 'production').length,
    development: dependencies.filter((entry) => entry.type === 'development').length,
    ecosystems: new Set(dependencies.map((entry) => entry.ecosystem)).size,
  }
}
