---
# hordr-2upo
title: 'Base by invocation: current ref replaces primary_branch; fleet create works from jj/git workspaces'
status: completed
type: task
priority: normal
created_at: 2026-09-25T09:32:46Z
updated_at: 2026-09-25T09:33:34Z
---

Remove the primary_branch config. Base workspaces on the invocation directory's current ref (git branch / jj nearest ancestor bookmark). Record fleet base_ref; finish merges back into it. fleet create resolves the main checkout for beans reads + herdr ops, fixing bean-not-found from a jj workspace. registerFleet upsert fixes broken-fleet recovery.

## Summary of Changes

- `Vcs.currentRef(cwd)`: git — checked-out branch; jj — nearest ancestor bookmark (`heads(::@ & bookmarks())`, verified against jj 0.44). `resolveBaseRef` throws actionable `--base` hints on detached HEAD / un-bookmarked ancestry.
- `primary_branch` removed from schema, `hordr config`, docs, dogfood `.beans.yml` (old configs still load — zod strips).
- `hordr fleet create`: base = invocation dir's current ref, recorded on the fleet row (`fleets.base_ref`, guarded-ALTER migration); beans reads fall back to the main checkout (fixes `bean not found` from a jj/git workspace); git/herdr run against the main checkout.
- `hordr fleet finish` / `hordr finish` / `hordr run` / `hordr prompt`: base/target = current ref (`--base` overrides; `finish` gained the flag). Engine settle uses `fleet.baseRef`; jj + empty base parks in `conflict` instead of destroying the resolved merge.
- `registerFleet` upsert — broken-fleet recovery via `fleet create` no longer PK-conflicts.
- ADR-0016 documents the decision.
