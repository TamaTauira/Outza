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
