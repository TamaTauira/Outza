'use client'

import { useState } from 'react'

const TOPICS = ['Listing', 'Account', 'Purchase', 'Accessibility', 'Something else'] as const

export function ContactForm() {
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>('Listing')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setStatus('sending')
    setError('')
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic, email, message, company: '' }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setStatus('error')
      setError(typeof data.error === 'string' ? data.error : 'We could not send that.')
      return
    }
    setStatus('sent')
    setMessage('')
  }

  if (status === 'sent') {
    return <p className="rounded-xl border border-border bg-card p-4 text-sm" role="status">Got it. We’ll reply to {email}.</p>
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 grid max-w-xl gap-3 rounded-xl border border-border bg-card p-4">
      <label className="grid gap-1 text-sm">
        Topic
        <select value={topic} onChange={(event) => setTopic(event.target.value as (typeof TOPICS)[number])} className="h-11 rounded-md border border-input bg-background px-3">
          {TOPICS.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        Your email
        <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="h-11 rounded-md border border-input bg-background px-3" />
      </label>
      <label className="grid gap-1 text-sm">
        Message
        <textarea required minLength={8} maxLength={4000} value={message} onChange={(event) => setMessage(event.target.value)} rows={5} className="rounded-md border border-input bg-background px-3 py-2" />
      </label>
      <input type="text" name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <button type="submit" disabled={status === 'sending'} className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
        {status === 'sending' ? 'Sending…' : 'Send'}
      </button>
    </form>
  )
}
