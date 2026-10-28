'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Link2, FileText, Loader2, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react'

export type ImportResult = { fields: Record<string, string>; found: string[]; missing: string[]; source: string }

/** Lets a lister prefill the form from a public web page or a PDF / Word flyer. Facts are copied, never invented. */
export function LocalImportCard({ city, onImported, result }: { city: string; onImported: (r: ImportResult) => void; result: ImportResult | null }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<'' | 'url' | 'file'>('')
  const fileRef = useRef<HTMLInputElement>(null)

  const run = async (body: FormData, kind: 'url' | 'file', source: string) => {
    setBusy(kind)
    try {
      body.append('city', city)
      const res = await fetch('/api/local/extract', { method: 'POST', body })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error ?? 'Import failed. Please fill in the form manually.'); return }
      onImported({ fields: j.fields ?? {}, found: j.found ?? [], missing: j.missing ?? [], source })
      toast.success(j.missing?.length ? 'Imported. Please complete the highlighted fields.' : 'Imported. Please check the details below.')
    } catch (err) {
      console.error(err)
      toast.error('Import failed. Please fill in the form manually.')
    } finally { setBusy('') }
  }

  const importUrl = () => {
    if (!url.trim()) { toast.error('Paste a link first'); return }
    const fd = new FormData(); fd.append('url', url.trim())
    run(fd, 'url', url.trim())
  }
  const importFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { toast.error('That file is over 10 MB.'); return }
    const fd = new FormData(); fd.append('file', file)
    run(fd, 'file', file.name)
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); importUrl() }} className="rounded-2xl bg-card shadow-sm p-6 space-y-4 border border-primary/20">
      <div>
        <h2 className="font-display text-xl font-bold flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" />Import your details (optional)</h2>
        <p className="text-sm text-muted-foreground mt-1">Paste a link to your public event page, or attach your flyer as a PDF or Word document. We'll fill in everything we can find, and you complete the rest.</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Link2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-event-page.com.au" aria-label="Link to your event page" className="w-full h-11 rounded-lg border border-border bg-background pl-9 pr-3 text-base" disabled={!!busy} />
        </div>
        <button type="submit" disabled={!!busy} className="h-11 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
          {busy === 'url' && <Loader2 className="w-4 h-4 animate-spin" />}{busy === 'url' ? 'Reading page…' : 'Import link'}
        </button>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
      <div>
        <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" className="hidden" onChange={importFile} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} className="w-full h-11 rounded-lg border border-dashed border-border bg-background text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-muted/60 disabled:opacity-60">
          {busy === 'file' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}{busy === 'file' ? 'Reading document…' : 'Attach PDF or Word (.docx) document'}
        </button>
        <p className="text-sm text-muted-foreground mt-1.5">Up to 10 MB. We can't read Facebook or Instagram links, so upload the flyer instead.</p>
      </div>

      {result && (
        <div className="rounded-xl bg-muted/60 p-4 text-sm space-y-2" aria-live="polite">
          <p className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" /><span>Imported <b>{result.found.length}</b> detail{result.found.length === 1 ? '' : 's'} from <span className="break-all">{result.source}</span>. Check everything below before publishing, since you're responsible for its accuracy.</span></p>
          {result.missing.length > 0 && (
            <p className="flex gap-2 text-[#b8432f] dark:text-[#f08a78]"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span><b>Please complete:</b> {result.missing.join(', ')}. These are highlighted in orange.</span></p>
          )}
          <p className="text-sm text-muted-foreground">Your contact email and the public-event confirmation always need to be filled in by you.</p>
        </div>
      )}
    </form>
  )
}
