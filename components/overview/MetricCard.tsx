'use client'

interface MetricCardProps {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  accent?: 'cyan' | 'teal' | 'purple' | 'blue' | 'red' | 'amber' | 'green'
  live?: boolean
  icon?: React.ReactNode
}

const accentMap = {
  cyan:   { color: '#a8e8ff', glow: 'rgba(168, 232, 255, 0.15)', border: 'rgba(168, 232, 255, 0.2)' },
  teal:   { color: '#5df6e0', glow: 'rgba(93, 246, 224, 0.15)',  border: 'rgba(93, 246, 224, 0.2)' },
  purple: { color: '#b8c4ff', glow: 'rgba(184, 196, 255, 0.15)', border: 'rgba(184, 196, 255, 0.2)' },
  blue:   { color: '#a8e8ff', glow: 'rgba(168, 232, 255, 0.15)', border: 'rgba(168, 232, 255, 0.2)' },
  red:    { color: '#ffb4ab', glow: 'rgba(255, 180, 171, 0.15)', border: 'rgba(255, 180, 171, 0.2)' },
  amber:  { color: '#a8e8ff', glow: 'rgba(168, 232, 255, 0.15)', border: 'rgba(168, 232, 255, 0.2)' },
  green:  { color: '#5df6e0', glow: 'rgba(93, 246, 224, 0.15)',  border: 'rgba(93, 246, 224, 0.2)' },
}

export default function MetricCard({ label, value, sub, accent = 'cyan', live, icon }: MetricCardProps) {
  const { color, glow, border } = accentMap[accent] ?? accentMap.cyan

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden glass-card"
      style={{ borderTop: `2px solid ${color}` }}
    >
      {/* Subtle glow at top */}
      <div
        className="absolute top-0 left-0 right-0 h-16 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 0%, ${glow} 0%, transparent 70%)`,
        }}
      />

      {/* Label row */}
      <div className="flex items-center justify-between relative z-10">
        <span className="text-[10px] uppercase tracking-widest font-mono text-outline">
          {label}
        </span>
        {live && (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse-glow" style={{ backgroundColor: '#5df6e0' }} />
            <span className="text-[9px] font-mono uppercase" style={{ color: '#5df6e0' }}>LIVE</span>
          </div>
        )}
        {icon && <span style={{ color }}>{icon}</span>}
      </div>

      {/* Value */}
      <div
        className="text-3xl font-headline font-bold tracking-tight leading-none relative z-10"
        style={{ color }}
      >
        {value}
      </div>

      {/* Sub */}
      {sub && (
        <div className="text-[11px] font-mono text-outline relative z-10">
          {sub}
        </div>
      )}
    </div>
  )
}
