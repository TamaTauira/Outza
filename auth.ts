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
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          sessionVersion: user.sessionVersion,
          emailVerified: user.emailVerified,
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google' && user.id && (profile as { email_verified?: boolean } | undefined)?.email_verified !== false) {
        await prisma.user.updateMany({ where: { id: user.id, emailVerified: null }, data: { emailVerified: new Date() } }).catch((err) => {
          console.error('[auth] google verify', err instanceof Error ? err.message : err)
        })
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string
        token.role = (user as { role?: string }).role ?? 'CONSUMER'
        token.sv = (user as { sessionVersion?: number }).sessionVersion ?? 0
        token.emailVerified = !!(user as { emailVerified?: Date | null }).emailVerified
        return token
      }
      if (!token.id) return token
      const row = await prisma.user.findUnique({
        where: { id: token.id },
        select: { sessionVersion: true, role: true, name: true, emailVerified: true },
      })
      if (!row || row.sessionVersion !== (typeof token.sv === 'number' ? token.sv : 0)) {
        token.id = ''
        token.role = undefined
        token.emailVerified = false
        return token
      }
      token.role = row.role
      token.name = row.name
      token.emailVerified = !!row.emailVerified
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id || ''
        session.user.role = token.role
        session.user.verified = !!token.emailVerified
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
