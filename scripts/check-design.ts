/**
 * Fails CI when design-cohesion rules regress.
 * Email templates and mascot artwork stay out of this check: other work owns them.
 * Run A surfaces (Home, Map, Local, Ask, Itinerary, Saved) and colour tables keep
 * their existing literals. New pages and the long-tail pages this run owns do not.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const failures: string[] = []

const LEGACY_HEX = ['FF8A1A', 'FF4E6A', 'FF5A3C', 'E24B2A', 'FF7A1A', 'E8553F']

/** Colour lives in a token file, or the file is outside this run. */
function hexAllowed(rel: string) {
  return (
    /^components\/vibepeep-/.test(rel) ||
    rel === 'components/peep-icon.tsx' ||
    rel === 'components/footer.tsx' ||
    rel === 'components/site-footer.tsx' ||
    rel === 'components/google-button.tsx' ||
    rel === 'components/theme-color.tsx' ||
    rel === 'lib/brand.ts' ||
    rel === 'lib/categories.ts' ||
    rel === 'lib/tiers.ts' ||
    rel === 'lib/design-tokens.ts' ||
    rel === 'lib/design-tokens.test.ts' ||
    rel === 'lib/map-style.ts' ||
    rel === 'lib/map-style.test.ts' ||
    /^lib\/email/.test(rel) ||
    rel.startsWith('lib/newsletter/') ||
    rel === 'lib/promotion-email.ts' ||
    rel === 'lib/owner-alerts.ts' ||
    rel === 'lib/organiser-reach.ts' ||
    rel === 'lib/promoter-report.ts' ||
    rel === 'lib/trust.ts' ||
    rel.startsWith('lib/images/') ||
    rel === 'lib/scroll-restore.ts' ||
    rel === 'lib/listing-rules.test.ts' ||
    rel === 'app/design-tokens.css' ||
    rel === 'app/globals.css' ||
    rel === 'app/layout.tsx' ||
    rel.startsWith('app/admin/') ||
    rel.startsWith('app/(board)/') ||
    rel.startsWith('app/itinerary/') ||
    rel.startsWith('app/local/') ||
    rel.startsWith('public/') ||
    /^components\/(home-|map-view|saved-board|ai-search-bar|ask-sheet|board-row|event-card|event-list|event-peek|featured-turnstile|itinerary-|local-|community-board|navbar|site-header|bottom-nav|filter-bar|hero-card|outing-itinerary|listing-board-card|venue-map|home-discover)/.test(rel)
  )
}

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '.git') continue
    const abs = path.join(dir, name)
    const st = statSync(abs)
    if (st.isDirectory()) walk(abs, out)
    else if (/\.(tsx|ts|css)$/.test(name)) out.push(abs)
  }
  return out
}

function relOf(abs: string) {
  return path.relative(root, abs).split(path.sep).join('/')
}

for (const abs of walk(root)) {
  const rel = relOf(abs)
  if (rel.startsWith('components/vibepeep-') || rel.startsWith('public/') || rel.startsWith('lib/email') || rel.startsWith('lib/newsletter/') || rel.startsWith('public/email-headers/')) {
    continue
  }
  const text = readFileSync(abs, 'utf8')
  const lines = text.split('\n')

  lines.forEach((line, i) => {
    const upper = line.toUpperCase()
    if (LEGACY_HEX.some((hex) => upper.includes('#' + hex))) failures.push(`${rel}:${i + 1} legacy brand colour`)
    if (/rgba\(\s*232\s*,\s*85\s*,\s*63/i.test(line) || /rgba\(\s*255\s*,\s*122\s*,\s*26\b/i.test(line)) {
      failures.push(`${rel}:${i + 1} legacy brand colour`)
    }
    if (/text-\[\d+(?:\.\d+)?px\]/.test(line)) failures.push(`${rel}:${i + 1} text-[Npx] — use a type token`)
  })

  if (rel.endsWith('.css') && !rel.startsWith('components/vibepeep-') && !rel.startsWith('public/')) {
    const rules = text.split('}')
    for (const rule of rules) {
      if (rule.includes('vp-lockup')) continue
      const size = rule.match(/font-size:\s*([0-9.]+)(px|rem)/)
      if (!size) continue
      const value = Number(size[1])
      const px = size[2] === 'px' ? value : value * 16
      if (px > 0 && px < 12) failures.push(`${rel} font-size ${size[1]}${size[2]} is under 12px`)
    }
  }

  if (rel.endsWith('.tsx') && !hexAllowed(rel)) {
    lines.forEach((line, i) => {
      if (/#[0-9A-Fa-f]{3,8}\b/.test(line)) failures.push(`${rel}:${i + 1} raw hex in TSX`)
    })
    if (!rel.startsWith('components/ui/')) {
      lines.forEach((line, i) => {
        if (!/<(button|a)\b|<Link\b/.test(line)) return
        if (/role="switch"|aria-checked/.test(line)) return
        if (line.includes('rounded-full') && line.includes('bg-primary')) {
          failures.push(`${rel}:${i + 1} hand-rolled orange pill — use Button`)
        }
      })
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'))
  console.error(`\n${failures.length} design check failure(s)`)
  process.exit(1)
}
console.log('design check ok')
