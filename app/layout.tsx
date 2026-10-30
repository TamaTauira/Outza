import { DM_Sans, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import '@/components/vibepeep-mascot.css'
import '@/components/vibepeep-roam.css'
import '@/components/vibepeep-rig.css'
import '@/components/vibepeep-dances.css'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { ChunkLoadErrorHandler } from '@/components/chunk-load-error-handler'
import { DeploymentFetchPin } from '@/components/deployment-fetch-pin'
import { Providers } from '@/components/providers'
import { VibePeepBuddySlot } from '@/components/vibepeep-buddy-slot'
import { BRAND_APPLE_TOUCH, BRAND_FAVICON, BRAND_ICON_192, BRAND_ICON_512, BRAND_NAME, BRAND_OG_IMAGE, BRAND_SUBLINE, BRAND_TAGLINE } from '@/lib/brand'
import { siteUrl } from '@/lib/site-url'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' })
const jakartaSans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

const theme = '#0c0f0e'

export const metadata = {
  metadataBase: new URL(siteUrl()),
  title: `${BRAND_NAME} — ${BRAND_TAGLINE}`,
  description: `${BRAND_SUBLINE} A board of gigs, shows, markets and things to do in Sydney, Melbourne, Brisbane, Perth, Adelaide and beyond, sorted by start time. Save events, follow promoters and get email picks.`,
  applicationName: BRAND_NAME,
  manifest: '/manifest.webmanifest',
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: BRAND_FAVICON, sizes: '48x48' },
      { url: BRAND_ICON_192, sizes: '192x192', type: 'image/png' },
      { url: BRAND_ICON_512, sizes: '512x512', type: 'image/png' },
    ],
    shortcut: BRAND_FAVICON,
    apple: [{ url: BRAND_APPLE_TOUCH, sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: `${BRAND_NAME} — ${BRAND_TAGLINE}`,
    description: BRAND_SUBLINE,
    images: [BRAND_OG_IMAGE],
    siteName: BRAND_NAME,
    locale: 'en_AU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND_NAME} — ${BRAND_TAGLINE}`,
    description: BRAND_SUBLINE,
    images: [BRAND_OG_IMAGE],
  },
  // Search Console / Bing Webmaster ownership tags — only rendered once the codes are set in the environment.
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : {}),
    ...(process.env.BING_SITE_VERIFICATION ? { other: { 'msvalidate.01': process.env.BING_SITE_VERIFICATION } } : {}),
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f4ee' },
    { media: '(prefers-color-scheme: dark)', color: theme },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en-AU" suppressHydrationWarning>
      <body className={`${dmSans.variable} ${jakartaSans.variable} ${jetbrainsMono.variable} font-sans`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <Providers>{children}</Providers>
          <VibePeepBuddySlot />
          <Toaster />
          <ChunkLoadErrorHandler />
          <DeploymentFetchPin />
        </ThemeProvider>
      </body>
    </html>
  )
}
