'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ImagePlus, Loader2, X } from 'lucide-react'

export type LocalImage = { path: string; url: string } | null

/** Optional listing photo. Uploaded, resized and EXIF-stripped server side; the lister must confirm they hold the rights. */
export function LocalImageField({ image, onChange, rights, onRights }: { image: LocalImage; onChange: (i: LocalImage) => void; rights: boolean; onRights: (v: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); return }
    if (file.size > 8 * 1024 * 1024) { toast.error('That image is over 8 MB.'); return }
    setBusy(true)
    try {
      const fd = new FormData(); fd.append('image', file)
      const res = await fetch('/api/local/image', { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error ?? 'Could not upload that image'); return }
      onChange({ path: j.cloud_storage_path, url: j.url })
    } catch (err) {
      console.error(err)
      toast.error('Could not upload that image')
    } finally { setBusy(false) }
  }

  return (
    <div className="rounded-2xl bg-card shadow-sm p-6 space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold">Add a photo (optional)</h2>
        <p className="text-sm text-muted-foreground mt-1">A photo of the items, stalls or your flyer helps people decide. JPG, PNG, WebP or HEIC, up to 8 MB.</p>
      </div>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif" className="hidden" onChange={upload} />
      {image ? (
        <div className="space-y-3">
          <div className="relative aspect-video max-w-md rounded-xl overflow-hidden bg-muted">
            <img src={image.url} alt="Your listing photo preview" className="absolute inset-0 w-full h-full object-contain" onError={() => toast.error('Preview could not load, but the upload was saved.')} />
            <button type="button" onClick={() => { onChange(null); onRights(false) }} className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-black/70 text-white inline-flex items-center justify-center" aria-label="Remove photo"><X className="w-4 h-4" /></button>
          </div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={rights} onChange={(e) => onRights(e.target.checked)} className="mt-1 h-4 w-4 accent-[#e8553f]" />
            <span>I took this photo or own this image, or I have permission to use it. It doesn't show private information or people who haven't agreed to be shown.</span>
          </label>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="w-full sm:w-auto h-11 px-5 rounded-lg border border-dashed border-border bg-background text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-muted/60 disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}{busy ? 'Uploading…' : 'Choose a photo'}
        </button>
      )}
    </div>
  )
}
