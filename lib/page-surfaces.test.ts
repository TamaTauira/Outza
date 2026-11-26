import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('Plan and Saved share one hero and one page empty state', () => {
  const hero = read('../components/page-hero.tsx')
  const empty = read('../components/ui/empty-state.tsx')
  const saved = read('../components/saved-board.tsx')
  const plan = read('../app/itinerary/page.tsx')

  assert.match(hero, /Make a day of it\./)
  assert.match(hero, /The keepers\./)
  assert.equal((empty.match(/PAGE_MASCOT_CLASS/g) ?? []).length >= 1, true)
  assert.match(empty, /w-28 sm:w-32/)
  assert.match(empty, /text-h2/)
  assert.match(empty, /text-body/)

  assert.match(saved, /<PageHero variant="saved"/)
  assert.match(plan, /<PageHero variant="itinerary"/)
  assert.match(saved, /<EmptyState[\s\S]*size="page"/)
  assert.match(plan, /<EmptyState[\s\S]*size="page"/)
  assert.doesNotMatch(saved, /PageMasthead|VibePeepMascot|text-3xl font-bold sm:text-4xl|w-28 sm:w-32/)
  assert.doesNotMatch(plan, /PageMasthead|w-24 sm:w-28/)
})

test('account headings share a header, and Following has no calendar export button', () => {
  const account = read('../app/account/account-client.tsx')
  const vibe = read('../app/account/vibe-card.tsx')
  const section = read('../components/settings-section.tsx')

  assert.match(section, /export function AccountCardHeader/)
  assert.match(section, /export function SettingsSection/)
  assert.match(section, /leading-relaxed/)
  assert.doesNotMatch(account, /Add to my calendar/)
  assert.doesNotMatch(account, /\/api\/me\/calendar/)
  assert.match(account, /AccountCardHeader/)
  assert.match(account, /<SettingsSection title="Password">/)
  assert.match(account, /<SettingsSection className="mt-6" title="Close account"/)
  assert.doesNotMatch(vibe, /Sparkles/)
  assert.match(vibe, /AccountCardHeader/)
  assert.match(vibe, /Your vibe/)
})
