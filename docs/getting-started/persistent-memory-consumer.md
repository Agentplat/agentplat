# Consume the persistent-memory source preview

See the [reviewed clean-commit bundle](../reviews/persistent-memory-20261017.md)
for the current verified cohort and npm ci evidence.

This guide covers AgentPlat artifacts and integration contracts. The consumer
owns identity, membership, UI and deployment. The preview is local, unpublished
and distinct from the registry packages carrying the same version number.

## Produce and verify a coordinated bundle

From the AgentPlat checkout, configure a local/test PostgreSQL connection using
standard `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` and `PGDATABASE` variables as
needed, then run:

```sh
AGENTPLAT_POSTGRES_TEST=1 PGDATABASE=postgres pnpm run verify:memory-consumer
```

The verifier uses the existing `pnpm pack` mechanism and packed-manifest checks.
It includes the runtime dependency closure of Rooms/PostgreSQL, workflows/PostgreSQL,
framework, model-openai-compatible, runtime-mock and workflows-rooms. These roots
cover the previously inspected consumer surface; they are recorded in the receipt.
All selected AgentPlat packages must have the same coordinated version.

The output is a new directory under `release-artifacts/memory-preview/` containing:

- `tarballs/`: the complete selected AgentPlat package cohort.
- `consumer/package.json`: direct local tarball dependencies and pinned compiler.
- `consumer/pnpm-workspace.yaml`: pnpm 11 overrides for **every** AgentPlat package,
  isolated node linker and disabled hoisting.
- `consumer/pnpm-lock.yaml`: exact dependency graph, including third-party integrity.
- `consumer/persistent-memory-types.mts`: public import/type fixture.
- `consumer/persistent-memory-postgres.mjs`: executable database fixture.
- `npm-consumer/`: the same fixtures and tarballs, npm overrides and a `package-lock.json` verified with `npm ci`.
- `bundle.json`: commit, dirty status, input-file hashes, source digest, tool versions,
  package SHA-256/SHA-512, sealed consumer files and both verification results.

The source digest covers selected package source, migration and manifest files,
configuration and verifier/fixture inputs. It does not claim the entire dirty
checkout is represented by the commit. The bundle digest identifies the sealed
consumer/artifact files, while source provenance is recorded separately. Receipts
are local integrity evidence, not signed registry provenance or a release approval.

The script installs with both pnpm and npm outside the monorepo, compares packaged files against installed
files, rejects AgentPlat dependencies outside the cohort, checks public declarations
with `skipLibCheck=false`, and runs the PostgreSQL fixture. It then repeats this in
a second clean directory using the frozen lockfile, then repeats the same checks
with `npm install` and a separate `npm ci` consumer. A registry dependency with the
same version but different bytes fails verification.

To replay an existing bundle without rebuilding packages:

```sh
AGENTPLAT_POSTGRES_TEST=1 PGDATABASE=postgres \
  node scripts/verify-memory-consumer.mjs --verify /absolute/path/to/bundle
# Replay the same sealed cohort using npm ci:
AGENTPLAT_POSTGRES_TEST=1 PGDATABASE=postgres \
  node scripts/verify-memory-consumer.mjs --verify /absolute/path/to/bundle --manager npm
```

Replay checks sealed file hashes before installation, rejects extra/unsealed files,
installs the frozen dependency graph, and repeats public-type and database checks.
The whole directory must be retained/copied: relative tarball references make the
consumer portable as a unit. Third-party packages still require registry access
or a populated package-manager store. Tests use a fresh random schema and remove
only that schema on completion; they never target an existing consumer schema.

Do not install only the two memory-related tarballs into a mixed AgentPlat tree.
For application adoption, preserve its own manifest, copy the whole tarball cohort
into an application-owned artifact directory, update direct AgentPlat dependencies
and the package-manager overrides to those exact relative paths, regenerate its
lockfile, then prove a clean application install/build. With pnpm 11, overrides go
in `pnpm-workspace.yaml`; putting them only in the `pnpm` field of `package.json`
was insufficient in the isolated verification. The generated npm manifest binds
transitive AgentPlat dependencies to its direct tarball specifications using npm's
`$dependency` override references. Its isolated `npm ci` proof is included. The
application still needs its own clean-install and build verification after merging
these dependencies with its other packages.
No application manifests, credentials, schema or deployment are modified here.

## Database setup in the consuming host

Use the exported adapter and migration functions from `@agentplat/rooms-postgres`:

