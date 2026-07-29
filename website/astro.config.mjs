import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

// ponytail: set this to the production origin before deploying.
// Leaves empty by default so we don't hardcode a guessed domain.
const site = process.env.HORDR_SITE ?? 'https://hordr.chainsquad.com'
const repo = 'https://github.com/xeroc/hordr'

export default defineConfig({
  site,
  integrations: [
    starlight({
      title: 'hordr',
      description: 'Isolated worktrees and fleet dispatch for coding agents.',
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: repo }],
      components: {
        Header: './src/components/Header.astro',
        SiteTitle: './src/components/SiteTitle.astro',
      },
      customCss: ['./src/styles/starlight.css'],
      editLink: { baseUrl: 'https://github.com/herdr/hordr/edit/main/website/' },
      lastUpdated: true,
      disable404Route: true,
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Overview', slug: 'docs' },
            { label: 'Install', slug: 'docs/install' },
            { label: 'Quick start', slug: 'docs/quick-start' },
            { label: 'Concepts', slug: 'docs/concepts' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Single-bean mode', slug: 'docs/single-bean' },
            { label: 'Fleet mode', slug: 'docs/fleet' },
            { label: 'Beans & planning', slug: 'docs/beans' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Configuration', slug: 'docs/configuration' },
            { label: 'Commands', slug: 'docs/commands' },
            { label: 'Architecture', slug: 'docs/architecture' },
          ],
        },
      ],
    }),
  ],
})
