/** Discreet identity notice. It says who edited the listing. It does not promise the details are accurate. */
export function OrganiserUpdateNotice({ notice }: { notice: { title: string; body: string; updatedAt?: string | null } }) {
  const when = notice.updatedAt
    ? new Date(notice.updatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : null
  return (
    <p className="text-xs text-muted-foreground leading-snug">
      <span className="font-medium text-foreground">{notice.title}.</span> {notice.body}
      {when ? <span className="block mt-0.5">Last updated {when}.</span> : null}
    </p>
  )
}