```ts
import {
  createPostgresPool,
  runMemoryRevisionMigrations,
  getMemoryRevisionMigrationStatus,
  PostgresMemoryRevisionStoreV1,
} from '@agentplat/rooms-postgres';
import { MemoryRevisionServiceV1 } from '@agentplat/rooms';

const pool = createPostgresPool(connectionOptions);
await runMemoryRevisionMigrations(pool, { schema: 'agent_rooms' });
const status = await getMemoryRevisionMigrationStatus(pool, { schema: 'agent_rooms' });
const memory = new MemoryRevisionServiceV1(
  new PostgresMemoryRevisionStoreV1(pool, { schema: 'agent_rooms' }),
  access,
);
```

Run migrations through the host's explicit infrastructure process. Specify
`createSchema:true` only when deliberately creating a schema. This independent
ledger (`@agentplat/room-memory-revisions`, version 1) creates
`memory_revision_heads` and `memory_revisions`; it does not advance the Room ledger
or automatically convert existing `memory_entries`.

Existing legacy memory remains readable through legacy APIs. Any backfill must
explicitly map its participant subject to a stable agent and assign a verified
personal/shared audience. Never infer a private owner from a tenant ID or convert
all organizational memory to personal/shared preference data automatically.
Use stable import operation IDs and evidence references if a separately reviewed
backfill is needed. Retirement is a revision, not a physical purge.

The fixture additionally runs Room and workflow migrations because it demonstrates
actual conversation Rooms, persistent definitions, evidence artifacts and task
runs. A host using only the memory service needs only the opt-in memory ledger.
Migration rollback is destructive and requires the adapter's confirmation string,
expected version and explicit data-loss consent. Ordinary correction or retirement
must use the service, not schema rollback.

## Identity, cross-conversation use and errors

`MemoryRevisionAccessV1.authenticate` must return an existing `TenantContext` with
verified `actor.actorId`. The framework restricts personal memory to that actor;
shared memory requires the mandatory `authorize` callback to enforce current
membership and operation policy. Stable agent ID is the subject, **not** the
personal audience and not a conversation participant ID.

The PostgreSQL fixture creates two persisted Rooms and two distinct participants
mapped to one registered agent. A real Room message records the explicit preference
and supplies its provenance reference. After closing/reopening the pool, a new
service resolves the memory from the second conversation. It tests correction,
retirement, historical access, expiry, concurrent writers and unauthorized reads.
The fixture uses local credential tokens and a deterministic executor; it does not
implement or validate Cognito, product membership or live-model behavior.

| Result | Meaning and host response |
| --- | --- |
| `FORBIDDEN` | Missing verified identity, personal-owner mismatch or access rejection. Do not retry with a model-selected identity. |
| `CONFLICT` | Stale expected revision or incompatible operation reuse. Reload the authorized head and obtain a new deliberate update; do not silently overwrite. |
| `VALIDATION_ERROR` | Invalid evidence, time interval or contract. Correct the input. |
| `undefined` from current read | Missing, retired, not-yet-valid, expired or beyond retention. Do not invent a preference or treat this as success of a historical lookup. |
| Storage/access-port exception | Dependency unavailable. Propagate failure; do not fall back to unrestricted or stale data. |

History requires authorization against both current and historical audiences and
retention rules. The host must separately govern already-persisted execution
snapshots, exports and backups when preferences are removed. No delegated
personal-memory impersonation is supported by this initial contract.

## Exact execution evidence

The fixture records a versioned Room artifact containing:

- Room and participant IDs plus stable agent ID.
- Persisted definition revision ID and digest, reloaded from PostgreSQL.
- Exact composed instructions/context string and its digest.
- Every memory ID, revision and digest returned by `resolveMemoryRevisionSnapshotV1`.

The workflow task binding uses `promptRevision` and `promptDigest`; its input and
result reference the exact artifact version. A pool reopen verifies the task
binding against the persisted artifact. Later correction/retirement of memory
cannot rewrite which revision the earlier execution used.

This illustrates the existing contracts rather than adding another execution
ledger. Store snapshots under the same access/retention rules as their content;
private preferences remain private even when embedded in an artifact. In a real
model integration, hash the actual effective instructions and any additional
context that is included, and record model, tool and policy bindings too. A prompt
digest alone does not attest that a remote provider actually executed those bytes.

## Work remaining in the consumer project

- Integrate verified Cognito principals, organization/workspace memberships and
  stable catalog-agent mappings; test authorization on each route/tool/job.
- Implement explicit preference authoring, correction, sharing and retirement UI;
  keep discovery/indexing scoped by authenticated user and stable agent.
- Freeze skill/instruction revisions and effective execution context; enforce
  retention/deletion for original and derived records.
- Adopt the entire verified artifact cohort into the application's package manager,
  test its lockfile/build and migrate its database through its existing process.
- Connect background workers, source service, evaluator and notification outbox,
  with current authorization, effect idempotency and budgets.
- Qualify application restart/concurrency behavior, backup/restore and deployment
  separately. The local PostgreSQL fixture is bounded integration evidence, not a
  production-readiness claim.
