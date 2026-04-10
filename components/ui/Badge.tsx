import clsx from 'clsx'

type BadgeVariant = 'amber' | 'teal' | 'blue' | 'red' | 'green' | 'muted' | 'cyan' | 'purple'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  cyan:   { backgroundColor: 'rgba(168,232,255,0.1)', color: '#a8e8ff', border: '1px solid rgba(168,232,255,0.25)' },
  amber:  { backgroundColor: 'rgba(168,232,255,0.1)', color: '#a8e8ff', border: '1px solid rgba(168,232,255,0.25)' },
  teal:   { backgroundColor: 'rgba(93,246,224,0.1)', color: '#5df6e0', border: '1px solid rgba(93,246,224,0.25)' },
  green:  { backgroundColor: 'rgba(93,246,224,0.1)', color: '#5df6e0', border: '1px solid rgba(93,246,224,0.25)' },
  blue:   { backgroundColor: 'rgba(168,232,255,0.1)', color: '#a8e8ff', border: '1px solid rgba(168,232,255,0.25)' },
  purple: { backgroundColor: 'rgba(184,196,255,0.1)', color: '#b8c4ff', border: '1px solid rgba(184,196,255,0.25)' },
  red:    { backgroundColor: 'rgba(255,180,171,0.1)', color: '#ffb4ab', border: '1px solid rgba(255,180,171,0.25)' },
  muted:  { backgroundColor: 'rgba(133,147,152,0.1)', color: '#859398', border: '1px solid rgba(133,147,152,0.2)' },
}

export default function Badge({ children, variant = 'muted', className }: BadgeProps) {
  return (
    <span
      className={clsx('inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] uppercase tracking-widest font-mono', className)}
      style={variantStyles[variant]}
    >
      {children}
    </span>
  )
}
