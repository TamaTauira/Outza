import { redirect } from 'next/navigation'

/** Old dashboard links land on the promoter home. */
export default function DashboardRedirect() {
  redirect('/promoter')
}
