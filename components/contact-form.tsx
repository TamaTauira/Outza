'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Surface } from '@/components/ui/surface'

const TOPICS = ['Listing', 'Account', 'Purchase', 'Accessibility', 'Something else'] as const
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || ''

type TurnstileApi = {
  render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void }) => string
  reset: (id?: string) => void
}

export function ContactForm() {
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>('Listing')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')
  const [token, setToken] = useState('')
  const widget = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)

  useEffect(() => {
    if (!SITE_KEY || !widget.current) return
    let cancel = false
    const mount = () => {
      const api = (window as Window & { turnstile?: TurnstileApi }).turnstile
      if (!api || !widget.current || cancel || widgetId.current) return false
      widgetId.current = api.render(widget.current, {
        sitekey: SITE_KEY,
        callback: (next) => setToken(next),
        'expired-callback': () => setToken(''),
      })
      return true
    }
    if (mount()) return () => { cancel = true }
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = () => { mount() }
    document.head.appendChild(script)
    return () => { cancel = true }
  }, [])

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (SITE_KEY && !token) {
      setError('Tick the check before sending.')
      return
    }
    setStatus('sending')
    setError('')
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic, email, message, company: '', turnstileToken: token }),
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
    return <Surface pad="md" role="status">Got it. We’ll reply to {email}.</Surface>
  }

  return (
    <Surface pad="lg" className="mt-6 max-w-xl">
    <form onSubmit={onSubmit} className="grid gap-3">
      <label className="grid gap-1 text-sm">
        Topic
        <select value={topic} onChange={(event) => setTopic(event.target.value as (typeof TOPICS)[number])} className="h-control rounded-control border border-input bg-background px-3 text-base">
          {TOPICS.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        Your email
        <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="h-control rounded-control border border-input bg-background px-3 text-base" />
      </label>
      <label className="grid gap-1 text-sm">
        Message
        <textarea required minLength={8} maxLength={4000} value={message} onChange={(event) => setMessage(event.target.value)} rows={5} className="rounded-control border border-input bg-background px-3 py-2 text-base" />
      </label>
      <input type="text" name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      {SITE_KEY ? <div ref={widget} className="min-h-11" /> : null}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" disabled={status === 'sending'} loading={status === 'sending'}>Send</Button>
    </form>
    </Surface>
  )
}
