import { Inter, Manrope } from 'next/font/google'
import './globals.css'
import '@/components/vibepeep-mascot.css'
import '@/components/bottom-nav.css'
import { ThemeProvider } from '@/components/theme-provider'
import { ThemeColor } from '@/components/theme-color'
import { Toaster } from '@/components/ui/sonner'
import { AudienceTracker } from '@/components/audience-tracker'
import { ChunkLoadErrorHandler } from '@/components/chunk-load-error-handler'
import { DeploymentFetchPin } from '@/components/deployment-fetch-pin'
import { Providers } from '@/components/providers'
import { BRAND_APPLE_TOUCH, BRAND_FAVICON, BRAND_ICON_192, BRAND_ICON_512, BRAND_NAME, BRAND_SUBLINE, BRAND_TAGLINE } from '@/lib/brand'
import { DEFAULT_OG_ALT, openGraphImage } from '@/lib/share-image'
import { siteUrl } from '@/lib/site-url'
import { MASCOT_DESKTOP_WIDTH, MASCOT_PHONE_WIDTH } from '@/lib/mascot-size'

// Variable files: one download each. Weights still come from the spec (400–800).
const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const manrope = Manrope({ subsets: ['latin'], variable: '--font-display' })

const theme = '#0c0f0e'
const defaultTitle = `${BRAND_NAME} — ${BRAND_TAGLINE}`
const defaultDescription = `${BRAND_SUBLINE} The friend who knows what's on: gigs, shows, markets and things to do in Sydney, Melbourne, Brisbane, Perth, Adelaide and beyond, sorted by start time. Save what looks good, follow venues, and get a nudge when it’s on.`
const defaultOgImage = openGraphImage(undefined, DEFAULT_OG_ALT)

export const metadata = {
  metadataBase: new URL(siteUrl()),
  title: defaultTitle,
  description: defaultDescription,
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
    title: defaultTitle,
    description: BRAND_SUBLINE,
    url: '/',
    images: [defaultOgImage],
    siteName: BRAND_NAME,
    locale: 'en_AU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: defaultTitle,
    description: BRAND_SUBLINE,
    images: [defaultOgImage],
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
  viewportFit: 'cover' as const,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f4ee' },
    { media: '(prefers-color-scheme: dark)', color: theme },
  ],
}

export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal?: React.ReactNode
}) {
  return (
    <html lang="en-AU" suppressHydrationWarning>
      <head>
        <meta
          name="impact-site-verification"
          // Impact's crawler reads `value`, which is not a standard meta attribute.
          // @ts-expect-error React's meta types only allow `content`.
          value="57fb6312-b0d5-4672-96a3-d75e8cef96f9"
        />
      </head>
      <body className={`${inter.variable} ${manrope.variable} font-sans`}>
        <style>{`:root{--vp-size-phone:${MASCOT_PHONE_WIDTH};--vp-size-desktop:${MASCOT_DESKTOP_WIDTH}}`}</style>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ThemeColor />
          <a href="#content" className="vp-skip">Skip to content</a>
          <div className="vp-hinge" aria-hidden="true" />
          <Providers>
            <div id="content">
              {children}
              {modal}
            </div>
          </Providers>
          <Toaster />
          <ChunkLoadErrorHandler />
          <AudienceTracker />
          <DeploymentFetchPin />
        </ThemeProvider>
      </body>
    </html>
  )
}
