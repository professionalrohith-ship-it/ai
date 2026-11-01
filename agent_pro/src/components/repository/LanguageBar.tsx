import { CHART_COLORS } from '../../constants/theme'
import type { LanguageShare } from '../../types/repository'

/** Stacked bar with a legend showing how the files split across languages. */
export function LanguageBar({ languages }: { languages: LanguageShare[] }) {
  if (languages.length === 0) return null
  return (
    <div>
      <div
        role="img"
        aria-label={`Language breakdown: ${languages.map((language) => `${language.name} ${language.percent}%`).join(', ')}`}
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/8"
      >
        {languages.map((language, index) => (
          <span
            key={language.name}
            style={{ width: `${language.percent}%`, background: CHART_COLORS[index % CHART_COLORS.length] }}
            className="h-full first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
        {languages.map((language, index) => (
          <li key={language.name} className="inline-flex items-center gap-2 text-ink/90">
            <span className="size-2 rounded-full" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} aria-hidden="true" />
            {language.name}
            <span className="font-mono text-mute">{language.percent}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
