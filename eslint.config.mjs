import {includeIgnoreFile} from '@eslint/compat'
import oclif from 'eslint-config-oclif'
import prettier from 'eslint-config-prettier'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const gitignorePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.gitignore')

// website/ is a standalone Astro/Starlight package with its own toolchain —
// never lint it with the CLI's oclif config.
const ignores = ['website/']

export default [includeIgnoreFile(gitignorePath), {ignores}, ...oclif, prettier]
