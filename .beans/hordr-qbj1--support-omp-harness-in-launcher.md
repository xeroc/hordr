---
# hordr-qbj1
title: Support omp harness in launcher
status: in-progress
type: task
created_at: 2026-07-15T13:37:20Z
updated_at: 2026-07-15T13:37:20Z
---

Extend buildHarnessCommand to handle omp: bare invocation with @AGENTS.md include (opencode uses run --interactive, omp does not auto-load AGENTS.md). Wire into both launchAgent (launcher.ts) and spawnInvocation (spawn.ts).
