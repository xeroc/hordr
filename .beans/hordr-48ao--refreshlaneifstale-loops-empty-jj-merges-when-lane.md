---
# hordr-48ao
title: refreshLaneIfStale loops empty jj merges when lane is ahead of ms
status: in-progress
type: bug
created_at: 2026-09-10T19:48:52Z
updated_at: 2026-09-10T19:48:52Z
---

Symptom: riprap fleet accumulates empty changesets every cron pass (5min): an empty 'merge: ... (cross-epic refresh)' + an empty undescribed parked head, 1859+ pairs since Sep 2.

Root cause: refreshLaneIfStale (engine.ts, hordr-lcsi) treats 'ms-ready minus lane-ready' as 'lane is behind ms'. The signature is symmetric: when the LANE completed a task that ms has not merged back (epic incomplete, so no epic-to-ms merge), ms stays stale and the guard fires forever. The merge is empty (lane tree already contains ms), nothing becomes dispatchable, next pass repeats.

Fix: ancestry guard before integrateHead — if the ms head is already an ancestor of the lane head, there is nothing to pull; skip the merge (log lane-ahead, treat as no-work). jj: '<source>@ & ::@' probe; git: 'git merge-base --is-ancestor source HEAD'.

Cleanup: abandon the empty cross-epic refresh chain in the riprap repo.
