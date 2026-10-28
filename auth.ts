import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'

const secureCookies = process.env.NODE_ENV === 'production'
const cookieOpts = { httpOnly: true, sameSite: 'lax' as const, path: '/', secure: secureCookies }

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  trustHost: true,
  pages: { signIn: '/login' },
  cookies: {
    state: { name: 'authjs.state', options: cookieOpts },
    pkceCodeVerifier: { name: 'authjs.pkce.code_verifier', options: cookieOpts },
  },
  logger: {
    error(error) { console.error('[auth]', error) },
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      credentials: { email: { label: 'Email' }, password: { label: 'Password', type: 'password' } },
      async authorize(creds) {
        const email = String(creds?.email ?? '').trim().toLowerCase()
        const password = String(creds?.password ?? '')
        if (!email || !password) return null
        const user = await prisma.user.findUnique({ where: { email } })
        if (!user?.password) return null
        const ok = await bcrypt.compare(password, user.password)
        if (!ok) return null
        return { id: user.id, email: user.email, name: user.name, role: user.role }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id as string
        token.role = (user as { role?: string }).role ?? 'CONSUMER'
      }
      if (trigger === 'update' && token.id) {
        const u = await prisma.user.findUnique({ where: { id: token.id }, select: { role: true, name: true } })
        if (u) { token.role = u.role; token.name = u.name }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`
      try { if (new URL(url).origin === baseUrl) return url } catch { /* ignore */ }
      return baseUrl
    },
  },
})
