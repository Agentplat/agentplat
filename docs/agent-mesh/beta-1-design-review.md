# Agent Mesh `0.3.0-beta.1` design review

Status: design review complete; normative merge commit pending.

This record reviews the Beta 1 implementation plan, acceptance checklist and
compatibility threat model against the published Alpha 5 contracts. It covers
architecture/API compatibility, protocol/downgrade security,
persistence/migration semantics and release/conformance evidence.

## Reviewed inputs

- `docs/agent-mesh/beta-1-implementation-plan.md`;
- `docs/agent-mesh/beta-1-acceptance-checklist.md`;
- `docs/security/compatibility-freeze-threat-model.md`;
- Alpha 5 release evidence and annotated tag;
- protocol v0 contracts, parser, fixtures and Ed25519 signer/verifier;
- discovery Peer Card and protocol-version projections;
- HTTP, durability, PostgreSQL and Rooms bridge adapters;
- all Mesh/Inference Control/Trust snapshot readers;
- public package catalog, type tests, release verifier, pack and registry
  consumers.

## Baseline verdict

The unmodified public baseline passes its full repository check. The design is
additive except for the intentional current wire constant and durable wrapper
version advances. Both changes retain version-specific previous readers and
explicit previous writers. Runtime, Sessions, Rooms and Framework defaults are
outside the Beta compatibility behavior and remain unchanged.

## Findings resolved in design

### B1-DR-001 — Relabeling after signing would create signature/version confusion

- Severity: P1.
- State: resolved in design.
- Finding: treating v1 as a transport label could allow a v0 envelope to be
  rewritten after the signature was created.
- Resolution: version selection precedes hashing/signing; `wireVersion` stays
  in the signing document; committed retries preserve exact canonical bytes;
  cross-version output is a distinct message, never a retry.

### B1-DR-002 — Remote errors could become a downgrade oracle

- Severity: P1.
- State: resolved in design.
- Finding: retrying v0 after timeout, route failure or unsupported response
  would permit a network intermediary to force a lower version.
- Resolution: only local policy plus a verified, admitted, current Peer Card
  can select. A per-lineage high-water rejects lower selection. Transport
  outcomes never clear it, and receipts remain coarse.

### B1-DR-003 — Peer Card negotiation has a bootstrap dependency

- Severity: P1.
- State: resolved in design.
- Finding: a peer must parse a Peer Card before its advertised versions can be
  used, so version discovery cannot itself choose the first wire version.
- Resolution: bootstrap is construction-bound per admitted peer/instance,
  defaults to v1 and permits v0 only explicitly. A verified v0 card may then
  advertise `[0, 1]` and pin v1 for subsequent messages.

### B1-DR-004 — Durable wrapper and snapshot content versions were conflated

- Severity: P1.
- State: resolved in design.
- Finding: Alpha 5 durable records expose wrapper schema 1 while snapshot
  `state` is arbitrary JSON; treating that value as the snapshot's own schema
  would allow the wrong restore function or migration.
- Resolution: Beta records carry separate wrapper schema, envelope version,
  snapshot format/schema and chain version. Opaque Alpha rows remain explicit
  legacy until a caller-bound codec validates/migrates them.

### B1-DR-005 — Automatic snapshot-format inference would be unsafe

- Severity: P1.
- State: resolved in design.
- Finding: different state families can share fields such as
  `schemaVersion: 1`; shape guessing can select an incorrect codec.
- Resolution: codec selection uses an owner-qualified exact format ID supplied
  by trusted local configuration. Migration never guesses from untrusted JSON.

### B1-DR-006 — Optional conformance cases could create a false pass

- Severity: P1.
- State: resolved in design.
- Finding: an implementation could omit or skip difficult cases while
  presenting a green aggregate.
- Resolution: core protocol cases are always required; declaring an optional
  adapter capability closes its full case set; reports distinguish
  `skipped`/`not_declared`; inconsistent aggregate counts fail validation.
  Negative implementations verify that the suite detects known defects.

### B1-DR-007 — Export-name comparison alone cannot freeze TypeScript APIs

- Severity: P1.
- State: resolved in design.
- Finding: an export can keep its name while narrowing inputs, adding required
  properties or gaining an import-time dependency.
- Resolution: the gate combines packed runtime/type inventories, unchanged
  Alpha 5 consumer compilation, negative breaking-change fixtures, browser
  dependency traversal and clean functional consumers.

### B1-DR-008 — Binary rollback cannot rewrite committed v1 outbox work

- Severity: P1.
- State: resolved in design.
- Finding: an Alpha 5 worker cannot deliver a committed v1 envelope and
  changing it to v0 would violate exact-byte retry and signature identity.
- Resolution: Beta workers drain/reconcile v1 work before binary rollback.
  Normal database rollback leaves additive columns in place; no transparent
  resign/relabel operation exists.

### B1-DR-009 — Conformance dependencies could invert the runtime graph

- Severity: P2.
- State: resolved in design.
- Finding: placing adapter runners inside `@agentplat/mesh` would require the
  runtime package to depend on HTTP, PostgreSQL and Rooms adapters.
- Resolution: a new testing-layer package owns runners. Production packages
  expose only their semantic contracts and never depend on conformance.

### B1-DR-010 — Fixture generation could publish private test keys

- Severity: P1.
- State: resolved in design.
- Finding: reproducible signing fixtures need a generation key, but shipping
  that key would normalize unsafe key handling and expand the public audit
  surface.
- Resolution: committed/published fixtures contain signatures and public test
  keys only. Generation-only private material stays outside publishable paths
  and the public audit rejects private-key patterns.

### B1-DR-011 — Benchmark numbers could be mistaken for capacity promises

- Severity: P2.
- State: resolved in design.
- Finding: release-runner throughput varies and does not establish deployment
  SLOs.
- Resolution: correctness ceilings are normative; timing is diagnostic and
  includes complete workload/environment/sample metadata. Regression gates
  compare repeated samples only on the same controlled runner.

### B1-DR-012 — First publication of the conformance package affects dist tags

- Severity: P2.
- State: resolved in design.
- Finding: a new npm package has no prior rollback target and its first-public
  default tag behavior may differ from existing coordinated packages.
- Resolution: release evidence records the package's prior absence and every
  resulting dist tag explicitly. It is not represented as a stable promotion;
  recovery publishes a new package version rather than overwriting it.

## Review verdicts

### Architecture and public API

Pass. The new package is testing-only and dependency direction remains
acyclic. Existing package names/subpaths stay public, and Beta adds a packed
surface/consumer gate rather than relying on source-only declarations.

### Protocol and security

Pass. Selection, signing, verification, admission and replay remain separate.
The design closes bootstrap, downgrade, relabel, mixed-fanout and remote-oracle
paths without making transport availability authoritative.

### Persistence and operations

Pass. The migration is expand-first; opaque snapshots are not guessed; exact
bytes/digests and full scope remain authoritative; destructive rollback is
more constrained than Alpha 5.

### Conformance and release evidence

Pass. Required cases cannot be hidden, negative implementations test suite
sensitivity, reports are bounded/redacted and both tarball/registry consumer
paths remain exact-version isolated.

## Open design findings

P0: 0.

P1: 0.

P2: 0.

Implementation and release findings remain open until the acceptance checklist
is completed against exact commits.

## Normative commit

Pending the design-freeze PR merge. The exact public merge commit and PR URL
must be recorded in the acceptance checklist before any production
implementation begins.
