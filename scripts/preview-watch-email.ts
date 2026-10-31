/**
 * Writes the sample watchlist digest to a file so it can be opened without sending mail.
 * Usage: npx tsx scripts/preview-watch-email.ts [outfile.html]
 */
import { writeFileSync } from 'fs'
import { sampleWatchEmail } from '../lib/email-preview'

const mail = sampleWatchEmail()
const out = process.argv[2] || 'watchlist-preview.html'
writeFileSync(out, mail.html)
console.log(out)
