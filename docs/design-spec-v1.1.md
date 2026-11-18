VIBEPEEP
Visual Design
& UI System
Build-ready specification for the consumer platform and promoter experience


VERSION 1.1 — UPDATED DISCOVERY & RESPONSIVE SYSTEM  |  16 NOVEMBER 2026
Prepared as an implementation brief for the VibePeep development team.

How to use this specification
This document is the design source of truth for the first implementation pass. It converts the visual direction into explicit tokens, dimensions, component rules, responsive behaviour, page layouts, developer instructions and acceptance criteria.
Implement shared tokens and components before restyling individual pages.
Preserve existing functionality, URLs, data contracts, analytics events, SEO and business logic unless separately approved.
Use these values as defaults. Document any technical exception rather than silently inventing a new pattern.
Treat example layouts and copy as design guidance. Never hard-code illustrative event, pricing or performance data.

Contents
1. Brand principles
2. Design tokens
3. Typography
4. Layout and responsive rules
5. Component library
6. Interaction and motion
7. Page-by-page layouts
8. TummerBot rules
9. Accessibility and data presentation
10. Engineering instructions
11. QA and acceptance
12. Delivery plan
1. Brand principles
VibePeep helps people discover live music, arts, nightlife, cultural experiences and local happenings. The interface must make discovery exciting, relevant and effortless while giving promoters a credible way to reach audiences.

Brand voice
Short, energetic, human and specific. Prefer 'Find your next plan' to generic SaaS language.
Use humour sparingly; never at the expense of clarity, safety or trust.
Use Australian English, local date conventions and AUD formatting.
Tagline: 'Take a peep at what's happening.'
2. Design foundations and tokens
2.1 Colour palette


2.2 Accent usage

2.3 Spacing scale

2.4 Radius, borders and elevation

Avoid heavy shadows on every dark card. Prefer tonal surface differences and subtle borders. Shadows communicate layering, not decoration.
3. Typography
Recommended pairing: Manrope for display and headings; Inter for body, forms, navigation and dense interface data. Load only the weights used. If the existing project already uses a close, performant family, retain it only with approval and map it to the same type scale.

Headings 700–800; body 400–500; buttons 600.
Use sentence case. Avoid all-caps paragraphs.
Limit heading width to avoid awkward one-word wrap lines.
Use tabular numerals for prices, counts, dates and analytics.
Essential mobile text must not fall below 13px.
4. Layout and responsive rules
4.1 Breakpoints

Use mobile-first CSS. Breakpoints are minimum viewport widths. Do not add page-specific breakpoints without documenting why.
4.2 Grid and containers

4.3 Navigation dimensions

4.4 Responsive behaviour
Below 768px, use compact header and consumer bottom navigation where the route/context supports it.
Below 600px, use one-column page content.
Filters become a bottom sheet; retain quick-filter chips above results.
Map/List/Board remains available; map can become a dedicated full-screen view on phones.
Pricing cards stack; never compress three cards into one phone row.
Respect iOS/Android safe-area insets for sticky controls.
5. Component library
Build these as shared reusable components. Components consume tokens and expose explicit variants; do not create slightly different versions on each route.
5.1 Buttons

Use verb-first labels: Explore events, Save event, Create listing, Boost event.
Loading state prevents duplicate submissions and preserves button width.
Disabled state remains legible and clearly inactive.
5.2 Inputs and filters

5.3 Event card

Image uses object-fit: cover; preserve supplied focal point.
Use a branded fallback image, never a broken-image icon.
Date/time, venue/suburb and price occupy consistent positions.
Explicitly label Free, Sold out, Cancelled and Sponsored.
Never invent price, availability, accessibility or age restrictions.
5.4 Board, List and Map
Use a segmented control with equal-height options and a clearly filled selected state.
Keep search, location and active filters consistent when switching views.
Board is image-led; List is information-rich; Map is geographic.
Map pins and list cards represent the same filtered result set.
Switching views must not clear the user's search or filters.
5.5 Pricing card

State duration, placement, inclusions, exclusions and renewal/one-off status.
Do not show unavailable plans as purchasable.
Visible tier, checkout product ID and entitlement must match exactly.
5.6 Badges, alerts, empty states and overlays

