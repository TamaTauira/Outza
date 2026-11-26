import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function read(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
}

test('decorative glows and photo blurs are clipped so they cannot paint past the viewport', () => {
  const css = read('app/globals.css')
  const glow = css.slice(css.indexOf('.vp-decorative-glow'))
  assert.match(glow, /overflow:\s*hidden/)
  assert.match(glow, /contain:\s*paint/)
  const photo = css.slice(css.indexOf('.vp-photo {'), css.indexOf('.vp-photo-blur {'))
  assert.match(photo, /contain:\s*paint/)
  const blurImg = css.slice(css.indexOf('.vp-photo-blur-img {'), css.indexOf('.dark .vp-photo-blur-img'))
  assert.doesNotMatch(blurImg, /translateZ/)
  const header = read('components/site-header-bar.tsx')
  assert.match(header, /DecorativeGlow/)
  assert.doesNotMatch(header, /backdrop-blur/)
  const component = read('components/decorative-glow.tsx')
  assert.match(component, /vp-decorative-glow/)
  assert.match(component, /backdrop-blur-md/)
})

test('the bottom nav clips sideways only, so the raised Ask face stays whole', () => {
  const css = read('components/bottom-nav.css')
  const nav = read('components/bottom-nav.tsx')
  assert.match(nav, /DecorativeGlow/)
  const block = (selector: string) => {
    const start = css.indexOf(selector)
    assert.notEqual(start, -1, selector)
    return css.slice(start, css.indexOf('}', start))
  }
  for (const selector of ['  .vp-bottom-nav {', "html[data-vp-fold='side'] .vp-bottom-nav {"]) {
    const rule = block(selector)
    assert.match(rule, /overflow-x:\s*clip/)
    assert.match(rule, /overflow-y:\s*visible/)
    assert.doesNotMatch(rule, /contain\s*:/)
  }
  assert.doesNotMatch(css, /contain:\s*paint/)
  assert.doesNotMatch(css, /backdrop-filter/)
  const globals = read('app/globals.css')
  assert.match(globals, /--vp-safe-top:\s*env\(safe-area-inset-top,\s*0px\)/)
  assert.match(globals, /padding-top:\s*var\(--vp-safe-top\)/)
  const bar = read('components/site-header-bar.tsx')
  assert.match(bar, /h-\[var\(--vp-header-offset\)\]/)
})
