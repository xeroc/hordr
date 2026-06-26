---
# hordr-1501
title: Harness resolution + persona injection
status: completed
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T10:21:28Z
parent: hordr-1005
---

## Requirement

Resolve the harness binary from config and PATH, build the opening prompt (persona + bean context), and send it to the pane.

## Spec

Create `src/harness/launcher.ts`. `resolveHarness(role, config)` → looks up `config.hordr.agents[role].harness`, checks it's on PATH, returns binary name or throws. `buildOpeningPrompt(role, config, bean)` → concatenates persona text + bean context (id, title, requirement, acceptance criteria). `launchAgent({workspaceId, beanId, role, config, bean})` → splits a labeled pane, starts the harness binary, sends the opening prompt.

## Acceptance Criteria

- [ ] Unknown harness name → throws with "harness '<name>' not on PATH"
- [ ] Opening prompt contains the persona text verbatim
- [ ] Opening prompt contains the bean id and acceptance criteria
- [ ] Pane is labeled `hordr:<bean-id>:<role>`
- [ ] Harness binary receives the prompt as its first input

## Test Plan

Unit test resolveHarness (found / not found). Unit test buildOpeningPrompt output contains required fields. Integration: launch, read pane, verify prompt arrived.

## Summary of Changes

- src/harness/launcher.ts: resolveHarness(role, config), buildOpeningPrompt(role, config, beanId), launchAgent({workspaceId, beanId, role, cwd}).
- resolveHarness: command -v <harness>; throws HarnessError("harness '<name>' not on PATH") exact AC message.
- buildOpeningPrompt: persona verbatim + '---' + Bean: <id> + Title + ## Requirement section + ## Acceptance Criteria section (or '(missing)' per section).
- launchAgent: loadConfig + resolveHarness + buildOpeningPrompt + herdr pane split --label hordr:<beanId>:<role> --cwd + send-text harness + send-text prompt. Returns {paneLabel}.
- Seams: _setHerdrForTesting (herdr shell-out), _setWhichForTesting (PATH check). Reuses beans client seams for bean body reads.
