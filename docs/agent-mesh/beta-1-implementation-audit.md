# Agent Mesh `0.3.0-beta.1` implementation audit

Status: accepted. All implementation findings are resolved. Exact-commit CI,
dry publication, coordinated npm publication, two registry consumers and the
annotated release tag passed.

This audit compares the implementation candidate with the normative Beta 1
design commit `9d726581f5689a4d72c4f31d8a2a4049d0112ccf`. It covers architecture and
API compatibility, protocol and downgrade security, persistence and migration,
conformance false-positive resistance, dependency direction and release
compatibility. A local candidate result is not treated as evidence for a later
commit.

## Reviewed surfaces

- `@agentplat/mesh-protocol` v0/v1 contracts, strict parsers, canonical bytes
  and frozen fixtures;
- `@agentplat/mesh-crypto` construction-bound signing and version-preserving
  verification;
- `@agentplat/mesh/coordination` authenticated negotiation, lineage and
  restart-stable downgrade fences;
- `@agentplat/mesh-http` route/version coherence and exact signed-byte retry;
- `@agentplat/mesh/durability` wrapper, snapshot codec and journal contracts;
- `@agentplat/mesh-postgres` migration 2, adoption, backfill, rollback guards
  and transactional repository;
- `@agentplat/mesh-conformance` protocol, transport, durability and Rooms
  runners, reports, deadlines and cleanup;
- canonical protocol and persistence fixture corpora;
- compatibility matrix, PostgreSQL fault matrix, multi-process soak and
  bounded benchmark;
- public package catalog, Alpha 5 source compatibility, packed declarations,
  browser traversal and independent registry consumers.

## Resolved findings

### B1-IA-001 — Per-call policy could enable legacy signing

- Severity: P1.
- State: resolved.
- Finding: an early candidate accepted a legacy signing permission on each
  sign call, allowing a caller to bypass the intended construction boundary.
- Resolution: the default signer emits only wire v1. Wire v0 requires an
  immutable construction-bound policy, and the sign request contains no
  policy override.

### B1-IA-002 — Downgrade state did not fully survive lineage changes

- Severity: P1.
- State: resolved.
- Finding: a restart or insufficiently constrained reset could discard a
  previously selected high-water and allow an older peer advertisement to
  select v0.
- Resolution: discovery schema 2 persists per-peer high-water state. Reset
  requires an exact wire version and a newer admitted instance/card lineage;
  same-card, stale-card and lower-lineage resets fail closed.

### B1-IA-003 — Legacy persistence readers trusted incomplete metadata

- Severity: P1.
- State: resolved.
- Finding: migration-1 snapshots lacked typed descriptors, while schema-2
  records could be loaded without fully revalidating wrapper, envelope and
  journal versions.
- Resolution: migration-1 snapshots load only as visibly opaque legacy state.
  Schema-2 loads validate exact descriptors, canonical envelope bytes and
  digests, wrapper/version relationships and journal version 1.

### B1-IA-004 — Rollback readiness undercounted incompatible durable state

- Severity: P1.
- State: resolved.
- Finding: rollback readiness originally counted envelope rows but could omit
  typed snapshots and journal state that Alpha 5 readers cannot consume.
- Resolution: readiness now accounts for inbox, outbox, snapshot and journal
  incompatibilities and refuses legacy targets when Beta-only state exists.

### B1-IA-005 — Migration adoption and backfill were insufficiently bounded

- Severity: P1.
- State: resolved.
- Finding: an installation could be adopted from table presence alone, and a
  codec backfill could continue without an overall deadline.
- Resolution: migration 2 verifies exact column and constraint metadata,
  checksums every migration, uses the existing advisory lock, rejects reserved
  legacy targets, and makes backfill bounded, idempotent, resumable and
  deadline-aware.

### B1-IA-006 — Conformance durability could be self-attested

- Severity: P1.
- State: resolved.
- Finding: an adapter could report boolean success for atomicity and restart
  behavior without exposing observable repository effects to the runner.
- Resolution: the durability runner performs real receipt, conflict, claim,
  transition, snapshot, journal and restart operations. Restart must return a
  distinct repository, stale claims cannot settle work and deliberately broken
  implementations fail their expected cases.

### B1-IA-007 — Conformance deadlines and cleanup were ambiguous

- Severity: P2.
- State: resolved.
- Finding: timeout, abort and cleanup errors could be conflated, and a caller
  factory could outlive the suite without a shared deadline signal.
- Resolution: every factory receives an immutable seed and abort signal under
  one total deadline. Abort, timeout, cleanup failure and timeout-plus-cleanup
  failure have separate bounded report outcomes; destructive setup requires
  explicit consent.

