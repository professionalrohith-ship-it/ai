import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import type { TechnologyShare } from '../../../types'

/** Donut chart of detected languages. Default export so it can be lazy-loaded. */
export default function TechnologyChart({ data }: { data: TechnologyShare[] }) {
  return (
    <div className="flex flex-col items-center gap-5 @min-[26rem]:flex-row">
      <div className="relative size-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="64%"
              outerRadius="100%"
              paddingAngle={3}
              stroke="none"
              cornerRadius={4}
              isAnimationActive
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              cursor={false}
              formatter={(value) => [`${String(value)}%`, 'Share']}
              contentStyle={{
                background: '#181818',
                border: '1px solid #303030',
                borderRadius: 10,
                color: '#f5f5f5',
                fontSize: 12,
              }}
              itemStyle={{ color: '#f5f5f5' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-2xl font-semibold text-ink">{data.length}</p>
            <p className="text-[0.6875rem] font-medium tracking-wide text-mute uppercase">Languages</p>
          </div>
        </div>
      </div>

      <ul className="grid w-full min-w-0 flex-1 gap-2.5">
        {data.map((entry) => (
          <li key={entry.name} className="flex items-center gap-3 text-sm">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: entry.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-ink/90">{entry.name}</span>
            <span className="font-mono text-xs text-mute">{entry.value}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
