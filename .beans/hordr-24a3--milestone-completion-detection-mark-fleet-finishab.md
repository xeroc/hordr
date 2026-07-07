---
# hordr-24a3
title: Milestone-completion detection → mark fleet finishable
status: todo
type: task
priority: normal
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T20:31:17Z
parent: hordr-nj9r
---

After rollup, if the milestone bean itself flipped to completed, mark the fleet row status=finishable so the human sees finish is green in fleet status. (The milestone completes via rollup reaching the root — no separate traversal.)
