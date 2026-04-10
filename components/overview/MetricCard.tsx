'use client'

interface MetricCardProps {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  accent?: 'cyan' | 'teal' | 'purple' | 'blue' | 'red' | 'amber' | 'green'
  live?: boolean
  icon?: React.ReactNode
  /** 0–100 progress ring; omit for no ring */
  progress?: number
}

const accentMap = {
  cyan:   { color: '#3cd7ff', soft: '#a8e8ff', glow: 'rgba(60, 215, 255, 0.2)',  border: 'rgba(60, 215, 255, 0.25)' },
  teal:   { color: '#5df6e0', soft: '#5df6e0', glow: 'rgba(93, 246, 224, 0.2)',  border: 'rgba(93, 246, 224, 0.25)' },
  purple: { color: '#b8c4ff', soft: '#b8c4ff', glow: 'rgba(184, 196, 255, 0.2)', border: 'rgba(184, 196, 255, 0.25)' },
  blue:   { color: '#3cd7ff', soft: '#a8e8ff', glow: 'rgba(60, 215, 255, 0.2)',  border: 'rgba(60, 215, 255, 0.25)' },
  red:    { color: '#ffb4ab', soft: '#ffb4ab', glow: 'rgba(255, 180, 171, 0.2)', border: 'rgba(255, 180, 171, 0.25)' },
  amber:  { color: '#ffd599', soft: '#ffd599', glow: 'rgba(255, 213, 153, 0.2)', border: 'rgba(255, 213, 153, 0.25)' },
  green:  { color: '#5df6e0', soft: '#5df6e0', glow: 'rgba(93, 246, 224, 0.2)',  border: 'rgba(93, 246, 224, 0.25)' },
}

function ProgressRing({ value, color, size = 52 }: { value: number; color: string; size?: number }) {
  const strokeWidth = 3
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference

  return (
    <svg width={size} height={size} className="shrink-0" style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}>
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={strokeWidth}
      />
      {/* Progress */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="progress-ring-circle"
        style={{
          '--ring-circumference': circumference,
          '--ring-offset': offset,
        } as React.CSSProperties}
      />
      {/* Center glow */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius * 0.5}
        fill={`${color}08`}
      />
    </svg>
  )
}

export default function MetricCard({ label, value, sub, accent = 'cyan', live, icon, progress }: MetricCardProps) {
  const a = accentMap[accent] ?? accentMap.cyan

  return (
    <div
      className="rounded-2xl p-5 relative overflow-hidden glass-card-glow animate-fade-in-scale"
      style={{ borderTop: `2px solid ${a.color}` }}
    >
      {/* Top glow wash */}
      <div
        className="absolute top-0 left-0 right-0 h-24 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% -20%, ${a.glow} 0%, transparent 70%)`,
        }}
      />

      {/* Corner accent orb */}
      <div
        className="absolute -top-8 -right-8 w-24 h-24 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${a.color}10 0%, transparent 70%)`,
        }}
      />

      <div className={`flex ${progress !== undefined ? 'items-start gap-4' : 'flex-col gap-3'} relative z-10`}>
        {/* Left: text content */}
        <div className={`flex flex-col gap-2 ${progress !== undefined ? 'flex-1 min-w-0' : ''}`}>
          {/* Label row */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.15em] font-mono text-outline">
              {label}
            </span>
            {live && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full animate-live-pulse" style={{ backgroundColor: '#5df6e0' }} />
                <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: '#5df6e0' }}>LIVE</span>
              </div>
            )}
            {icon && <span style={{ color: a.color }}>{icon}</span>}
          </div>

          {/* Value */}
          <div
            className="text-3xl font-headline font-bold tracking-tight leading-none"
            style={{ color: a.soft }}
          >
            {value}
          </div>

          {/* Sub */}
          {sub && (
            <div className="text-[11px] font-mono text-outline">
              {sub}
            </div>
          )}
        </div>

        {/* Right: progress ring */}
        {progress !== undefined && (
          <div className="relative">
            <ProgressRing value={progress} color={a.color} />
            <span
              className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold"
              style={{ color: a.color }}
            >
              {progress}%
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
