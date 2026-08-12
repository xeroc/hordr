---
# hordr-iqux
title: default_harness knob + hordr config example command
status: completed
type: task
priority: high
created_at: 2026-08-11T23:47:12Z
updated_at: 2026-08-12T01:23:55Z
---

Make the default agent harness easy to customize via .beans.yml: add a top-level default_harness field that fills any agent without an explicit harness (so one line flips all personas), and add a 'hordr config' command that prints a fully-commented .beans.yml hordr block to stdout for '>> .beans.yml' append.

## Summary of Changes

- **schema.ts**: added `default_harness` (default `'opencode'`) to `HordrConfigSchema`; made per-agent `harness` optional (empty = inherit).
- **loader.ts**: fill any agent with no explicit `harness` from `default_harness`; clone default agents during merge (fixes a latent shared-reference mutation that would have baked the first loader's harness into the module-level DEFAULT_AGENTS).
- **defaults.ts**: dropped hardcoded `harness: 'opencode'` from the four built-in agents so `default_harness` actually drives them.
- **commands/config.ts** (new): `hordr config` prints a fully-commented `.beans.yml` hordr block to stdout — pipe with `hordr config >> .beans.yml`.
- **.beans.yml**: simplified the repo's own config to use the new knob.
- Tests: schema/loader coverage for the knob + precedence, a parse-guard test asserting the generated example is valid YAML + schema-valid, and typed config literals updated across the suite.
