# Unix-socket daemon (stub, grows later)

> **Superseded by ADR-0012 (daemon-as-broker with SQLite) on 2026-07-07. Kept for history.**
> The daemon is no longer a stub — it is the broker, owning the dispatch loop, `/done` route, rollup, and self-heal poll, backed by SQLite process state. The "currently answers GET /health only" and "grows later" framing below is now actively wrong; the fleet work is the growth this ADR anticipated.

Hordr keeps a long-running daemon (`hordr daemon`) that listens on a unix socket (`$HORDR_SOCKET`, default `~/.hordr/hordr.sock`) and currently answers `GET /health` only. All other routes return 404.

Rationale: agents will need to talk back to hordr — to report completion, request review, declare a block, surface artifacts. A unix socket is the right transport for that (fs perms = auth, no port allocation, no CORS, no token) and keeping the server process alive means future endpoints slot in without re-plumbing the discovery story. The prompt does **not** reference the daemon yet, because there is nothing useful for an agent to call. The daemon exists so the _plumbing_ is stable when the _features_ arrive.

The alternative — dropping the daemon entirely and re-adding it when the first agent-facing route is needed — was rejected because the socket-path resolution, signal handling, and "is the daemon up?" probe are the fiddly parts; the route handlers are trivial. Keeping the stub means the first real endpoint is a 10-line change, not a process-model redesign.

This partially reverses the original "no daemon" decision (old ADR-0004): hordr now has a daemon process, but it is a passive listener, not a scheduler. It owns no state, drives nothing.
