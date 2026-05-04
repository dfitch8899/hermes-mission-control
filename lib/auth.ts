import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import type { OAuthConfig, OAuthUserConfig } from 'next-auth/providers/oauth'
import { getServerSession } from 'next-auth/next'

const ALLOWED_DOMAINS = ['flashai.us', 'aiowl.org']

function OpenAIProvider(options: OAuthUserConfig<Record<string, unknown>>): OAuthConfig<Record<string, unknown>> {
  return {
    id: 'openai',
    name: 'ChatGPT',
    type: 'oauth',
    // OpenAI is an OIDC provider — NextAuth will auto-discover endpoints
    wellKnown: 'https://auth.openai.com/.well-known/openid-configuration',
    authorization: {
      params: {
        scope: 'openid email profile',
      },
    },
    idToken: true,
    checks: ['pkce', 'state'],
    profile(profile: Record<string, unknown>) {
      return {
        id: profile.sub as string,
        name: profile.name as string ?? profile.email as string,
        email: profile.email as string,
        image: (profile.picture as string) ?? null,
      }
    },
    style: {
      logo: 'https://openai.com/favicon.ico',
      bg: '#000000',
      text: '#ffffff',
    },
    ...options,
  }
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    // ChatGPT / OpenAI SSO (primary)
    OpenAIProvider({
      clientId: process.env.OPENAI_CLIENT_ID!,
      clientSecret: process.env.OPENAI_CLIENT_SECRET!,
    }),
    // Google SSO (fallback — existing team logins)
    ...(process.env.GOOGLE_CLIENT_ID ? [
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      }),
    ] : []),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // OpenAI provider: allow any authenticated OpenAI/ChatGPT user
      if (account?.provider === 'openai') return true

      // Google provider: restrict to allowed domains
      const email = user.email ?? ''
      const domain = email.split('@')[1] ?? ''
      return ALLOWED_DOMAINS.includes(domain)
    },
    async session({ session, token }) {
      // Attach provider info to session so UI can show the right avatar/label
      if (token.provider) {
        (session as any).provider = token.provider
      }
      return session
    },
    async jwt({ token, account }) {
      if (account) {
        token.provider = account.provider
      }
      return token
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
}

export async function getSession() {
  return await getServerSession(authOptions)
}