6. Interaction and motion

Avoid autoplay audio/video. Motion should explain state change, not compete with event imagery.
7. Page-by-page layouts
Map these recommendations to the actual route inventory before implementation. Preserve existing routes and features. If a proposed page does not exist, do not create it without confirming product scope.
7.1 Consumer homepage

Hero rule: one clear promise, one primary search action and one secondary route into browsing. Relevant events should appear without scrolling through multiple large control panels.
Acceptance: no contradictory counts; no empty-state message while results exist; no accidental duplicate cards; every section has loading, empty and error states.
7.2 Local discovery
Page title names the location or local discovery intent.
Show concise location selector and one-line explanation.
Keep Map/List/Board near result count.
Quick filters: date, category, price and distance; advanced filters in a drawer.
Map pins and list cards show the same filtered results.
Mobile: clear List/Map switch and map results preview.
7.3 Saved events
Heading such as 'Your saved plans' with saved count.
Use standard event cards; useful sorting by date/category/location only where valuable.
Empty state: Tummer prompt, one sentence and Explore events CTA.
Removing an event gives immediate feedback and undo where practical.
7.4 Itinerary / plans
Group items by date with clear day headings.
Show time, venue, suburb and user notes.
Use a vertical timeline; do not rely only on a dense calendar grid.
Flag overlaps/travel gaps only when time and location data support it.
Share/export only if supported end-to-end.
7.5 Event detail
Hero image; title, date/time, venue and location immediately visible.
Primary action links to official ticket/event destination when supplied and valid.
Secondary actions: save, share, add to plan.
Then description, organiser/venue details, location/map and practical information.
Show source/last updated where available; distinguish organiser-provided from platform data.
Explicitly handle cancelled, postponed, sold-out and past events.
7.6 Board / List / Map
Board: image-led cards, 3 desktop columns; 1 mobile column or horizontal rail.
List: compact rows with title, date, venue, suburb, price and save action.
Map: map canvas plus result list/bottom sheet; provide list fallback if map fails.
All views share filters, location and sorting.
7.7 Promoter landing page


7.8 Promoter dashboard
Desktop left navigation rail: 240px; compact mobile menu.
Top row: page title, date range, primary Create event action.
Metric cards show only verified metrics with measurement window and definition.
Campaign table: event, tier, status, dates, spend and available performance.
Charts only when useful; provide table/text alternative.
Empty dashboard guides promoter to create/list an event.
7.9 Listing creation and checkout
Use a visible step indicator when multiple stages are required.
Separate event details, promotion selection and payment.
Before payment show event, tier, duration, total, tax treatment, renewal and cancellation/refund terms.
Never preselect a paid tier without clear user action.
Preserve entered data through validation or payment failure.
Success screen confirms purchase, next steps and management location.
7.10 Account, onboarding and community listings
Keep sign-in/registration lightweight and use shared form components.
Explain why each requested field is needed.
Distinguish community listings from commercial promoter listings.
Respect ownership: venue-owned information, organiser-owned event content and platform moderation are distinct.
Show pending, approved, rejected and edit-request states clearly.
8. TummerBot visual rules
TummerBot is a core brand asset. The approved reference renders take precedence over generated variations.
Matte charcoal-black rounded/oval body with established proportions.
Single spherical antenna.
Connected oversized eye surrounds: orange viewer-left, pink viewer-right.
Large glossy black-and-white eyes; small expressive open mouth; rounded arms and hands.
Do not change eye placement/colour, silhouette, antenna, proportions or material finish.

