import { DM_Sans, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { ChunkLoadErrorHandler } from '@/components/chunk-load-error-handler'
import { Providers } from '@/components/providers'

export const dynamic = 'force-dynamic'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' })
const jakartaSans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000'),
  title: 'Outza — Get out. Get amongst it.',
  description: 'Your city. Your events. Your next adventure. A board of gigs, shows, markets and things to do in Sydney, Melbourne, Brisbane, Perth, Adelaide and beyond, sorted by start time. Save events, follow promoters and get email picks.',
  icons: {
    icon: '/outza-icon.svg',
    shortcut: '/outza-icon.svg',
    apple: '/outza-icon.svg',
  },
  openGraph: {
    title: 'Outza — Get out. Get amongst it.',
    description: 'Your city. Your events. Your next adventure.',
    images: ['/og-image.png'],
    siteName: 'Outza',
    locale: 'en_AU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Outza — Get out. Get amongst it.',
    description: 'Your city. Your events. Your next adventure.',
    images: ['/og-image.png'],
  },
  // Search Console / Bing Webmaster ownership tags — only rendered once the codes are set in the environment.
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : {}),
    ...(process.env.BING_SITE_VERIFICATION ? { other: { 'msvalidate.01': process.env.BING_SITE_VERIFICATION } } : {}),
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en-AU" suppressHydrationWarning>
      <head>
        <script src="https://apps.abacus.ai/chatllm/appllm-lib.js"></script>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          crossOrigin=""
        />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css"
        />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css"
        />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossOrigin="" defer></script>
        <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js" defer></script>
      </head>
      <body className={`${dmSans.variable} ${jakartaSans.variable} ${jetbrainsMono.variable} font-sans`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <Providers>{children}</Providers>
          <Toaster />
          <ChunkLoadErrorHandler />
        </ThemeProvider>
      </body>
    </html>
  )
}
