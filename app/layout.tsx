import type { Metadata } from 'next'
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import SideNavBar from '@/components/layout/SideNavBar'
import { warmHermesEndpoint } from '@/lib/hermesEndpoint'

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

export const metadata: Metadata = {
  title: 'Hermes Mission Control',
  description: 'Hermes Agent Management Platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Fire-and-forget ECS endpoint discovery on every request. The internal cache
  // (30 min TTL, globalThis-persistent across HMR) makes warm hits ~free, so this
  // only pays the 1.5 s AWS round-trip once per process and keeps every subsequent
  // /api/hermes/* request out of the discovery critical path.
  //
  // Skip during `next build` — Next renders the layout once per prerendered
  // route during static analysis, which previously fired ~19 fresh ECS+EC2
  // discoveries per build. Wasteful AWS calls and a flaky-network failure
  // mode that could fail the build. `NEXT_PHASE` is set by Next itself.
  if (process.env.NEXT_PHASE !== 'phase-production-build') {
    warmHermesEndpoint()
  }

  return (
    <html lang="en" className={`dark ${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-background text-on-background font-body overflow-hidden h-screen">
        <div className="flex h-screen overflow-hidden">
          <SideNavBar />
          <main className="flex-1 flex flex-col h-screen overflow-hidden ml-20">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
