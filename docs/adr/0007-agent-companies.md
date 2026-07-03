# Agent Companies support

Hordr loads agent personas (and harness bindings) from an Agent Companies package when one is configured. A company package is a directory with `agents/<role>/AGENTS.md` files (frontmatter + body), optional `skills/<slug>/SKILL.md`, and a `projects/<slug>/PROJECT.md` map.

Two entry modes:

- **Vault entry** (`HORDR_COMPANY=<path> HORDR_PROJECT=<slug>`): hordr resolves the project's working directory from `PROJECT.md` and `chdir`s there before searching for `.beans.yml`. Used when launching hordr from the company vault.
- **Project entry** (`hordr.company.path` in `.beans.yml`): no chdir (already in the project); the company package is just a persona source.

When active, every `agents/<role>/AGENTS.md` with a `harness:` frontmatter field overrides the matching role in config — the body becomes the persona, declared skills are inlined as an `--- Attached Skills ---` block. Roles without `harness:` are skipped (non-executable roles like a CEO). Roles in `.beans.yml` without a matching AGENTS.md are kept as fallback.

Rationale: personas are long, version-controlled artifacts that belong alongside the agent definition, not crammed into a YAML string. Agent Companies gives them a home with skill composition, and lets one vault drive many projects. The two-phase resolution (env-then-config) handles both "I'm in the vault, go to the project" and "I'm in the project, just load personas" without a flag.
