## Layout

The root layout, `app/layout.tsx`, is the single place for app-wide providers and global infrastructure.

**Do not remove any existing entries without a reason.** Current infrastructure in the layout:

| Entry | Purpose |
|-------|---------|
| `ThemeProvider` | Light/dark mode via `next-themes` |
| `Toaster` | Global toast notifications via Sonner |
| `ChunkLoadErrorHandler` | Required — prevents known ChunkLoadError race condition bug |

---

## Typography

| Role | Font | Tailwind Class | Default Usage |
|------|------|---------------|-------|
| Body | Inter | `font-sans` | All body text, labels, descriptions |
| Display | Manrope | `font-display` | Page titles, hero headings, section headers |
| Mono | Inter | `font-mono` | Numeric data, IDs, timestamps |

**Size hierarchy:** Use the type tokens. `text-display`, `text-h1`, `text-h2`, `text-h3`, `text-body`, `text-small`, `text-xs` (13px), `text-caption` (12px). Nothing smaller than 12px. Eyebrows use `.vp-eyebrow` (12px, semibold, uppercase, tracking 0.16em). Do not use `text-[Npx]`.

---

## Color System (Design Tokens)

All colors use CSS variables — **never hardcode color values**.

| Token | Purpose |
|-------|---------|
| `background` / `foreground` | Page-level bg and text |
| `card` / `card-foreground` | Card surfaces |
| `primary` / `on-primary` | Brand orange `#FF7A35`. Ink on that orange is `#1A1408` (`text-on-primary`). Pink is `#F05A9D` (`brand-pink`). |
| `secondary` / `secondary-foreground` | Secondary buttons, subtle highlights |
| `muted` / `muted-foreground` | Disabled states, helper text, subtle backgrounds |
| `accent` / `accent-foreground` | Hover states, active nav items |
| `destructive` / `destructive-foreground` | Errors, delete actions |
| `border` | Borders and dividers |
| `input` | Form input borders |
| `ring` | Focus rings |

Usage: `bg-primary`, `text-on-primary`, `text-brand-pink`, `bg-brand-orange`, `text-muted-foreground`, `border-border`. Raw hex in TSX belongs in `lib/brand.ts`, `lib/categories.ts`, `lib/tiers.ts` or `lib/design-tokens.ts`, not in a page.

---

## Spacing Scale

One rhythm. The same role uses the same gap on every page.

| Token | Value | Tailwind |
|-------|-------|----------|
| `--vp-card-pad-sm` | 12px | `p-card-sm` |
| `--vp-card-pad-md` | 16px | `p-card`, `gap-card` |
| `--vp-card-pad-lg` | 24px | `p-card-lg` |
| `--vp-card-gap` | 16px | `gap-[var(--vp-card-gap)]` |
| `--vp-hero-gap` | 16px | `mt-hero`, `pt-hero` |
| `--vp-section` | 48px, 64px from `lg` | `mt-section` |
| `--vp-control-h` | 44px | `h-control` |
| `--vp-control-h-lg` | 48px | `h-control-lg` |

Page gutters are `px-4 sm:px-6` inside `Page`. The hero-to-content gap on the four tabs is 16px.

---

## Shadow Scale

| Token | Tailwind | Default Usage |
|-------|----------|---------------|
| `--vp-shadow-sm` | `shadow-vp-sm` | Cards |
| `--vp-shadow-md` | `shadow-vp-md` | Dropdowns, popovers |
| `--vp-shadow-lg` | `shadow-vp-lg` | Modals, marketing panels |

---

## Border Radius

| Token | Value | Tailwind | Default Usage |
|-------|-------|----------|---------------|
| `--radius` / `--vp-radius-control` | 12px | `rounded-control` | Inputs and square controls |
| `--vp-radius-card` | 16px | `rounded-card` | Cards |
| `--vp-radius-hero` | 24px | `rounded-hero` | Heroes and large panels |
| pill | 9999px | `rounded-full` | Buttons, chips, avatars |

---

## Animation Timing