Use canonical production assets (SVG/PNG/WebP/Lottie/3D render) if available. Do not recreate Tummer from text prompts for production UI. Record the asset version.
9. Accessibility, content and data presentation
Target WCAG 2.2 AA for text, controls, focus and keyboard operation.
Normal text contrast minimum 4.5:1; large text minimum 3:1; meaningful non-text controls/graphics minimum 3:1 where applicable.
Interactive targets at least 44×44 CSS px where practical.
Every control has an accessible name; icon-only controls need aria-labels.
Do not communicate status by colour alone; pair colour with text/icon.
Support keyboard navigation, visible focus, screen-reader labels and reduced motion.
Use semantic heading order and landmarks; one H1 per page.
Use unambiguous local event dates; store canonical timestamps/time zones.
Format currency consistently in AUD; do not show an unsupported price.
Use meaningful alt text for event images; decorative backgrounds use empty alt text.
Reserve image dimensions and skeleton sizes to prevent layout shift.
10. Engineering implementation instructions
10.1 Before changing code
Inspect repository structure, route inventory, component library, CSS strategy and existing tokens.
Identify source of truth for event cards, search/filter state, Board/List/Map, pricing tiers, checkout IDs and dashboard metrics.
Capture baseline desktop and mobile screenshots for every route.
Create route-to-component map and list any routes not covered here.
Record behaviours to preserve: API contracts, analytics, SEO metadata, deep links, auth and payments.
10.2 Token implementation
Create one central token file (CSS custom properties, theme object or existing project equivalent). Example:
:root {
  --vp-bg-canvas: #0C0F0E;
  --vp-bg-surface: #151A19;
  --vp-bg-elevated: #1D2422;
  --vp-bg-raised: #252D2A;
  --vp-border-subtle: #26302C;
  --vp-border-default: #303936;
  --vp-text-primary: #F5F5F2;
  --vp-text-secondary: #B8C0BC;
  --vp-text-muted: #89938E;
  --vp-brand-orange: #FF7A35;
  --vp-brand-pink: #F05A9D;
  --vp-brand-amber: #FFC078;
  --vp-radius-sm: 8px;
  --vp-radius-md: 12px;
  --vp-radius-lg: 16px;
  --vp-radius-xl: 20px;
  --vp-space-1: 4px; --vp-space-2: 8px;
  --vp-space-3: 12px; --vp-space-4: 16px;
  --vp-space-5: 20px; --vp-space-6: 24px;
  --vp-space-8: 32px; --vp-space-10: 40px;
  --vp-space-12: 48px; --vp-space-16: 64px;
  --vp-container-max: 1280px;
}
10.3 Component architecture
Shared primitives: Button, IconButton, Input, Select, Chip, Badge, Card, Modal, Drawer, Skeleton, EmptyState, Alert.
Shared product components: EventCard, EventListItem, EventToolbar, ViewSwitcher, FilterBar, PricingCard, MetricCard, StatusLabel.
Expose explicit variants (size, tone, density, state); avoid one-off CSS overrides.
Keep content/data separate from presentation. Event cards must not contain hard-coded sample data.
Use one event display model/normalisation layer so Board, List, Map and Saved views agree.
Do not change API schemas or data ownership rules during a visual-only implementation.
10.4 Implementation constraints
Preserve working features and route URLs.
Do not replace live data with mock data to improve screenshots.
Do not invent reviews, ratings, promoter results, counts or audience metrics.
Do not change prices, product IDs, entitlements, tax or billing without explicit approval.
Use existing image CDN/optimisation pipeline; define fallback behaviour.
Avoid new dependencies unless necessary; justify bundle-size and maintenance impact.
Ensure responsive changes do not cause horizontal overflow.
10.5 Suggested naming
Follow existing project conventions. If none exist, use semantic names such as vp-event-card, vp-filter-chip, vp-view-switcher, vp-pricing-card and vp-section-heading. Avoid fragile DOM-nesting or text-based selectors.
11. QA and acceptance
Visual QA
☐ All routes use the same colour, surface, text, border, accent and radius tokens.
☐ Heading hierarchy and type scale match this spec.
☐ Page gutters, card padding and section spacing are consistent.
☐ Event imagery has consistent ratios and graceful fallbacks.
☐ Buttons, inputs, chips, badges and cards share dimensions and states.
☐ Orange/pink are selective; gradients and visual noise are controlled.
☐ Pricing cards align and explain duration, inclusions and purchase terms.
Responsive QA
☐ Test 320, 375, 430, 768, 1024, 1280 and 1440 CSS px.
☐ No horizontal scroll except intentional rails/tables.
☐ Navigation, filters, drawers and bottom bars work on touch devices.
☐ Cards and pricing stack correctly at phone widths.
☐ Sticky UI respects safe areas and does not cover content.
☐ Map/List/Board switching preserves search and filters.
Functional/data QA
☐ Search, filters, sorting and view switching still work.
☐ Counts match the displayed result set.
☐ No duplicate/stale event data introduced by presentation changes.
☐ Empty, loading, error, sold-out, cancelled and past-event states are correct.
☐ Promoter display, checkout product ID and entitlement mapping match.
☐ Checkout totals and terms match approved commercial configuration.
☐ Dashboard metrics have valid definitions and data sources.
☐ Analytics, SEO, deep links and authentication remain intact.
Accessibility QA
☐ Contrast passes for text, buttons, badges and controls.
☐ Keyboard navigation works with visible focus.
☐ Icon-only controls have screen-reader names.
☐ Forms have labels, validation and associated error messages.
☐ Reduced-motion preference is respected.
☐ Touch targets meet minimum wherever practical.
12. Delivery sequence and definition of done

