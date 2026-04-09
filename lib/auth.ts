import { NextAuthOptions } from 'next-auth'
import { getServerSession } from 'next-auth/next'

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    // Cognito provider — only active when env vars are set
    ...(process.env.COGNITO_CLIENT_ID && process.env.COGNITO_CLIENT_SECRET && process.env.COGNITO_ISSUER
      ? [
          {
            id: 'cognito',
            name: 'Cognito',
            type: 'oauth' as const,
            clientId: process.env.COGNITO_CLIENT_ID,
            clientSecret: process.env.COGNITO_CLIENT_SECRET,
            issuer: process.env.COGNITO_ISSUER,
            wellKnown: `${process.env.COGNITO_ISSUER}/.well-known/openid-configuration`,
            authorization: { params: { scope: 'openid email profile' } },
            idToken: true,
            checks: ['pkce', 'state'] as ('pkce' | 'state')[],
            profile(profile: Record<string, string>) {
              return {
                id: profile.sub,
                name: profile.name ?? profile.email,
                email: profile.email,
                image: profile.picture,
              }
            },
          },
        ]
      : []),
  ],
  callbacks: {
    async session({ session, token }) {
      return session
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
}

export async function getSession() {
  return await getServerSession(authOptions)
}

export async function requireAuth() {
  const session = await getSession()
  if (!session && process.env.COGNITO_CLIENT_ID) {
    // Only enforce if Cognito is configured
    return null
  }
  if (!session) {
    console.warn('[auth] No session found — Cognito not configured, skipping auth check')
  }
  return session
}
