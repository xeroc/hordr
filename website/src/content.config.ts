import {defineCollection} from 'astro:content'
import {docsLoader} from '@astrojs/starlight/loaders'
import {docsSchema} from '@astrojs/starlight/schema'

function docsPath({entry}: {entry: string}) {
  const slug = entry.replace(/\.(md|mdx|markdown|mdown|mkdn|mkd|mdwn)$/i, '')
  const normalized = slug.replace(/\/index$/, '')
  return normalized === 'index' ? 'docs' : `docs/${normalized}`
}

export const collections = {
  docs: defineCollection({loader: docsLoader({generateId: docsPath}), schema: docsSchema()}),
}
