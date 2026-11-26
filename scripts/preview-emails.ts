/**
 * Writes one HTML file per catalogue email. Nothing is sent and no account is read.
 * Usage: npx tsx scripts/preview-emails.ts [outdir]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { CATALOGUE_IDS, renderTemplate, type TemplateId } from '../lib/email-catalogue'

const out = path.resolve(process.argv[2] || 'tmp/email-previews')
mkdirSync(out, { recursive: true })
const links: string[] = []
for (const id of CATALOGUE_IDS) {
  const mail = renderTemplate(id as TemplateId)
  const file = `${id}.html`
  writeFileSync(path.join(out, file), mail.html)
  writeFileSync(path.join(out, `${id}.txt`), mail.text)
  links.push(`<li><a href="${file}">${id}</a> ${mail.subject}</li>`)
}
writeFileSync(path.join(out, 'index.html'), `<!DOCTYPE html><html lang="en-AU"><head><meta charset="utf-8"/><title>VibePeep email previews</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px;"><h1>Email previews</h1><ul>${links.join('')}</ul></body></html>`)
console.log(`${CATALOGUE_IDS.length} emails in ${out}`)
