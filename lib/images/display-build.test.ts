import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import { buildDisplayFromBuffer } from './display-build'

async function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 40, g: 90, b: 160 } } }).jpeg().toBuffer()
}

test('a wide poster becomes 480, 960 and 1440 and is not enlarged', async () => {
  const built = await buildDisplayFromBuffer(await jpeg(2000, 1000))
  assert.equal(built.width, 2000)
  assert.equal(built.height, 1000)
  assert.deepEqual(built.widths, [480, 960, 1440])
  assert.equal(built.files.length, 3)
  assert.match(built.color, /^#[0-9a-f]{6}$/)
  assert.match(built.blur, /^data:image\/webp;base64,/)
  for (const file of built.files) {
    const meta = await sharp(file.webp).metadata()
    assert.equal(meta.width, file.width)
    assert.ok((meta.width ?? 0) <= 1440)
    assert.ok(file.avif.length > 0)
  }
})

test('a small image stays at its natural width', async () => {
  const built = await buildDisplayFromBuffer(await jpeg(300, 180))
  assert.deepEqual(built.widths, [300])
  const meta = await sharp(built.files[0].webp).metadata()
  assert.equal(meta.width, 300)
  assert.equal(meta.height, 180)
})
