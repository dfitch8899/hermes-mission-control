// Auth temporarily disabled — restore when Google OAuth is configured
// To re-enable: uncomment the block below and delete the two lines after it

// import { withAuth } from 'next-auth/middleware'
// export default withAuth({ callbacks: { authorized: ({ token }) => !!token }, pages: { signIn: '/auth/signin' } })
// export const config = { matcher: ['/((?!api/auth|auth|_next/static|_next/image|favicon.ico).*)'] }

export function middleware() {}
export const config = { matcher: [] }
