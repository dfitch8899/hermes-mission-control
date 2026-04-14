'use client'

import { signIn } from 'next-auth/react'
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google'

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

export default function SignInPage() {
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
      {/* Subtle radial glow */}
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
          background: 'radial-gradient(ellipse at center, rgba(60,215,255,0.06) 0%, transparent 70%)',
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
          maxWidth: '400px',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-space-grotesk), sans-serif',
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'rgba(255,255,255,0.85)',
            marginBottom: '8px',
            letterSpacing: '-0.01em',
          }}
        >
          Secure Access
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-inter), sans-serif',
            fontSize: '0.8125rem',
            color: 'rgba(255,255,255,0.35)',
            marginBottom: '32px',
            lineHeight: 1.6,
          }}
        >
          Sign in with your authorized Google account to continue.
        </p>

        <button
          onClick={() => signIn('google', { callbackUrl: '/' })}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
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
            transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
            letterSpacing: '0.01em',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget
            el.style.background = 'rgba(60,215,255,0.14)'
            el.style.borderColor = 'rgba(60,215,255,0.45)'
            el.style.boxShadow = '0 0 20px rgba(60,215,255,0.12)'
          }}
          onMouseLeave={e => {
            const el = e.currentTarget
            el.style.background = 'rgba(60,215,255,0.08)'
            el.style.borderColor = 'rgba(60,215,255,0.25)'
            el.style.boxShadow = 'none'
          }}
        >
          {/* Google icon */}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path
              d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
              fill="#4285F4"
            />
            <path
              d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
              fill="#34A853"
            />
            <path
              d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
              fill="#FBBC05"
            />
            <path
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
              fill="#EA4335"
            />
          </svg>
          Sign in with Google
        </button>

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
