'use client'

import { useState } from 'react'
import { Lightbulb, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export function SuggestionButton() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [role, setRole] = useState<'CONSUMER' | 'PROMOTER'>('CONSUMER')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim().length < 5) { toast.error('Please write a little more.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/suggestions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, role, name, email }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? 'Failed')
      toast.success('Thanks! Your idea has been sent.')
      setMessage(''); setOpen(false)
    } catch (err) {
      console.error('Suggestion failed:', err)
      toast.error('Could not send your idea. Please try again.')
    } finally { setBusy(false) }
  }

  const field = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40'
  return (
    <>
      {/* In the page flow on small screens so it does not cover Hot Right Now or the map loading label. */}
      <div className="px-4 pb-8">
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 px-4 h-11 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-md hover:opacity-90">
          <Lightbulb className="w-4 h-4" /> Suggest an Idea
        </button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Got a bright idea?</DialogTitle>
            <DialogDescription>Tell us what would make VibePeep even better. Event-goers and promoters welcome.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="flex gap-2">
              {(['CONSUMER', 'PROMOTER'] as const).map((r) => (
                <button type="button" key={r} onClick={() => setRole(r)} className={cn('flex-1 h-9 rounded-md border text-sm', role === r ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')}>
                  {r === 'CONSUMER' ? 'I go to events' : 'I run events'}
                </button>
              ))}
            </div>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Your suggestion…" className={field} required />
            <div className="grid sm:grid-cols-2 gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className={field} />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" className={field} />
            </div>
            <button disabled={busy} className="w-full h-10 rounded-md bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send idea
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
