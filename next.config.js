/** @type {import('next').NextConfig} */
const path = require('path');
const { CANONICAL_SITE_URL, LEGACY_SITE_HOSTS } = require('./lib/canonical-host');

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: process.env.NEXT_OUTPUT_MODE,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  outputFileTracingRoot: process.env.NEXT_OUTPUT_MODE ? path.join(__dirname, '../') : '/',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: { unoptimized: true },
  // 308 the legacy production alias onto the canonical host. Vercel serves this
  // same deployment on outza-sepia.vercel.app (that name is
  // VERCEL_PROJECT_PRODUCTION_URL). Prefer the same 308 in the Vercel project
  // (Settings → Domains → outza-sepia.vercel.app → redirect to
  // https://outza-outza.vercel.app) so the alias never reaches the app. This
  // rule covers the alias when that domain redirect is not set. Preview and
  // git hostnames are left alone.
  async redirects() {
    return LEGACY_SITE_HOSTS.flatMap((host) => [
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
    ]);
  },
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      isProd ? 'upgrade-insecure-requests' : '',
    ].filter(Boolean).join('; ');
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

