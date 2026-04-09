'use client'

interface MetricCardProps {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  accent?: 'amber' | 'teal' | 'green' | 'blue' | 'red'
  live?: boolean
  icon?: React.ReactNode
}

const accentColors = {
  amber: '#FFB300',
  teal: '#14B8A6',
  green: '#3FB950',
  blue: '#388BFD',
  red: '#F85149',
}

export default function MetricCard({ label, value, sub, accent = 'amber', live, icon }: MetricCardProps) {
  const color = accentColors[accent]

  return (
    <div
      className="rounded p-4 flex flex-col gap-3 relative overflow-hidden"
      style={{
        backgroundColor: '#1C2128',
        border: '0.5px solid #30363D',
      }}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 opacity-60"
        style={{ backgroundColor: color }}
      />

      {/* Label row */}
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] uppercase tracking-widest font-mono"
          style={{ color: '#8B949E' }}
        >
          {label}
        </span>
        {live && (
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse-amber"
              style={{ backgroundColor: '#3FB950' }}
            />
            <span className="text-[9px] font-mono uppercase" style={{ color: '#3FB950' }}>
              LIVE
            </span>
          </div>
        )}
        {icon && <span style={{ color }}>{icon}</span>}
      </div>

      {/* Value */}
      <div
        className="text-3xl font-headline font-bold tracking-tight leading-none"
        style={{ color }}
      >
        {value}
      </div>

      {/* Sub */}
      {sub && (
        <div className="text-[11px] font-mono" style={{ color: '#484F58' }}>
          {sub}
        </div>
      )}
    </div>
  )
}
