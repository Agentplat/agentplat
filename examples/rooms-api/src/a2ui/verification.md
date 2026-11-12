# A2UI pilot verification — 2026-11-12

Status: bounded local browser/PostgreSQL verification. This record does not
establish production readiness or general A2UI interoperability.

## Environment and observed flow

Used the actual `examples/rooms-api/src/index.mjs`, linked AgentPlat packages,
Node.js 24.20.0, Chrome and a dedicated local `postgres:16-alpine` container.
The container used port 55439 on loopback, separate from existing databases.
Migrations completed through the example's `scripts/migrate.mjs`.
The proposal provider was deterministic; there were no external model calls.

1. Ran `PROPOSAL_A2UI_PAUSE=1` against the real API. It created research and a
   proposal, approved research, and left a version-1 proposal approval pending.
2. Restarted the API with the pilot identity and opened the actual UI in Chrome.
   The correct proposal version and content appeared from PostgreSQL.
3. Entered a revision comment, reconnected explicitly and verified the draft
   remained. Stopped the API, observed the disconnected state, restarted it and
   observed automatic recovery with the same pending proposal and comment.
4. Restarted PostgreSQL with pending work. The initial idle-pool failure exposed
   a process crash; after the fixes below, stopping PostgreSQL returned an error
   to the browser while leaving the API process alive. Starting PostgreSQL
   restored the UI without restarting the API and preserved the comment.
5. Requested revision from Chrome. The persisted Approval was `needs_revision`
   with the exact human comment. Ran a revision task through the existing API,
   published proposal version 2 and requested its approval.
6. Reloaded Chrome, authenticated again and verified that version 2 was rebuilt
   from PostgreSQL. Approved it in Chrome; the UI confirmed the persisted decision
   and target version. Also approved the revision-output artifact from Chrome.
7. Completed the Room through the existing API. Its status was `completed`;
   research v1, proposal v2 and revision output v1 were all `approved`. The old
   proposal v1 revision decision remained in history.

The UI's unsent comments survive polling and automatic reconnect while the page
stays open. They are not persisted drafts and do not survive a page reload.
The pilot intentionally leaves revision generation and Room completion with the
existing API rather than adding new authority through UI messages.

## Problems corrected

- Identical snapshots after explicit reconnect could keep buttons carrying old
  authentication/session closures. Connect now clears stale content, rebuilds
  handlers and fences superseded actions while retaining matching draft text.
- Old failed requests could overwrite newer connection status. Both success and
  error paths now check request generation/sequence. HTTP requests have a
  ten-second timeout so a stalled connection cannot halt polling indefinitely.
- Replacement snapshots could discard comments on surviving surfaces. Drafts are
  retained by surface identity. Decision controls are re-enabled in `finally`
  after a failed request, and successful decisions show an explicit confirmation.
- HTTP shutdown could wait indefinitely on an open connection. Idle sockets close
  immediately and remaining HTTP connections close after a five-second grace
  period; worker stop is requested before draining HTTP.
- PostgreSQL idle-client errors could terminate the process. The example now
  handles these events and logs only the error code. The coordination loop
  retries known transient connection failures and respects shutdown cancellation.
- Compose did not forward pilot credentials/identity. The three opt-in environment
  variables are now forwarded, with placeholders in `.env.example`.

## Repeatable checks

Executed all example tests with both opt-ins enabled:

```sh
A2UI_TEST_DATABASE_URL=postgresql://127.0.0.1:55439/test_database \
A2UI_TEST_POSTGRES_CONTAINER=disposable-postgres-container \
node --test examples/rooms-api/test/*.test.mjs
```

Database authentication was supplied separately through standard PostgreSQL
environment variables rather than embedded in the URL.

Result: **21 passed, 0 failed, 0 skipped**. The PostgreSQL integration test starts
real API subprocesses, performs abrupt and graceful restarts, optionally stops
and starts the database container, and verifies state recovery, stale-version
rejection, concurrent duplicate decisions, durable retries and completed Room
state. It retains uniquely scoped data and must target a disposable test DB.

The client regression harness executes the actual browser source with controlled
DOM/network boundaries to exercise credential changes, reversed request completion
order, drafts and errors. Chrome was exercised separately as described above;
there is no claim that this harness is a complete browser implementation.

Also passed syntax checks for server/client/lifecycle files, `git diff --check`
and Compose configuration validation. Full repository builds and unrelated
package tests were not rerun. The API ran on the existing linked package builds;
no public package source contracts were changed by these fixes.

No automated accessibility certification, arbitrary renderer interoperability,
Docker image rebuild qualification, load testing or distributed-failure guarantee
is implied by this local run.

## Isolated PR validation

The pilot was subsequently copied by an explicit file allowlist into a separate
worktree based on `origin/main` at `e2fbca88`, without carrying over the original
workspace's other edits. Its 17 relevant package dependencies were rebuilt from
that clean source tree using the frozen root lockfile; the standalone example
was installed with its frozen lockfile. The complete example suite again passed
**21 tests with no failures or skips**, including real PostgreSQL stop/start and
API subprocess restarts. This confirms the pilot does not depend on the other
uncommitted changes or their pre-existing package builds. The existing CI job now
runs the example tests with its PostgreSQL service; container stop/start remains
an additional explicit local opt-in.