| Token | Value | Tailwind Class | Default Usage |
|-------|-------|---------------|-------|
| `--duration-fast` | 150ms | `duration-fast` | Hover states, toggles |
| `--duration-normal` | 250ms | `duration-normal` | Page transitions, reveals |
| `--duration-slow` | 350ms | `duration-slow` | Complex animations, modals |

---

## Layout Components

### `Page` — `@/components/layout/page`
Gutters and width. `width` is `full`, `prose` or `narrow`. Every page lines up with the header at `sm` and above.

### `PageHeader` — `@/components/layout/page-header`
Eyebrow, `text-h1` title, lede and actions. Use it on pages that are not one of the four tab heroes.

### `Section` / `SectionHeader` — `@/components/layout/section`
One section gap (`mt-section`). Headings are `text-h2` or `text-h3`.

### `Surface` — `@/components/ui/surface`
The card. `pad` is `sm`, `md` or `lg`. `tone` is `card`, `muted`, `dark` or `dashed`.

### `AuthShell` — `@/components/auth-shell`
Sign-in, sign-up, password and verify. The VibePeep logo stays the shared lockup.

`scripts/check-design.ts` fails the unit job on legacy brand hex, `text-[Npx]`, type under 12px, and raw hex or hand-rolled orange pills on the pages this guide covers. Email templates and the mascot files are outside that check.

---

## Animation Components — `@/components/ui/animate`

| Component | Default Usage | Key Props |
|-----------|-------|-----------|
| `FadeIn` | Reveal content on scroll | `delay`, `duration` |
| `ScaleIn` | Pop-in effect | `delay` |
| `SlideIn` | Directional entrance | `from` (`top`\|`bottom`\|`left`\|`right`), `delay` |
| `Stagger` + `StaggerItem` | Sequential reveal for lists/grids | `staggerDelay` |
| `HoverLift` | Lift effect on hover (cards, links) | — |
| `PressScale` | Press-down feedback for buttons | — |
| `SkeletonPulse` | Loading placeholder | `className` (set width/height) |

**Pattern:** Wrap page sections in `FadeIn`, list items in `Stagger`/`StaggerItem`, interactive cards in `HoverLift`.

---

## UI Components — `@/components/ui/`

