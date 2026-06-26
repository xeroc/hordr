# Hordr is a standalone OCLIF binary registered as a herdr plugin

Hordr is a standalone TypeScript CLI built with OCLIF and installed globally (`npm install -g hordr`). It registers with herdr via a `herdr-plugin.toml` manifest whose action/event commands reference the global `hordr` binary on PATH. This keeps hordr's release cycle, dependencies, and language choice independent from herdr and beans, while still surfacing its actions in the herdr UI. Rejected alternatives: folding hordr into herdr core (couples release cycles, herdr is Rust), or into beans (scope creep, beans is Go).
