/** @type {import('next').NextConfig} */
const path = require('path');
const { CANONICAL_SITE_URL, LEGACY_SITE_HOSTS } = require('./lib/canonical-host');
const { contentSecurityPolicy } = require('./lib/content-security');

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: process.env.NEXT_OUTPUT_MODE,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  outputFileTracingRoot: process.env.NEXT_OUTPUT_MODE ? path.join(__dirname, '../') : '/',
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ['nodemailer'],
  images: {
    formats: ['image/avif', 'image/webp'],
    qualities: [75, 85],
    deviceSizes: [480, 640, 750, 828, 960, 1080, 1200, 1440, 1600, 1920, 2560],
    remotePatterns: [
      { protocol: 'https', hostname: 'images.humanitix.com' },
      { protocol: 'https', hostname: '**.ticketm.net' },
      { protocol: 'https', hostname: 'cdn.evbuc.com' },
      { protocol: 'https', hostname: 'img.evbuc.com' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: '**.moshtix.com.au' },
      { protocol: 'https', hostname: '**.squarespace.com' },
      { protocol: 'https', hostname: '**.squarespace-cdn.com' },
      { protocol: 'https', hostname: '**.wixstatic.com' },
      { protocol: 'https', hostname: '**.framerusercontent.com' },
      { protocol: 'https', hostname: '**.wsimg.com' },
      { protocol: 'https', hostname: '**.oztix.com.au' },
      { protocol: 'https', hostname: 'whatson.cityofsydney.nsw.gov.au' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: '**.public.blob.vercel-storage.com' },
    ],
  },
  // 308 the legacy production alias onto the canonical host. Vercel serves this
  // same deployment on outza-sepia.vercel.app (that name is
  // VERCEL_PROJECT_PRODUCTION_URL). Prefer the same 308 in the Vercel project
  // (Settings → Domains → outza-sepia.vercel.app → redirect to
  // https://outza-outza.vercel.app) so the alias never reaches the app. This
  // rule covers the alias when that domain redirect is not set. Preview and
  // git hostnames are left alone.
  async redirects() {
    const local = [
      { source: '/watchlist', destination: '/account', statusCode: 308 },
      { source: '/outings', destination: '/', statusCode: 308 },
      { source: '/outings/:slug', destination: '/', statusCode: 308 },
      { source: '/community', destination: '/local', statusCode: 301 },
      { source: '/community/submit', destination: '/local?tab=submit', statusCode: 301 },
      { source: '/community/verify', destination: '/local/verify', statusCode: 301 },
      { source: '/community/manage/:token', destination: '/local/manage/:token', statusCode: 301 },
      { source: '/community/poster/:id', destination: '/local/poster/:id', statusCode: 301 },
      { source: '/community/:section/:city/:place/:when', destination: '/local/in/:section/:city/:place/:when', statusCode: 301 },
      { source: '/community/:section/:city/:place', destination: '/local/in/:section/:city/:place', statusCode: 301 },
      { source: '/community/:section/:city', destination: '/local/in/:section/:city', statusCode: 301 },
      { source: '/community/:section', destination: '/local/in/:section', statusCode: 301 },
    ]
    return [...local, ...LEGACY_SITE_HOSTS.flatMap((host) => [
      {
        source: '/',
        has: [{ type: 'host', value: host }],
        destination: `${CANONICAL_SITE_URL}/`,
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: host }],
        destination: `${CANONICAL_SITE_URL}/:path*`,
        permanent: true,
      },
    ])];
  },
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    const csp = contentSecurityPolicy(process.env.NODE_ENV, process.env.VERCEL_ENV);
    const security = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=(self)' },
      { key: 'Content-Security-Policy', value: csp },
      // Public pages are indexable. A later rule noindexes private areas only.
      { key: 'X-Robots-Tag', value: 'index, follow' },
    ];
    if (isProd) security.push({ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' });
    const noindex = { key: 'X-Robots-Tag', value: 'noindex, nofollow' };
    const privatePaths = [
      '/admin', '/admin/:path*',
      '/api', '/api/:path*',
      '/account', '/account/:path*',
      '/login', '/signup',
      '/promoter', '/promoter/:path*',
      '/itinerary', '/itinerary/:path*',
      '/unsubscribe',
      '/saved',
    ];
    const rules = [
      { source: '/:path*', headers: security },
      ...privatePaths.map((source) => ({ source, headers: [noindex] })),
      { source: '/sitemap.xml', headers: [{ key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' }, { key: 'X-Robots-Tag', value: 'index, follow' }] },
      { source: '/sitemaps/:path*', headers: [{ key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' }, { key: 'X-Robots-Tag', value: 'index, follow' }] },
      { source: '/robots.txt', headers: [{ key: 'Cache-Control', value: 'public, s-maxage=3600' }, { key: 'X-Robots-Tag', value: 'index, follow' }] },
    ];
    if (!isProd) {
      rules.push({ source: '/_next/static/:path*', headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }] });
    }
    return rules;
  },
  // Next's built-in dev allow-list covers `localhost` but not the IP. Browser checks
  // on this machine use 127.0.0.1.
  allowedDevOrigins: ['127.0.0.1'],
};

const fs = require('fs');
const userConfigPath = path.join(__dirname, 'next.config.user.json');
const userConfigAllowedKeys = { skipTrailingSlashRedirect: 'boolean', trailingSlash: 'boolean' };
if (fs.existsSync(userConfigPath)) {
  const userConfig = JSON.parse(fs.readFileSync(userConfigPath, 'utf8'));
  for (const key of Object.keys(userConfig)) {
    if (typeof userConfig[key] !== userConfigAllowedKeys[key]) {
      throw new Error(`next.config.user.json: unsupported override "${key}". Supported boolean keys: skipTrailingSlashRedirect, trailingSlash.`);
    }
    nextConfig[key] = userConfig[key];
  }
}

module.exports = nextConfig;

