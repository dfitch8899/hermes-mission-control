import clsx from 'clsx'

type BadgeVariant = 'amber' | 'teal' | 'blue' | 'red' | 'green' | 'muted'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  amber: { backgroundColor: 'rgba(255,179,0,0.12)', color: '#FFB300', border: '0.5px solid rgba(255,179,0,0.3)' },
  teal: { backgroundColor: 'rgba(20,184,166,0.12)', color: '#14B8A6', border: '0.5px solid rgba(20,184,166,0.3)' },
  blue: { backgroundColor: 'rgba(56,139,253,0.12)', color: '#388BFD', border: '0.5px solid rgba(56,139,253,0.3)' },
  red: { backgroundColor: 'rgba(248,81,73,0.12)', color: '#F85149', border: '0.5px solid rgba(248,81,73,0.3)' },
  green: { backgroundColor: 'rgba(63,185,80,0.12)', color: '#3FB950', border: '0.5px solid rgba(63,185,80,0.3)' },
  muted: { backgroundColor: 'rgba(72,79,88,0.2)', color: '#8B949E', border: '0.5px solid #30363D' },
}

export default function Badge({ children, variant = 'muted', className }: BadgeProps) {
  return (
    <span
      className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-widest font-mono', className)}
      style={variantStyles[variant]}
    >
      {children}
    </span>
  )
}