Definition of done
A page is complete only when it matches the shared visual system on desktop and mobile, uses reusable components, includes interaction/error states, preserves existing behaviour, passes accessibility checks and has been reviewed against screenshots. An attractive static mock-up is not sufficient.

Appendix A — Quick reference

Appendix B — Product-owner decisions to confirm
Approve Manrope + Inter or confirm current fonts to map to this type scale.
Confirm final hex values against canonical VibePeep logo and TummerBot assets.
Confirm complete route inventory and which proposed surfaces exist today.
Confirm approved promoter tiers, prices, durations, inclusions and checkout product IDs.
Confirm which analytics metrics are genuinely available.
Confirm event source, ticket destination, organiser ownership and event-status rules.
Confirm mobile bottom navigation scope across consumer routes and login states.

Version 1.1 — Mandatory discovery and full-width layout amendments
This revision strengthens the original design specification. It makes intelligent use of the full available desktop viewport a mandatory layout principle and defines two distinct search experiences that share one discovery dataset and state model. These are implementation requirements, not claims about the current live implementation.
Apply these amendments alongside the existing brand, component, accessibility, promoter, checkout and engineering standards. Preserve working behaviour and inspect the current repository before changing code.
1. Full-width, fluid responsive layout
VibePeep must feel expansive and deliberately composed on modern desktop screens. Do not constrain the entire application to a narrow 1280px container. Use a fluid layout that expands with the viewport while preserving readable text measures and sensible component minimums.
Use width: 100% and a responsive max-width of approximately 1760px for the main application shell. Do not retain the old 1280px maximum as a global cap.
Use CSS grid minmax() and auto-fit/auto-fill where appropriate so layouts gain columns naturally without creating undersized cards.
Expand the Map canvas, List/Timetable, promoter dashboard tables and analytics panels to use the available width.
Allow hero backgrounds and major section backgrounds to span edge-to-edge. Keep hero copy and search content at a readable measure rather than stretching text across the screen.
Do not enlarge every card or add decorative whitespace simply because the screen is wide. Use the space for more useful results, clearer data columns, map area and better scanning.
Keep long-form descriptions at a comfortable reading width (typically 60–75 characters per line). The content shell can be wide while individual text blocks remain controlled.
Avoid horizontal overflow, excessive empty side gutters and fixed-width panels that leave large unused areas on wide monitors.
Recommended desktop event card minimum width: 240–280px depending on content. The grid should add columns only while that minimum remains viable. For dashboards, use wider tables and multi-panel layouts rather than enlarging metric cards indiscriminately.
2. Two distinct search experiences
The product must expose two separate, clearly named search modes. They serve different user intents and must not be merged into one generic search box.
2.1 AI Discovery Search — homepage hero
Purpose: help someone describe the experience they want in natural language, then return relevant events and editable structured filters.
Keep a prominent AI-powered search field in the homepage hero, visually dominant but not obstructive.
Example prompt: “Find me something fun this Saturday night under $50 around Surry Hills.”
Interpret intent such as mood, interests, event type, date/time, location, distance and budget when the user supplies them.
Translate the request into structured filters and return actual event results from the shared event dataset. Do not present the experience as a chatbot conversation.
Show the interpreted filters as editable/removable chips above results, for example Saturday, Night, Surry Hills and Under $50.
Provide a small set of useful suggested prompts that can be selected or edited.
Keep ordinary browsing immediately available. AI search is optional; users must be able to browse, use quick filters or open the discovery views without entering a prompt.
Provide clear loading, no-results, error and unsupported-intent states. Never fabricate event listings or availability.
Suggested placeholder: “Tell us what you’re in the mood for…” Supporting text may explain that users can describe a vibe, date, place or budget. The submit action should use a clear label such as Find events.
2.2 Quick Search — List / Timetable toolbar
Purpose: let users rapidly locate a known event, artist, performer, venue or keyword. This is conventional search, not an AI assistant.
Place a separate Quick Search input in the existing List/Timetable toolbar, alongside the date/category/location filters.
Placeholder: “Search events, artists, performers or venues”.
Search exact and partial event names, artist/performer names, venue names and relevant event keywords.
Keep the input easy to reach while scrolling: use a compact sticky discovery toolbar where it does not obscure content.
Use responsive autocomplete/suggestions where supported, with keyboard navigation and clear focus states.
Use a short debounce (approximately 200–300ms) for remote queries where needed; avoid delaying local filtering unnecessarily.
Support typo tolerance where practical and supported by the search backend. Do not promise fuzzy matching if the underlying service cannot provide it.
Include a clear/reset control and an accessible label. Do not use conversational prompts, chat bubbles or AI-generated follow-up dialogue in this field.
The Quick Search must be specific to the List/Timetable experience, but its resulting keyword filter must apply to the same shared result set when the user switches to Board or Map.
3. One shared discovery engine and state model
Both search experiences must query/filter one canonical event dataset and one consistent result model. Avoid separate search indexes or view-specific result sets that drift out of sync.
Switching Board, List and Map must never silently clear AI-applied filters, Quick Search keywords, date, category, location, price or sorting.
AI-generated filters and manually selected filters combine predictably. Removing one AI chip removes only that filter, not the entire search.
Quick Search adds a keyword constraint to the active filters; it does not overwrite them.
If a user starts a new AI search while manual filters are active, make the effect explicit. Prefer merging compatible constraints or offering a clear Replace/Keep choice rather than silently resetting the user's work.
Keep the result count, active filter chips and map pins/list rows/board cards in agreement.
Where the application supports shareable URLs, serialise relevant discovery state into query parameters so refresh, back/forward navigation and shared links restore the same results.
Provide a clear-all action, but do not make it the default outcome of switching views.
Suggested state contract: activeView, aiIntent, aiFilters[], quickKeyword, dateRange, timeWindow, categories[], location, radius, priceRange, freeOnly and sort. Adapt naming to the existing application architecture; do not create a competing state store if a suitable one already exists.
4. Board, List and Map — three first-class views
Keep all three views. They are complementary discovery modes, not cosmetic variations. The List/Timetable is a key differentiator and must receive deliberate design and interaction attention.
Keep the view switcher visible near the result count and filters. On mobile, it must remain reachable without forcing users back to the top of a long page. Map may open as a dedicated full-screen mode on phones, with an obvious return to results.
5. List / Timetable detailed specification
5.1 Desktop and wide screens
Use a full-width chronological list within the fluid content shell. Do not wrap each row in an oversized image card.
Recommended row height: approximately 88–112px depending on whether a thumbnail or secondary metadata line is present.
Use date group headers approximately 40–44px high; make them sticky within the results scroll region where this improves orientation.
Prioritise event time/date, event title and artist, venue, suburb/location, price and save action.
Use consistent column alignment so users can compare times and prices while scanning down the list.
Keep event title as the strongest text element; venue/location and secondary metadata use quieter contrast.
Allow long titles to wrap to two lines at most in the standard row; avoid variable-height rows caused by unbounded descriptions.
Make the save control immediately accessible, with a clear saved state and accessible name.
The Quick Search field and active filter chips remain visible in the List toolbar while scrolling where practical.
5.2 Mobile List / Timetable
Use a compact single-column row; do not shrink a desktop table until text becomes unreadable.
Use a small thumbnail around 72×72px or 88×66px only where imagery adds value; the text information remains primary.
Show time/date, event title, venue/suburb and price in a clear hierarchy, with a 44×44px minimum save/tap target.
Keep date group headers and the search/quick-filter controls easy to access during scrolling.
Use horizontally scrollable filter chips only as a deliberate pattern; do not allow accidental page-wide horizontal scrolling.
Avoid large empty card padding, oversized event imagery and repeated decorative elements that slow rapid scanning.
The List should feel like a beautifully designed live events timetable: dense enough to scan efficiently, but not cramped. It should be noticeably faster to use than opening individual visual cards.
6. Homepage and discovery page hierarchy
Homepage hero: clear promise, AI Discovery Search and optional suggested prompts.
Immediately below the hero: quick discovery chips such as Tonight, This weekend, Free and Music, provided the underlying filters exist.
Show relevant event content early; do not force users through multiple large control panels before results appear.
The main discovery area has a shared toolbar, active filters, result count and Board/List/Map switcher.
The List/Timetable Quick Search appears when List is selected and remains visually distinct from the homepage AI Discovery Search.
On Local and other discovery routes, preserve the same shared filter and view behaviour. Do not invent a second independent discovery experience.
7. Developer implementation and change-control requirements
Audit the existing website and repository before implementation: route inventory, current search behaviour, state management, API/search capabilities, view components and responsive breakpoints.
Capture current desktop and mobile screenshots and document existing behaviours that must remain unchanged.
Map the two search inputs to the existing event search service or a shared discovery service. Reuse the current event data model wherever possible.
Implement the shared state contract and view synchronisation before polishing individual view designs.
Update the global layout shell to fluid responsive sizing; remove the former 1280px global content cap and verify the 1440px, 1920px and ultrawide layouts.
Build the List/Timetable as a dedicated first-class component, not merely a Board card rendered without images.
Preserve current URLs, API contracts, authentication, analytics, SEO metadata, saved events, organiser ownership, payments and checkout behaviour.
Do not remove existing functionality or assume intended behaviour. Record any ambiguity and propose the change for approval before making a destructive or business-logic change.
If backend capabilities do not support a requested feature (for example typo tolerance), state the limitation and propose the smallest compatible implementation rather than faking the behaviour.
Test actual event data and empty/error states. Never replace live data with mock results to make the design appear complete.
8. New acceptance criteria — must pass before release
Search and shared state
A natural-language AI Discovery Search can interpret supported intent and return relevant event results with editable structured filters.
Users can browse without using AI search.
Quick Search is a separate conventional input in List/Timetable and searches events, artists, performers, venues and keywords.
Quick Search does not display a chatbot or conversational UI.
AI search and Quick Search operate on the same underlying event dataset.
Quick Search combines with active date, category, location, distance and price filters.
Switching Board/List/Map preserves all search terms, filters, sort order and result set.
Result counts and visible event IDs remain consistent across all three views.
Clear search and clear filters have distinct, understandable behaviour.
Responsive use of space
At 1440px and 1920px viewport widths, the application expands intelligently and does not remain trapped in a narrow 1280px container.
Event grids add columns only while card minimum widths remain usable.
Map, List/Timetable and promoter data tables use the available desktop width effectively.
Text blocks retain comfortable reading widths and controls do not become excessively stretched.
Mobile layouts remain readable and touch-friendly at 320px, 375px and 430px widths.
List / Timetable
List results are chronological and grouped by date.
Date headings remain visible where appropriate during scrolling.
Event name, time, venue, location and price can be scanned without opening an event.
Save/unsave is immediate and has an accessible state.
Quick Search remains accessible while navigating a long result list.
The mobile layout is compact and has no unintended horizontal overflow.
9. Updated QA viewport matrix
10. Updated quick reference
Version note: v1.1 supersedes conflicting v1.0 global-width and event-grid defaults. All other v1.0 brand, colour, typography, TummerBot, promoter, commercial, accessibility and engineering standards remain in force unless expressly amended above.