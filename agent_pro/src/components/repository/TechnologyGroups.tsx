import type { TechnologyCategory, TechnologyEntry } from '../../types/repository'
import { Notice } from './Notice'
import { TechnologyCard } from './TechnologyCard'

const GROUPS: { category: TechnologyCategory; title: string }[] = [
  { category: 'language', title: 'Programming languages' },
  { category: 'frontend-framework', title: 'Frontend frameworks' },
  { category: 'backend-framework', title: 'Backend frameworks' },
  { category: 'database', title: 'Databases' },
  { category: 'dev-tool', title: 'Development tools' },
  { category: 'configuration', title: 'Configuration technologies' },
]

/** Detected technologies grouped by category. */
export function TechnologyGroups({ technologies }: { technologies: TechnologyEntry[] }) {
  return (
    <div className="space-y-6">
      <Notice tone="info">
        <span className="font-semibold">Detected from your files.</span> Languages come from file extensions; frameworks and tools from
        manifests such as package.json and requirements.txt, and from marker files.
      </Notice>

      {GROUPS.map((group) => {
        const items = technologies.filter((technology) => technology.category === group.category)
        return (
          <section key={group.category} aria-label={group.title}>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              {group.title}
              <span className="rounded-full bg-white/5 px-2 py-px text-[0.6875rem] font-semibold text-mute">{items.length}</span>
            </h3>
            {items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-3 text-xs text-mute">
                Nothing detected in this category.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3 @max-[60rem]:grid-cols-2 @max-[36rem]:grid-cols-1">
                {items.map((technology) => (
                  <TechnologyCard key={`${technology.category}:${technology.name}`} technology={technology} />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
