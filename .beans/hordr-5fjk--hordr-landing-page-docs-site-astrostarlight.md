---
# hordr-5fjk
title: Hordr landing page + docs site (Astro/Starlight)
status: completed
type: feature
priority: high
created_at: 2026-07-29T06:34:04Z
updated_at: 2026-07-29T06:47:19Z
---

Replicate the framework/boilerplate of herdr/website (Astro + Starlight, Tokyo Night palette, custom SiteTitle/Header, public/ assets) into hordr/website — LEAN, no marketing fluff (no theme switcher, no plugins/blog/compare, no preview channel). Then bring hordr-specific docs content only. Landing: lean hero + feature triad + snippet. Docs sidebar: Start here (Overview, Install, Quick start, Concepts), Guides (Single-bean, Fleet, Beans & planning), Reference (Configuration, Commands, Architecture).

## Summary of Changes

Framework (lean — no herdr marketing fluff):
- website/package.json — Astro 5 + Starlight 0.36 (dev/build/preview; no prepare-docs).
- website/astro.config.mjs — Starlight, hordr brand + sidebar, GitHub social/edit links, site via $HORDR_SITE (default https://hordr.dev).
- website/src/content.config.ts — docs collection only (no blog).
- website/src/styles/starlight.css — Tokyo Night palette + typography, hordr styling (dropped herdr-mask.svg logo refs).
- website/src/components/{SiteTitle,Header}.astro — lean overrides (brand mark + Docs/GitHub nav; NO preview/stable switcher, NO Sidebar override).
- website/src/pages/index.astro — lean landing: hero + feature triad + snippet + footer; palette imported as a module (bundled, not raw /src link — fixed broken prod CSS).
- website/public/{favicon.svg,_headers,robots.txt} — served at root; favicon is an inline-SVG herd chevron (no binary asset). Dropped herdr's _redirects (no legacy paths) + install scripts/latest.json/agent-detection (not hordr).

Content (hordr-only, 10 pages): index (splash), install, quick-start, concepts, single-bean, fleet, beans, configuration, commands, architecture.

Verified: bun run build → 11 pages + sitemap; all routes 200; landing renders Tokyo Night palette (light/dark via prefers-color-scheme); docs render Starlight chrome + sidebar + brand. chrome-devtools DOM check confirmed structure (no image input available for screenshot).

Out of scope / skipped: theme switcher palette UI, plugins/blog/compare pages, preview docs channel, prepare-docs script.
