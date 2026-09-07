# Adoption implementation validation

Validation date: 2026-09-07. This is a development check record, not a production
readiness attestation or a measured improvement in developer productivity.

## Environment and method

The checks used Node.js 24.14.0, pnpm 11.25.0 and a dedicated local PostgreSQL
16.11 instance. A temporary clean Git copy included the working-tree changes;
installation used frozen lockfiles. The original working tree, including
unrelated release/CI work, was preserved. No model-provider spending occurred.

The source install initially failed under Node 20 because the pinned pnpm 11
requires Node 22.13+. The new source-adoption guides now state that requirement.
The initial adoption pass preserved the existing Node 20 general CI job.
Release recovery subsequently aligned that job with the Node 24.20.0 release
toolchain so pnpm 11 can start. The separate adoption job uses Node 22.22.0.
Runtime package compatibility has not been changed.

Docker was unavailable locally, so execution used the documented direct Node
and PostgreSQL path. Compose configuration was not executed in this validation.

## Completed checks

`corepack pnpm run check` completed successfully in the temporary clean copy.
The root unit suite reported 1,338 tests: 1,331 passed, 1 skipped and 6 TODO;
these pre-existing pending cases are not counted as successful validation.
The check also completed adapter tests, release verification, package smoke
checks and the public consumer. Optional integration tests retain their own
skip conditions; the PostgreSQL adoption scenarios were executed separately.
Final documentation and compact demo-output refinements were followed by the
adoption documentation verifier and the complete adoption integration runner.
The focused current-tree suite passed all 31 tests.

- Frozen dependency installation in a clean copy, including the standalone API.
- Deterministic first execution and local capability-based collective example.
- Proposal HTTP scenario on a newly created database, including research,
  dependency-bound drafting, a human revision decision, version 2 and approval.
- Real child-process termination after Room commit, followed by recovery with
  the same operation and completed run identities. A private temporary schema
  prevents the concurrently running API worker from claiming the test work.
- Protected effects: missing approval, approved execution, checkpoint denial,
  incompatible provider and retry after local effect commit. Exactly one fixed
  local receipt was observed; no external-effect guarantee is inferred.
- Mock/live configuration tests and a live adapter call to a local fake HTTP
  endpoint. No real provider call was used.
- Adoption documentation links, historical README anchors, command references
  and public exports. README remains below 200 lines.
- Workspace/public type checking and packed public consumer verification.
- Four-peer PostgreSQL/HTTP Mesh example, including forced restart and duplicate
  handling, passed under its existing bounded scenario.

Reproduce the adoption-specific checks after building and installing the API:

```sh
corepack pnpm run verify:adoption-docs
corepack pnpm run verify:adoption-integration
node --test tests/adoption-provider.test.mjs tests/rooms-checkpoints.test.mjs tests/rooms.test.mjs
```

The integration command requires a dedicated PostgreSQL environment. It starts
and stops its own API process and leaves proposal records for inspection.

## Separate adoption validation

The [external pilot](adoption-pilot.md) remains pending participants. No sessions,
completion rate or onboarding-time improvement have been observed. Recruit only
with authorization; preserve failures and assisted outcomes in the pilot report.
