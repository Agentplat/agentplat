# Agent Room operational API and release audit

- Audit date: 2026-08-21
- Source version before release preparation: `0.3.0-beta.4`
- Intended channel: npm `next`

## Publication catalog

`config/public-packages.json` contains 56 coordinated packages. The relevant
catalog entries are:

| Package                            | Layer         | Provider-neutral | Publication state before this release |
| ---------------------------------- | ------------- | ---------------- | ------------------------------------- |
| `@agentplat/rooms`                 | collaboration | yes              | published through `0.3.0-beta.4`      |
| `@agentplat/rooms-api`             | adapter       | yes              | coordinated existing package          |
| `@agentplat/rooms-postgres`        | adapter       | yes              | coordinated existing package          |
| `@agentplat/rooms-temporal`        | adapter       | yes              | new package; absent from npm          |
| `@agentplat/work-management-asana` | adapter       | no               | new package; absent from npm          |

Read-only npm registry queries showed `0.3.0-beta.4` as the highest published
version of both `@agentplat/rooms` and `@agentplat/core`. Therefore
`0.3.0-beta.5` is the next available coordinated prerelease candidate. This
observation must be repeated immediately before changing versions and before
publication.

The two new package names returned npm `E404`, establishing that their first
publication needs the first-package tag caveat documented in `RELEASING.md`.
They must still be requested under `next`; npm may assign `latest`
automatically when a package name receives its first version.

## Compatibility review

The release is additive within the current prerelease line:

- `RoomServiceOptions.automaticCoordination` is optional. Existing applications
  retain their prior message behavior until they enable it.
- Coordination persistence and discovery methods added to `RoomRepository` are
  optional. The repository-backed coordination adapter fails explicitly when
  an application selects it with an incompatible repository.
- Runtime checkpoints and task-run hooks are optional. Protected action
  checkpoint enforcement remains opt-in for backward compatibility.
- Continuous worker, operational projector, Planner, memberships, LiveView
  discovery, execution sessions, Handoffs, contributions and knowledge bundles
  are new exports; no existing export is removed or renamed.
- API routes are registered only when their corresponding optional coordinator,
  store or service is injected. Existing routes and response envelopes remain
  unchanged.
- `@agentplat/rooms-temporal` and `@agentplat/work-management-asana` are
  optional adapter packages. Neither is imported by the Agent Room core.

Because this is a prerelease, downstream consumers should still pin the exact
coordinated version or use the `next` distribution tag.

## HTTP surface review

`packages/rooms-api/README.md` documents the base Room lifecycle and the
conditional surfaces for:

- execution sessions, interventions, bounded event reads and SSE;
- Agent Definition Registry lifecycle;
- AgentPlat Handoffs;
- human contributions and work-management delivery;
- knowledge bundles;
- AgentRoom LiveView and SSE with automatic Room-scoped discovery;
- typed plans, replanning and event reconciliation;
- participant membership lifecycle.

Authenticated tenant and actor identity remain authoritative over request-body
values. Unexpected adapter failures keep their details hidden by default.

## PostgreSQL review

The migration loader and packaged SQL form one ordered V1–V11 chain. V2–V11
add execution sessions, agent definitions, Handoffs, coordination, human
contributions, knowledge bundles, plans, participant membership, the unified
operational stream and projection checkpoints. Each migration has an explicit
down file; down operations are destructive and require the existing rollback
confirmation controls.

All stores qualify schema and tenant scope. Revisioned state uses
compare-and-set writes. The operational stream is emitted by database triggers
in the same transaction as its source transition.

## Required release evidence

Before publication, record green results for:

1. public terminology audit with the external denylist;
2. full workspace `check` from the exact clean release source;
3. PostgreSQL V1–V11 apply and rollback against a disposable real server;
4. reference end-to-end and multiprocess restart recovery scenarios;
5. Temporal Server signals, canonical activity binding, worker restart and
   `continueAsNew`;
6. coordinated release verification, 56-package pack smoke and public consumer;
7. dry-run publication under `next` from the exact PR commit.
