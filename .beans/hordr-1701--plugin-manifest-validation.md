---
# hordr-1701
title: herdr-plugin.toml manifest validation and link
status: completed
type: task
priority: medium
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T17:53:05Z
parent: hordr-1007
---

## Requirement

The manifest at `herdr-plugin.toml` must be valid, link successfully, and expose all actions in herdr's UI.

## Spec

Verify the manifest against the herdr plugin spec (id, name, version, min_herdr_version required; actions with id/title/contexts/command; events with on/command). Run `herdr plugin link .` in the project root. Verify with `herdr plugin action list --plugin herdr.hordr`.

## Acceptance Criteria

- [ ] `herdr plugin link .` succeeds with no warnings
- [ ] `herdr plugin list` shows `herdr.hordr` as enabled
- [ ] `herdr plugin action list --plugin herdr.hordr` shows all 10 actions
- [ ] Each action's command resolves to `hordr` on PATH

## Test Plan

Link in a running herdr session. List actions. Invoke one action (`status`) and verify it runs the `hordr status` command.

## Summary of Changes

The manifest at herdr-plugin.toml was already complete from project init (10 actions + 2 event hooks, valid against herdr 0.7.0 plugin schema).

Verified live:
- `herdr plugin link .` succeeds, registers herdr.hordr v0.1.0 as enabled.
- `herdr plugin list --plugin herdr.hordr` shows the plugin with all actions/events.
- `herdr plugin action list --plugin herdr.hordr` shows all 10 actions (plan, validate-spec, approve, run, advance, take, status, drain, reset, close-merged), each invoking the `hordr` binary.

Tests at test/commands/manifest.test.ts:
- 7 unit tests asserting manifest structure (metadata fields, action count = 10, event count = 2, every command references hordr, all SPEC §5 commands present as action ids).
- 3 integration tests (opt-in via IT_HERDR=1) that actually link + list actions against a running herdr session.
- 4 unit tests for the beanIdFromBranch helper used by event hooks.

No code changes — manifest was correct as-authored. Test coverage added.
