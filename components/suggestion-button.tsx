'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

function SuggestionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
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
      toast.success('Got it. Your idea’s in.')
      setMessage(''); onOpenChange(false)
    } catch (err) {
      console.error('Suggestion failed:', err)
      toast.error('Oops, that one didn’t land. Give it another go.')
    } finally { setBusy(false) }
  }

  const field = 'h-control w-full rounded-control border border-border bg-background px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/40'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Got a bright idea?</DialogTitle>
          <DialogDescription>What should we add? Gig-goers and promoters both welcome.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex gap-2">
            {(['CONSUMER', 'PROMOTER'] as const).map((r) => (
              <Chip key={r} pressed={role === r} onClick={() => setRole(r)} className="flex-1">
                {r === 'CONSUMER' ? 'I go to events' : 'I run events'}
              </Chip>
            ))}
          </div>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Your suggestion…" className={field} required />
          <div className="grid sm:grid-cols-2 gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className={field} />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" className={field} />
          </div>
          <Button disabled={busy} loading={busy} className="w-full">Send idea</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The ideas entry in the site footer: a plain text item in the Company link
 * list, styled exactly like the neighbouring footer links. It opens the same
 * suggestion dialog the old in-page button opened — same form, same
 * /api/suggestions submission.
 */
export function SuggestionLink() {
  const [open, setOpen] = useState(false)
  return (
    <li>
      <button type="button" className="vp-foot-link" onClick={() => setOpen(true)}>
        Got an idea? Send it
      </button>
      <SuggestionDialog open={open} onOpenChange={setOpen} />
    </li>
  )
}
