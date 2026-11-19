import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import { ACCESSIBILITY_STANDARD, ACCESSIBILITY_UPDATED } from '@/lib/accessibility'

export const metadata: Metadata = {
  title: 'Accessibility — VibePeep',
  description: 'How far VibePeep meets WCAG 2.2 Level AA, the gaps we know about, and how to tell us about a barrier.',
}

export default function AccessibilityPage() {
  return (
    <PageShell>
      <main className="vp-wrap px-4 py-12 sm:px-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Legal</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Accessibility</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated {ACCESSIBILITY_UPDATED}.</p>
        <div className="mt-8 max-w-2xl space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="font-semibold text-foreground">What we aim for</h2>
            <p className="mt-2">VibePeep should be usable with a keyboard, a screen reader, and without relying on colour alone. Our target is {ACCESSIBILITY_STANDARD}. We are partially conformant: a lot of the site meets that target, and the gaps below do not.</p>
          </section>
          <section>
            <h2 className="font-semibold text-foreground">Known gaps</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>The map (pins, clusters and pan/zoom) is not fully usable by keyboard or screen reader. Zoom buttons are present. Pins themselves are not in the tab order.</li>
              <li>Event photos and posters supplied by organisers and ticket sites often have no useful text alternative. We show the event title beside the image.</li>
              <li>The event pop-up traps focus and Escape closes it. Returning focus to the event you opened is best-effort: if that link has left the page, focus can land on the dialog’s container instead.</li>
              <li>Unselected filter chips use the main text colour on a muted fill. Map category labels do too. A few category icon colours, notably Food &amp; Drink gold and Wellness teal, are decorative and can be faint on a light background. The label is not colour alone.</li>
              <li>Third-party ticket and organiser pages we link to are outside this statement.</li>
            </ul>
          </section>
          <section>
            <h2 className="font-semibold text-foreground">What we are doing</h2>
            <p className="mt-2">New pages are checked against the target before they ship. When someone reports a barrier we treat it as a defect, fix the ones we can in the product, and say so if a third-party page is the block. The map will stay a visual extra until the list and search paths cover the same events, which they do today.</p>
          </section>
          <section>
            <h2 className="font-semibold text-foreground">If the map is hard to use</h2>
            <p className="mt-2">You do not need the map to find an event. The home page lists what is on, the board and list views are the same events without a map, and search takes a keyword. City guides are ordinary pages. Saved events and an itinerary work from those lists.</p>
          </section>
          <section>
            <h2 className="font-semibold text-foreground">Tell us about a barrier</h2>
            <p className="mt-2">Use the <Link href="/contact" className="text-foreground underline underline-offset-2">contact page</Link> and choose Accessibility. Say the page, what you were trying to do, and the tool you were using (keyboard, screen reader, zoom). We aim to reply within 5 business days.</p>
          </section>
        </div>
      </main>
    </PageShell>
  )
}
