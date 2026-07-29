# hordr website

Lean landing page and documentation site for [hordr](https://github.com/herdr/hordr),
the herdr plugin that gives coding agents isolated git worktrees and fleet
dispatch. Built with **Astro** and **Starlight**, themed in Tokyo Night.

This directory is self-contained — it has its own `package.json` and is
independent of the hordr CLI's build. Install, run, and deploy from here.

## Key features

- **Static output** — builds to plain HTML/CSS/JS in `dist/`; host anywhere.
- **Starlight docs** — sidebar, search (Pagefind), last-updated, edit links.
- **Lean landing page** — single `index.astro`, palette-driven, no client theme switcher.
- **Tokyo Night palette** — one CSS file drives both the landing and the docs.
- **Zero binary assets** — favicon is inline SVG; fonts use local `JetBrains Mono`.
- **hordr-only content** — 10 docs pages covering install, modes, beans, commands.

---

## Table of contents

- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Project structure](#project-structure)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Authoring docs](#authoring-docs)
- [Customization](#customization)
- [Environment variables](#environment-variables)
- [Available scripts](#available-scripts)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Tech stack

- **Framework**: [Astro](https://astro.build) `^5.0.0`
- **Docs**: [@astrojs/starlight](https://starlight.astro.build) `^0.36.0`
- **Search**: [Pagefind](https://pagefind.app) (bundled by Starlight)
- **Language**: TypeScript + MDX
- **Package manager**: [Bun](https://bun.sh) (npm/pnpm/yarn also work)
- **Palette**: Tokyo Night (dark default, light variant)
- **Fonts**: Inter (sans), JetBrains Mono (mono, resolved locally)

## Prerequisites

- **Node.js 18.14+** or **Bun 1.1+** (Bun is used throughout this README)
- A git checkout of the hordr repo

No database, no API keys, no secrets. The site is fully static.

## Getting started

### 1. Enter the directory

```bash
cd website
```

### 2. Install dependencies

```bash
bun install
```

### 3. Start the dev server

```bash
bun run dev
```

Open [http://localhost:4321](http://localhost:4321). Hot reload is live — edit a
doc or component and the browser refreshes.

### 4. Build for production

```bash
bun run build
```

Output lands in `dist/`:

```
dist/
├── index.html              # landing page
├── docs/                   # rendered docs (one folder per page)
├── _astro/                 # hashed JS/CSS chunks
├── pagefind/               # search index
├── favicon.svg
├── robots.txt
├── _headers                # Cloudflare Pages headers
├── sitemap-0.xml
└── sitemap-index.xml
```

### 5. Preview the production build

```bash
bun run preview
```

Serves `dist/` locally (default [http://localhost:4321](http://localhost:4321))
so you can verify the built site exactly as a host will serve it.

> [!TIP]
> Always `bun run preview` after `build` if you change CSS or imports — the dev
> server resolves `/src/...` paths that the production build bundles. Preview
> catches bundling mistakes dev hides.

## Project structure

```
website/
├── astro.config.mjs          # Starlight config: brand, sidebar, social, edit links
├── package.json              # scripts + Astro/Starlight deps
├── bun.lock
├── README.md
├── public/                   # served at site root, copied verbatim to dist/
│   ├── favicon.svg           # inline-SVG herd mark
│   ├── _headers              # Cloudflare Pages security + cache headers
│   └── robots.txt
└── src/
    ├── pages/
    │   └── index.astro       # landing page (standalone, palette-driven)
    ├── content/
    │   └── docs/             # Starlight docs source (MDX)
    │       ├── index.mdx            # Overview (splash template)
    │       ├── install.mdx
    │       ├── quick-start.mdx
    │       ├── concepts.mdx
    │       ├── single-bean.mdx
    │       ├── fleet.mdx
    │       ├── beans.mdx
    │       ├── configuration.mdx
    │       ├── commands.mdx
    │       └── architecture.mdx
    ├── components/           # lean Starlight overrides
    │   ├── SiteTitle.astro   # brand mark + Docs/GitHub nav
    │   └── Header.astro      # search + social + theme/language selects
    ├── content.config.ts     # docs collection (Starlight loader + schema)
    └── styles/
        └── starlight.css     # Tokyo Night palette + typography (shared)
```

## Architecture

### Two page types

1. **Landing** (`src/pages/index.astro`) — a plain Astro page, **not** a
   Starlight page. It imports `starlight.css` to reuse the Tokyo Night CSS
   variables, sets `data-theme` from `prefers-color-scheme`, and renders its own
   header/hero/footer. No client-side theme switcher.

2. **Docs** (`src/content/docs/*.mdx`) — rendered by Starlight with the full
   docs chrome: sidebar, table of contents, search, last-updated, edit link, and
   prev/next pagination.

### How a doc is rendered

1. Astro reads `astro.config.mjs` → the Starlight integration.
2. `src/content.config.ts` loads `src/content/docs/*.mdx` via Starlight's
   `docsLoader`, generating URL slugs (`index` → `/docs/`, `fleet` →
   `/docs/fleet/`).
3. The `sidebar` array in `astro.config.mjs` defines grouping and order.
4. Starlight overrides (`SiteTitle`, `Header`) replace the default chrome.
5. `starlight.css` is injected via `customCss`, applying the Tokyo Night
   variables and typography.
6. At build, Pagefind indexes the rendered HTML for the search box.

### Component overrides

Only two Starlight components are overridden — everything else uses the
default:

| Override          | Replaces                                                  |
| ----------------- | --------------------------------------------------------- |
| `SiteTitle.astro` | Brand mark (inline SVG) + `Docs` / `GitHub` nav links     |
| `Header.astro`    | Lean header: search + social icons + theme/language picks |

The `Sidebar` is **not** overridden — hordr uses Starlight's default sidebar
(herdr overrides it only for a stable/preview channel hordr does not have).

### The palette

A single source of truth: `src/styles/starlight.css`. It defines the Starlight
CSS custom properties (`--sl-color-*`) for both `:root[data-theme="dark"]`
(default) and `:root[data-theme="light"]`. Both the landing and the docs read
these variables, so changing the palette in one file restyles the whole site.

## Configuration

All site behavior lives in [`astro.config.mjs`](./astro.config.mjs):

```js
const site = process.env.HORDR_SITE ?? 'https://hordr.dev'
const repo  = 'https://github.com/herdr/hordr'

starlight({
  title: 'hordr',
  description: 'Isolated worktrees and fleet dispatch for coding agents.',
  favicon: '/favicon.svg',
  social: [{icon: 'github', label: 'GitHub', href: repo}],
  components: { Header, SiteTitle },      // overrides
  customCss: ['./src/styles/starlight.css'],
  editLink: {baseUrl: 'https://github.com/herdr/hordr/edit/main/website/'},
  sidebar: [ /* Start here · Guides · Reference */ ],
})
```

- **`site`** — the production origin, read from `$HORDR_SITE`. Used for the
  sitemap and canonical/OG URLs. Set it to your real domain before deploying.
- **`sidebar`** — the docs navigation. Each entry is `{label, slug}`; `slug`
  matches the file in `src/content/docs/` (without extension).
- **`editLink.baseUrl`** — where the "Edit page" link points.

## Authoring docs

Add a page in three steps:

1. **Create the file** — `src/content/docs/my-topic.mdx`. Frontmatter needs at
   least `title` and `description`:

   ```mdx
   ---
   title: My topic
   description: One-line summary for SEO and sidebar tooltips.
   ---

   ## Section

   Write here. MDX is supported — import Starlight components:

   import {Card, CardGrid} from '@astrojs/starlight/components'

   <CardGrid>
     <Card title="X">…</Card>
   </CardGrid>
   ```

2. **Register it in the sidebar** — add
   `{label: 'My topic', slug: 'docs/my-topic'}` to the right group in
   `astro.config.mjs`.

3. **Verify** — `bun run dev`, open `/docs/my-topic/`.

> [!IMPORTANT]
> The slug is derived from the filename by `docsPath` in `content.config.ts`:
> `index` → `/docs/`, any other name → `/docs/<name>`. The `slug` in the sidebar
> must match exactly, or the link 404s.

### The overview splash

`src/content/docs/index.mdx` uses `template: splash` with a `hero` block — this
renders the large landing-style header inside the docs. Edit its `actions` and
`CardGrid` to change the docs front door.

## Customization

### Change the palette

Edit the `--sl-color-*` variables in `src/styles/starlight.css`. Both the
landing and docs restyle automatically. Keep the dark set as the default
(`:root` with no qualifier).

### Change the brand mark

The herd-chevron SVG appears in three places — keep them in sync:

- `public/favicon.svg` — the browser tab icon.
- `src/components/SiteTitle.astro` — the sidebar/header mark.
- `src/pages/index.astro` — the landing header mark.

### Change nav links

- **Docs header nav** — `src/components/SiteTitle.astro` (`Docs`, `GitHub`).
- **Landing nav** — `src/pages/index.astro` (`.nav-links`).
- **Footer** — `src/pages/index.astro` (`.site-footer`).

## Environment variables

Only one, and it is optional for local dev:

| Variable     | Description                                          | Default            |
| ------------ | ---------------------------------------------------- | ------------------ |
| `HORDR_SITE` | Production origin, used for sitemap + canonical URLs | `https://hordr.dev`|

```bash
HORDR_SITE=https://docs.example.com bun run build
```

> [!NOTE]
> Leaving `HORDR_SITE` at the default only affects absolute URLs (sitemap, OG
> tags). Local dev and preview are unaffected.

## Available scripts

| Command            | Description                                            |
| ------------------ | ------------------------------------------------------ |
| `bun run dev`      | Start the dev server with hot reload (port 4321)       |
| `bun run build`    | Build the static site to `dist/` (runs Pagefind index) |
| `bun run preview`  | Serve the built `dist/` locally to verify production   |

`bun install` (no script) installs dependencies into `node_modules/`.

## Deployment

The site builds to a static `dist/`. Any static host works. Set
`HORDR_SITE` to your production origin in the host's environment variables
before building.

### Cloudflare Pages (recommended — `_headers` is respected)

1. Connect the GitHub repo.
2. **Build settings:**
   - **Framework preset:** Astro
   - **Root directory:** `website`
   - **Build command:** `bun run build`
   - **Build output directory:** `dist`
3. **Environment variables:** add `HORDR_SITE=https://your-domain`.
4. Deploy. `_headers` and `robots.txt` are served from `dist/` automatically.

### Netlify

- **Base directory:** `website`
- **Build command:** `bun run build`
- **Publish directory:** `dist`
- Env var: `HORDR_SITE`. (Move `public/_headers` content into a `netlify.toml`
  `[headers]` block if you want Netlify-native headers — the Cloudflare
  `_headers` file is ignored by Netlify.)

### Vercel

- **Root directory:** `website`
- **Framework preset:** Astro (auto-detected)
- **Build command:** `bun run build`
- **Output directory:** `dist` (auto)
- Env var: `HORDR_SITE`.

### Any static host / manual

```bash
HORDR_SITE=https://your-domain bun run build
# upload dist/ to your host (S3, nginx, Caddy, GitHub Pages, …)
```

For GitHub Pages, remember to set `site`/`base` appropriately and serve from the
repo's pages root if it is a project site.

## Troubleshooting

### Landing page is unstyled in production but fine in dev

**Cause:** the page referenced a raw `/src/...` stylesheet path that the dev
server resolves but the build does not bundle.

**Fix:** the landing imports the CSS in its frontmatter
(`import '../styles/starlight.css'`). If you add another standalone page, import
the CSS rather than `<link>`-ing a `/src/` path, and verify with
`bun run preview`.

### A docs link 404s

**Cause:** the `slug` in `astro.config.mjs` does not match the filename in
`src/content/docs/`.

**Fix:** filenames map to slugs as `my-topic.mdx` → `docs/my-topic` (and
`index.mdx` → `docs`). Make the sidebar `slug` match exactly.

### Search returns nothing

**Cause:** Pagefind only indexes built HTML.

**Fix:** Pagefind runs during `bun run build` — it does not exist in dev. Run
`bun run build && bun run preview` to test search.

### `bun install` fails on the Starlight dependency

**Cause:** old Bun, or a corrupt lockfile.

**Fix:** upgrade Bun (`curl -fsSL https://bun.sh/install | bash`), then
`rm -rf node_modules bun.lock && bun install`.

### Edit link points at the wrong branch

**Cause:** `editLink.baseUrl` in `astro.config.mjs` is hardcoded to `main`.

**Fix:** point it at your working branch, or open the PR and merge before the
docs go live.

### Fonts look wrong

**Cause:** the site falls back to system fonts if `JetBrains Mono` / `Inter`
are not installed locally.

**Fix:** this is intentional — no web-font payload is shipped. Install the
fonts locally for development, or add a `@font-face` `src: url(...)` to
`starlight.css` to self-host them in production.
