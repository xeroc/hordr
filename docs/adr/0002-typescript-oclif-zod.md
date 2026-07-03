# TypeScript + OCLIF + Zod

Hordr is TypeScript 5 (ESM, strict), built on OCLIF 4 for the CLI surface and Zod 3 for runtime validation (config schema, bean shape). Bun is the package manager/dev runner; Node 18+ runs the compiled `dist/`.

Rationale: OCLIF gives us arg parsing, help generation, and command discovery for free and is the same framework herdr uses, so the two CLIs feel symmetric. Zod validates the `.beans.yml` block and the `beans show --json` envelope at the trust boundary, producing targeted error messages without hand-rolled checks. TypeScript strict catches the shape errors the dynamic shell wrappers (herdr, beans, git) would otherwise surface at runtime.
