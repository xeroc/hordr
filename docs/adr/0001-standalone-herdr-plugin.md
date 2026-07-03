# Standalone OCLIF binary as a herdr plugin

Hordr ships as a standalone OCLIF 4 binary (`bin/run.js` → `dist/`) rather than being embedded in herdr. It registers with herdr as a plugin via `herdr-plugin.toml` (actions + event hooks), but the hordr codebase has no herdr-internal dependencies — it shells out to the `herdr` and `beans` CLIs like any other process would.

Rationale: keeps the herdr and hordr release cycles decoupled, lets hordr be developed/tested in isolation (the `herdr` shell seam is mockable), and means hordr works the same way whether invoked as a herdr plugin action or directly from the shell. The cost is a binary on PATH + the usual Node runtime — acceptable for a local-only developer tool.
