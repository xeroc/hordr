---
# hordr-1701
title: herdr-plugin.toml manifest validation and link
status: todo
type: task
priority: medium
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T00:00:00Z
parent: hordr-1007
order: G1
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
