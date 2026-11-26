<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Decorative blurs stay inside the viewport

A fixed or absolute `backdrop-filter` / `filter: blur()` paints past its box. On a phone that fringe shows up as a white glow on the right edge, over the hero next to the theme control. `overflow-x: clip` on `html` and `body` does not stop it.

- Frosted washes go through `components/decorative-glow.tsx`. The clip (`overflow: hidden` and `contain: paint`) lives on that element.
- Do not put `backdrop-filter` on `.vp-site-header` itself, and do not add `transform: translateZ(0)` to `.vp-photo-blur-img`. Both let the blur escape `overflow: hidden`.
- `e2e/edge-bleed.spec.ts` checks `/`, `/local` and `/discover` at 390px: `scrollWidth` stays within the viewport, and no blurred layer’s painted box crosses the viewport edge.