### Core
| Component | Import | Key Props |
|-----------|--------|-----------|
| `Button` | `@/components/ui/button` | `variant` (`default`\|`secondary`\|`outline`\|`ghost`\|`destructive`\|`link`\|`glass-dark`\|`glass-light`), `size` (`default`\|`xs`\|`sm`\|`lg`\|`icon`\|`icon-sm`), `loading` (boolean). **`glass-dark`**: for dark/vivid backgrounds. **`glass-light`**: for light/pale backgrounds. **Link**: focus uses underline, not ring. |
| `Badge` | `@/components/ui/badge` | `variant` (`default`\|`secondary`\|`outline`\|`destructive`) |
| `Card` | `@/components/ui/card` | `variant` (`default`\|`interactive`\|`glass-dark`\|`glass-dark-interactive`\|`glass-light`\|`glass-light-interactive`\|`ghost`). Composed: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`. **Interactive**: always wrap in `<a>` or `<button>` for keyboard access. |
| `Separator` | `@/components/ui/separator` | `orientation` (`horizontal`\|`vertical`) |

### Forms
| Component | Import |
|-----------|--------|
| `Input` | `@/components/ui/input` | `variant` (`default`\|`error`\|`success`\|`ghost`), `size` (`default`\|`sm`\|`lg`) |
| `Textarea` | `@/components/ui/textarea` | `variant` (`default`\|`error`\|`success`\|`ghost`) |
| `Label` | `@/components/ui/label` |
| `Select` | `@/components/ui/select` |
| `Checkbox` | `@/components/ui/checkbox` |
| `RadioGroup` | `@/components/ui/radio-group` |
| `Switch` | `@/components/ui/switch` |
| `Slider` | `@/components/ui/slider` |
| `Calendar` | `@/components/ui/calendar` |
| `DateRangePicker` | `@/components/ui/date-range-picker` |
| `InputOTP` | `@/components/ui/input-otp` |
| `Form` | `@/components/ui/form` (react-hook-form integration) |

### Navigation & Layout
| Component | Import |
|-----------|--------|
| `Tabs` | `@/components/ui/tabs` — `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` |
| `Accordion` | `@/components/ui/accordion` — `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` |
| `NavigationMenu` | `@/components/ui/navigation-menu` |
| `Breadcrumb` | `@/components/ui/breadcrumb` |
| `Pagination` | `@/components/ui/pagination` |
| `Menubar` | `@/components/ui/menubar` |
| `ScrollArea` | `@/components/ui/scroll-area` |
| `Resizable` | `@/components/ui/resizable` |

### Overlays & Feedback
| Component | Import |
|-----------|--------|
| `Dialog` | `@/components/ui/dialog` |
| `AlertDialog` | `@/components/ui/alert-dialog` |
| `Sheet` | `@/components/ui/sheet` — side-panel overlay |
| `Drawer` | `@/components/ui/drawer` — bottom sheet (great for mobile) |
| `Popover` | `@/components/ui/popover` |
| `Tooltip` | `@/components/ui/tooltip` |
| `HoverCard` | `@/components/ui/hover-card` |
| `ContextMenu` | `@/components/ui/context-menu` |
| `DropdownMenu` | `@/components/ui/dropdown-menu` |
| `Command` | `@/components/ui/command` — command palette / searchable list |
| `Alert` | `@/components/ui/alert` |
| `toast` | `import { toast } from 'sonner'` — `toast.success()`, `toast.error()` |

### Data Display
| Component | Import |
|-----------|--------|
| `Table` | `@/components/ui/table` — `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` |
| `Avatar` | `@/components/ui/avatar` |
| `Progress` | `@/components/ui/progress` |
| `Skeleton` | `@/components/ui/skeleton` |
| `AspectRatio` | `@/components/ui/aspect-ratio` |
| `Carousel` | `@/components/ui/carousel` |

### Misc
| Component | Import |
|-----------|--------|
| `Toggle` | `@/components/ui/toggle` |
| `ToggleGroup` | `@/components/ui/toggle-group` |
| `Collapsible` | `@/components/ui/collapsible` |
| `ThemeToggle` | `@/components/theme-toggle` — light/dark mode switch |
## SSR / Hydration Safety — `@/components/client-only`, `@/components/safe-format`
Server-rendered HTML must match the client's first render. An automated SSR lint
(`eslint.ssr.config.mjs` — do not delete) runs after every build and fails it on unsafe
patterns. Use these primitives instead of hand-rolling fixes:
| Primitive | Import | Use for |
|-----------|--------|---------|
| `ClientOnly` | `@/components/client-only` | Anything browser-only or non-deterministic: `window`/`localStorage` reads, live clocks, random values, third-party widgets. Pass a `fallback` sized like the content. |
| `useMounted()` | `@/components/client-only` | Hook variant when you need the boolean directly. |
| `SafeDate` / `SafeTime` | `@/components/safe-format` | Dates/times — formats with explicit locale + UTC so SSR matches client. `localize` re-renders in the visitor's timezone after mount. Props: `date` (Date\|string\|number), `options?` (Intl.DateTimeFormatOptions), `locale?`, `localize?`, `className?` — there is no `format`/`value` prop; e.g. `<SafeDate date={post.createdAt} options={{ dateStyle: 'medium' }} />`. |
| `SafeNumber` | `@/components/safe-format` | Numbers/currency, same guarantees. Props: `value` (number), `options?` (Intl.NumberFormatOptions), `currency?` (`currency="USD"`), `locale?`, `localize?`, `className?`. |
Rules of thumb: never touch `window`/`document` at module scope; never seed `useState` with
`Date.now()`/`Math.random()`/`new Date()`; never call `toLocaleString`-style methods without
an explicit locale (and `timeZone` for dates).