### B1-IA-008 — Journal verification could miss an omitted tail

- Severity: P1.
- State: resolved.
- Finding: recomputing an internally consistent prefix cannot prove that a
  durable journal tail was retained.
- Resolution: verification accepts an independently stored expected head
  sequence and digest, requires the pair to be complete and detects mutation,
  reorder and tail omission. Schema and journal versions are also exact.

### B1-IA-009 — Workspace-only API checks could miss published breakage

- Severity: P1.
- State: resolved.
- Finding: source compilation inside the workspace could pass through hoisted
  dependencies or declaration paths that fail after publication.
- Resolution: the pack gate archives the exact Alpha 5 tag, compiles eleven
  unchanged Alpha 5 contract sources against Beta 1 tarballs, compares exported
  names and compiles every package declaration in an isolated strict consumer.
  Negative fixtures prove that removed exports/subpaths, narrowed inputs, new
  required parameters and changed discriminants are rejected.

### B1-IA-010 — Registry verification did not cover the coordinated catalog

- Severity: P1.
- State: resolved.
- Finding: an earlier registry consumer exercised only selected Mesh packages,
  so a broken declaration or export in another coordinated package could pass.
- Resolution: the consumer pins all 34 catalog packages, imports every declared
  subpath and runs compatibility plus conformance scenarios under Node 20/pnpm
  and Node 22/npm with credential-stripped execution environments.

### B1-IA-011 — Fault evidence omitted transactional and network boundaries

- Severity: P1.
- State: resolved.
- Finding: happy-path restart evidence did not cover every migration statement,
  transition write boundary or actual delivery reorder.
- Resolution: the PostgreSQL matrix injects rollback after all 16 migration-2
  statements and at snapshot, journal, outbox and inbox-settlement writes. The
  multi-process soak delays ingress to prove later delivery commits before the
  earlier message, in addition to duplicate, timeout, overload and restart
  faults.

### B1-IA-012 — PostgreSQL declarations lacked transitive type ownership

- Severity: P1.
- State: resolved.
- Finding: isolated strict consumers of two PostgreSQL adapters could not
  resolve the `pg` types exposed by their declarations.
- Resolution: every adapter that exposes those declarations owns its
  `@types/pg` dependency. The 34-package isolated declaration compile now
  passes without `skipLibCheck` or workspace hoisting.

### B1-IA-013 — Shallow CI checkout omitted the frozen baseline tag

- Severity: P1.
- State: resolved.
- Finding: the artifact compatibility gate correctly required the exact Alpha
  5 tag, but the default CI and release checkout fetched only the candidate
  commit and could not resolve that immutable baseline.
- Resolution: CI and release checkouts fetch complete history and tags. The
  pack gate remains fail-closed when the tag is missing or resolves to any
  commit other than the frozen Alpha 5 baseline.

## Exact release verification

Release commit `b38c25098599499813fe2caea605b5d61f939222` passed:

- build, strict public type checking and 546 unit subtests (540 passed, six
  intentional `todo` cases, zero failures);
- frozen v0/v1 protocol fixtures and 19 persistence fixtures;
- seven compatibility matrix cells and Alpha 5 source compatibility;
- release verification for 34 public package manifests;
- 34 isolated tarballs, 50 public API surfaces, 11 unchanged Alpha 5 contract
  sources, and independent pnpm/npm conformance consumers;
- PostgreSQL 16 integration, migration and transactional fault checks;
- deterministic multi-process reorder/restart soak and bounded adapter
  benchmark.

The exact commit then passed dry publication, coordinated publication of 34
packages, Node 20/pnpm and Node 22/npm registry consumers, registry SHA512 and
distribution-tag verification, and staging-tag cleanup. Annotated tag
`v0.3.0-beta.1` resolves to that commit.

## Verdicts

- Architecture and API compatibility: pass; P0 open: 0, P1 open: 0, P2 open: 0.
- Protocol and downgrade security: pass; P0 open: 0, P1 open: 0, P2 open: 0.
- Persistence and migration: pass; P0 open: 0, P1 open: 0, P2 open: 0.
- Conformance false-positive resistance: pass; P0 open: 0, P1 open: 0, P2
  open: 0.
- Release compatibility: pass; all 34 packages are published under npm `next`,
  all recorded SHA512 integrities match and zero staging tag remains.

Final acceptance is recorded in the
[Beta 1 acceptance checklist](./beta-1-acceptance-checklist.md) and
[machine-readable release evidence](./beta-1-release-evidence.json).
