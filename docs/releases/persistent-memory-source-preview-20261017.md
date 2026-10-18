# Persistent memory source preview — 2026-10-17

Superseded for adoption by the [reviewed clean-commit bundle](../reviews/persistent-memory-20261017.md).

Status: unpublished local integration evidence. No npm publication, application
migration or deployment occurred. AgentPlat files only; Agents Grishen files and
its database were not modified.

## Exact cohort

- Source commit: `0142d6e607eec75c0464c13949df8c2d95b48f1e`.
- Working tree: dirty; the commit alone does not describe the artifacts.
- Selected source-input SHA-256: `16973d7830fa5746688225e63f7367516bfe53f46153fed52f6c26c8b7aa3c94`.
- Sealed bundle SHA-256: `3a3a4408c060a2cd61ed34b737114bc4e9d56d2ea4f30aff597526a2acb36307`.
- Packages: 25, coordinated manifest version `1.1.0`, built from local source.
  These are preview bytes, not a claim of equivalence to registry `1.1.0`.
- Tools: Node `v24.20.0`, pnpm `11.25.0`.
- Bundle directory relative to the checkout:
  `release-artifacts/memory-preview/2026-10-17T23-09-24.325Z-16973d7830fa`.
- [Local receipt with per-package SHA-256/SHA-512 and input-file hashes](../../release-artifacts/memory-preview/2026-10-17T23-09-24.325Z-16973d7830fa/bundle.json).

`release-artifacts` is ignored by Git. Retain or transfer this entire bundle to
consume these exact bytes. A fresh clone does not contain it. The receipt is local
integrity/provenance evidence, not signed release provenance.

## Checks completed

1. Built and packed the complete runtime closure of framework, Rooms/PostgreSQL,
   workflows/PostgreSQL, workflows-rooms, model-openai-compatible and runtime-mock.
2. Verified registry-compatible internal manifest ranges and one coordinated version.
3. Installed exact tarballs in a temporary consumer outside the workspace; checked
   every packaged file against installed bytes and checked that all resolved
   AgentPlat dependencies belong to the cohort.
4. Compiled public consumer imports with strict TypeScript and `skipLibCheck=false`.
5. Ran the real PostgreSQL consumer fixture using only public package imports and
   packaged SQL migrations. It created and removed its own random test schema.
6. Repeated install/type/runtime verification in a second clean consumer with a
   frozen dependency graph; also replayed the final sealed bundle independently.
7. Passed two tamper checks: a modified fixture and an extra unsealed configuration
   file are rejected before installation or database access.
8. Passed the repository platform-boundary and whitespace checks.

The database fixture demonstrated an explicit preference from a persisted Room
message, a stable registered agent shared by two conversations with different
participant IDs, retrieval after pool reopen, another user's denial, correction,
retirement, expiry, stale writes and competing writers. A durable workflow task
and Room evidence artifact retain exact memory revision, definition revision,
composed-prompt digest and task-binding digest after correction/retirement and a
second pool reopen. The executor is deterministic; no model API was invoked.

## Distribution finding

The initial isolated install detected a transitive package with bytes different
from the preview. The verifier now writes pnpm 11 overrides in
`consumer/pnpm-workspace.yaml`, where that package-manager version reads them,
fixing every internal package to the local cohort. Version-string checks alone
would not have established the required artifact identity.

Failed intermediate directories without a successful `bundle.json` are not
qualified bundles. Earlier minimal 12-package runs do not replace the final
25-package cohort identified above.

## Consumer handoff

Use the [integration and migration guide](../getting-started/persistent-memory-consumer.md)
and [implementation boundaries](../architecture/persistent-agent-learning-implementation.md).

Still pending in the consuming project: adoption into its own package-manager
lockfile (including an npm clean-install proof if it continues using npm), Cognito
and membership mapping, private snapshot access, memory UI, skill versioning,
application migrations, worker/notification integration and deployment validation.
The packaged consumer does not establish general production readiness, live-model
quality, backup/restore performance or production database parity.
