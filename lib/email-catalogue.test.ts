import assert from 'node:assert/strict'
import test from 'node:test'
import { CATALOGUE_IDS, catalogueEntry, renderTemplate, templateMailHeaders, type TemplateId } from './email-catalogue'
import { EMAIL_HEADER_CITY_KINDS } from './email-brand'

function visible(value: string) {
  return value.replace(/https?:\/\/\S+/g, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
}

test('every catalogue template has html and text, a logo, and no brand slip', () => {
  assert.equal(CATALOGUE_IDS.length, 51)
  for (const id of CATALOGUE_IDS) {
    const mail = renderTemplate(id as TemplateId)
    const entry = catalogueEntry(id)
    assert.ok(entry)
    assert.match(mail.html, /alt="VibePeep:/)
    assert.equal(mail.html.includes('icon-512.png'), false, id)
    assert.equal((mail.html.match(/email-headers\/[a-z0-9-]+\.png/g) ?? []).length, 1, id)
    const hidden = /mso-hide:all;">([^<]+)/.exec(mail.html)?.[1] ?? ''
    assert.ok(hidden.length >= 20, `${id} preheader`)
    assert.equal(mail.text.includes('&middot;'), false, id)
    assert.equal(mail.html.includes('&middot;'), false, id)
    assert.equal(/outza/i.test(visible(mail.html)), false, id)
    assert.equal(/outza/i.test(visible(mail.text)), false, id)
    assert.equal(/outza/i.test(mail.subject), false, id)
    assert.ok(mail.text.includes('VibePeep, Australia'), id)
    assert.ok(mail.text.trim().length > 20, id)
    const headers = templateMailHeaders(id as TemplateId)
    if (entry.kind === 'transactional') {
      assert.equal(headers['List-Unsubscribe'], undefined, id)
      assert.equal(mail.html.includes('Unsubscribe'), false, id)
    } else {
      assert.match(headers['List-Unsubscribe'] || '', /unsubscribe/)
      assert.match(mail.html, /Unsubscribe/)
    }
    if (entry.priority === 'launch-must') assert.match(mail.html, /#FF7A35/)
    const citySuffix = EMAIL_HEADER_CITY_KINDS.includes(entry.banner) ? '(-[a-z-]+)?' : ''
    assert.match(mail.html, new RegExp(`/email-headers/${entry.banner}${citySuffix}\\.png`), id)
  }
})
