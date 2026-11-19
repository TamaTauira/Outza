'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PromoterTermsCheck } from '@/components/promoter-terms-check'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function BecomePromoter() {
  const router = useRouter()
  const { update } = useSession() || {}
  const [orgName, setOrgName] = useState('')
  const [agreePromoterTerms, setAgreePromoterTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const ready = agreePromoterTerms && orgName.trim().length > 0

  async function switchRole() {
    if (!agreePromoterTerms) { toast.error('Tick that you agree to the Promoter Terms.'); return }
    if (!orgName.trim()) { toast.error('Enter an organisation name.'); return }
    setLoading(true)
    try {
      const r = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'PROMOTER', orgName: orgName.trim(), agreePromoterTerms: true }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Request failed (${r.status})`)
      await update?.()
      toast.success('You’re a promoter now')
      router.replace('/promoter')
      router.refresh()
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Couldn’t switch you over. Give it another go.')
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-3 text-left lg:mx-0">
      <div className="space-y-1.5">
        <Label htmlFor="become-org-name">Organisation name</Label>
        <Input id="become-org-name" name="orgName" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Organisation name" className="h-11" />
      </div>
      <PromoterTermsCheck id="become-promoter-terms" checked={agreePromoterTerms} onChange={setAgreePromoterTerms} />
      <Button onClick={switchRole} disabled={loading || !ready} className="h-10 px-5 font-semibold">
        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Switch to Promoter
      </Button>
    </div>
  )
}
