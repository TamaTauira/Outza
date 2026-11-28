import type { ReactNode } from 'react'
import Link from 'next/link'
import { LogoHomeLink } from '@/components/logo'
import { SuggestionLink } from '@/components/suggestion-button'
import { SocialIcon } from '@/components/site-social-icons'
import { ACKNOWLEDGEMENT_OF_COUNTRY } from '@/lib/cities'
import { BRAND_TAGLINE } from '@/lib/brand'
import {
  COMPANY_LINKS,
  EXPLORE_LINKS,
  FOOTER_CITY_LINKS,
  LEGAL_LINKS,
  LISTING_SOURCES_LINE,
  SITE_DISCLAIMER,
  type SiteLink,
} from '@/lib/site-links'
import { SITE_SOCIAL } from '@/lib/site-social'

function LinkList({ links, cities = false, children }: { links: SiteLink[]; cities?: boolean; children?: ReactNode }) {
  return (
    <ul className={cities ? 'vp-foot-cities' : 'vp-foot-list'}>
      {links.map((link) => (
        <li key={link.href}>
          <Link href={link.href} className="vp-foot-link">{link.label}</Link>
        </li>
      ))}
      {children}
    </ul>
  )
}

function FootGroup({ title, links, cities = false, open = false, children }: { title: string; links: SiteLink[]; cities?: boolean; open?: boolean; children?: ReactNode }) {
  return (
    <div className="vp-foot-slot">
      <details className="vp-foot-acc" {...(open ? { open: true } : {})}>
        <summary>
          <span>{title}</span>
        </summary>
        <div className="vp-foot-panel">
          <LinkList links={links} cities={cities}>{children}</LinkList>
        </div>
      </details>
      <div className="vp-foot-static">
        <p className="vp-foot-label">{title}</p>
        <LinkList links={links} cities={cities}>{children}</LinkList>
      </div>
    </div>
  )
}

/** One footer for every page. Columns, cities and the legal list come from the shared site links. */
export function SiteFooter() {
  return (
    <footer className="vp-site-footer mt-10 border-t border-border">
      <div className="vp-wrap px-4 py-10 sm:px-6 lg:py-14">
        <div className="vp-foot-grid">
          <div className="vp-foot-brand">
            <LogoHomeLink size="sm" />
            <p className="mt-3 max-w-[16rem] text-sm leading-snug text-muted-foreground">{BRAND_TAGLINE}</p>
            <ul className="mt-4 flex flex-wrap gap-1" aria-label="VibePeep on social">
              {SITE_SOCIAL.map((item) => (
                <li key={item.id}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`VibePeep on ${item.label}`}
                    className={`vp-social vp-social-${item.id}`}
                  >
                    <SocialIcon id={item.id} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <FootGroup title="Explore" links={EXPLORE_LINKS} />
          <FootGroup title="Cities" links={FOOTER_CITY_LINKS} cities open />
          <FootGroup title="Company" links={COMPANY_LINKS}>
            <SuggestionLink />
          </FootGroup>
          <FootGroup title="Legal" links={LEGAL_LINKS} />
        </div>

        <div className="mt-8 flex items-start gap-3 rounded-xl border border-border bg-card/50 px-4 py-3 sm:items-center">
          <svg className="mt-0.5 h-8 w-12 shrink-0 rounded-sm sm:mt-0" viewBox="0 0 30 20" role="img" aria-label="Australian Aboriginal flag">
            <rect width="30" height="10" fill="#000" /><rect y="10" width="30" height="10" fill="#cc0000" /><circle cx="15" cy="10" r="5" fill="#ffcd00" />
          </svg>
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Acknowledgement of Country. </span>
            {ACKNOWLEDGEMENT_OF_COUNTRY}
          </p>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{LISTING_SOURCES_LINE}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{SITE_DISCLAIMER}</p>
      </div>
    </footer>
  )
}
