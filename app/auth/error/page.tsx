'use client'

import { useSearchParams } from 'next/navigation'
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google'
import { Suspense } from 'react'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  weight: ['300', '400', '500', '600', '700'],
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['300', '400', '500', '600', '700'],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  weight: ['400', '500'],
})

function ErrorContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const isAccessDenied = error === 'AccessDenied'

  return (
    <div
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}
      style={{
        minHeight: '100vh',
        background: '#0d1323',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-inter), sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle radial glow — red tint for error */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '30%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at center, rgba(255,80,80,0.05) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Logo lockup */}
      <div style={{ textAlign: 'center', marginBottom: '40px', position: 'relative', zIndex: 1 }}>
        <div
          style={{
            fontFamily: 'var(--font-space-grotesk), sans-serif',
            fontSize: '3rem',
            fontWeight: 700,
            letterSpacing: '0.25em',
            color: '#3cd7ff',
            lineHeight: 1,
            textShadow: '0 0 40px rgba(60,215,255,0.35)',
          }}
        >
          HERMES
        </div>
        <div
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: '0.7rem',
            fontWeight: 500,
            letterSpacing: '0.4em',
            color: 'rgba(60,215,255,0.5)',
            marginTop: '6px',
            textTransform: 'uppercase',
          }}
        >
          MISSION CONTROL
        </div>
      </div>

      {/* Glass card */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          background: 'rgba(47,52,70,0.2)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '16px',
          padding: '40px 48px',
          width: '100%',
          maxWidth: '420px',
          textAlign: 'center',
        }}
      >
        {/* Error icon */}
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'rgba(255,80,80,0.1)',
            border: '1px solid rgba(255,80,80,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 4a.75.75 0 01.75.75v4a.75.75 0 01-1.5 0v-4A.75.75 0 0110 6zm0 8a1 1 0 110-2 1 1 0 010 2z"
              fill="rgba(255,100,100,0.9)"
            />
          </svg>
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-space-grotesk), sans-serif',
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'rgba(255,255,255,0.85)',
            marginBottom: '12px',
            letterSpacing: '-0.01em',
          }}
        >
          Access Denied
        </h1>

        <p
          style={{
            fontFamily: 'var(--font-inter), sans-serif',
            fontSize: '0.875rem',
            color: 'rgba(255,255,255,0.45)',
            marginBottom: '32px',
            lineHeight: 1.65,
          }}
        >
          {isAccessDenied
            ? 'Only @flashai.us and @aiowl.org accounts are permitted to access this system.'
            : 'An authentication error occurred. Please try signing in again.'}
        </p>

        <a
          href="/auth/signin"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            width: '100%',
            padding: '12px 24px',
            background: 'rgba(60,215,255,0.08)',
            border: '1px solid rgba(60,215,255,0.25)',
            borderRadius: '10px',
            color: '#3cd7ff',
            fontFamily: 'var(--font-inter), sans-serif',
            fontSize: '0.9375rem',
            fontWeight: 500,
            cursor: 'pointer',
            textDecoration: 'none',
            transition: 'background 0.2s, border-color 0.2s',
            letterSpacing: '0.01em',
            boxSizing: 'border-box',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget
            el.style.background = 'rgba(60,215,255,0.14)'
            el.style.borderColor = 'rgba(60,215,255,0.45)'
          }}
          onMouseLeave={e => {
            const el = e.currentTarget
            el.style.background = 'rgba(60,215,255,0.08)'
            el.style.borderColor = 'rgba(60,215,255,0.25)'
          }}
        >
          Try again
        </a>

        <p
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: '0.65rem',
            color: 'rgba(255,255,255,0.2)',
            marginTop: '24px',
            letterSpacing: '0.05em',
          }}
        >
          @flashai.us · @aiowl.org
        </p>
      </div>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={null}>
      <ErrorContent />
    </Suspense>
  )
}
