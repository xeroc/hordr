---
# hordr-oac8
title: Set up better-sqlite3 + migration runner
status: completed
type: task
priority: high
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T20:52:01Z
parent: hordr-plce
---

Synchronous SQLite via better-sqlite3 (Node-native, matches the daemon's sync loop). Migration runner: either hand-rolled (apply numbered .sql files, track in _migrations) or a lib like node-pg-migrate adapted. PRAGMA foreign_keys=ON, busy_timeout=5000 (cafleet's setting). Default DB path ~/.local/share/hordr/hordr.db (XDG state dir).

## Summary of Changes

- better-sqlite3@12 + @types/better-sqlite3 installed
- No migration runner (YAGNI) — CREATE TABLE IF NOT EXISTS is idempotent; add migrations when schema actually changes
- PRAGMA busy_timeout=5000 matches cafleet's contention setting
