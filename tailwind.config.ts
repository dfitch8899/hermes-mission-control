import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'bg-base':        '#0D1117',
        'bg-surface':     '#161B22',
        'bg-elevated':    '#1C2128',
        'border-default': '#30363D',
        'border-subtle':  '#21262D',
        'text-primary':   '#E6EDF3',
        'text-muted':     '#8B949E',
        'text-faint':     '#484F58',
        'amber':          '#FFB300',
        'amber-dim':      '#2D1F00',
        'teal':           '#14B8A6',
        'teal-dim':       '#001F1E',
        'red':            '#F85149',
        'red-dim':        '#2D0F0E',
        'green':          '#3FB950',
        'green-dim':      '#0D1F0F',
        'blue':           '#388BFD',
      },
      fontFamily: {
        headline: ['var(--font-space-grotesk)', 'sans-serif'],
        body: ['var(--font-inter)', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '8px',
      },
      keyframes: {
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseAmber: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        livePulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(63, 185, 80, 0.4)' },
          '50%': { boxShadow: '0 0 0 4px rgba(63, 185, 80, 0)' },
        },
      },
      animation: {
        slideInLeft: 'slideInLeft 0.3s ease forwards',
        fadeInUp: 'fadeInUp 0.3s ease forwards',
        pulseAmber: 'pulseAmber 2s ease-in-out infinite',
        livePulse: 'livePulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
export default config
