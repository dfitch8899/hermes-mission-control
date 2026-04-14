import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { getServerSession } from 'next-auth/next'

const ALLOWED_DOMAINS = ['flashai.us', 'aiowl.org']

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const email = user.email ?? ''
      const domain = email.split('@')[1] ?? ''
      return ALLOWED_DOMAINS.includes(domain)
    },
    async session({ session, token }) {
      return session
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
