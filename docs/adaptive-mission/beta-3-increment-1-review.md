# AgentPlat `0.3.0-beta.3` Increment 1 review

Status: implementation review passed with the full local monorepo and packed
consumer gates green. Pull-request CI and public merge remain pending. The
planning reducer, Mesh facade and evaluation boundary remain deferred to their
ordered increments.

## Reviewed scope

- `@agentplat/collective-planning` root contracts, canonical JSON, synchronous
  SHA-256, domain-separated digests, constructors and strict validators;
- mission intent, observation, selection policy, proposal, decision, fragment,
  plan view, adaptive role and snapshot records;
- public package catalog, coordinated version line, lockfile, public type tests,
  tarball and registry-consumer entrypoints;
- the Beta 2 historical evidence and compatibility gates after the additive
  37th package;
- the Increment 1 malformed corpus and public terminology/secret audit.

## Closed findings

### B3-I1-001 — Fragment state could not advance safely

- Severity: P1.
- Resolution: `fragmentId` remains stable for one accepted proposal while
  `fragmentRevision` and `previousStateDigest` form an append-only state chain.
  Plan views require contiguous revisions, exact immutable proposal bindings
  and a closed lifecycle transition matrix. High-waters bind the latest state.

### B3-I1-002 — Snapshot restore could lower policy or authority

- Severity: P1.
- Resolution: succession validation preserves intent scope, rejects policy
  downgrade/widening, treats non-fragment domain records as immutable, rejects
  conflicting equal plan-view revisions and prevents adaptive-role epoch,
  generation or fence rollback.

### B3-I1-003 — Planning budget was not mandatory for projected work

- Severity: P1.
- Resolution: every latest fragment has one exact reservation. Candidate state
  requires reserved budget; accepted, projected, completed and failed states
  retain committed usage; cancelled and superseded states may release only
  through an explicit released record. Work mappings and roles bind the latest
  fragment state.

### B3-I1-004 — Graph readiness treated presence as completion

- Severity: P1.
- Resolution: causal frontier is recomputed exactly, unresolved dependencies
  include missing and non-completed latest states, and Work mapping fails until
  every dependency is completed.

### B3-I1-005 — Canonicalization could execute accessors or allocate past bounds

- Severity: P1.
- Resolution: canonicalization and deep freeze inspect data descriptors,
  arrays never dispatch caller-controlled methods, factories reject accessors
  before reading fields, UTF-8 bytes are counted incrementally and the plan
  view has an explicit 64 MiB hard ceiling before intent-specific limits.

### B3-I1-006 — Observation structure overstated semantic isolation

- Severity: P1.
- Resolution: normalized structural aliases reject named assignment,
  authority, hidden-state and future-schedule fields. Documentation now states
  the exact boundary: generic JSON validation cannot prove meaning or truth;
  registered adapter schemas and the independent monitor enforce semantic
  visibility in Increment 4.

### B3-I1-007 — Historical compatibility used the current package cohort

- Severity: P1.
- Resolution: Beta 2 evidence now reads its immutable 36-package catalog from
  the release tag. Compatibility verifies that the current surface is an
  additive superset and recompiles the corrected Beta 2 consumer contracts;
  historical evidence is never regenerated from the Beta 3 line.

## Adversarial evidence

The contract corpus covers fixed and differential SHA-256 vectors at padding
boundaries, every digest domain, deterministic nonce-free identities, invalid
Unicode, unsafe integers, byte/depth/node/cardinality limits, unknown nested
fields, hostile accessors, overridden array methods, authority aliases, digest
tampering, lifecycle gaps and terminal transitions, graph/frontier errors,
budget conservation, stale mappings, snapshot rollback, policy widening and
adaptive-role authority equivocation.

The public TypeScript contract imports and uses every root export and contains
negative compile-time cases for mutability and accidental execution authority.

## Compatibility and packaging verdict

- the package root is side-effect free, provider-neutral and browser-safe;
- it depends only on `@agentplat/core` and adds no dependency cycle;
- existing wire versions, signed payload unions, defaults and package roots are
  unchanged;
- Beta 2 evidence remains tied to its immutable 36-package release;
- the Beta 3 release line requires exactly 37 packages at
  `0.3.0-beta.3`;
- runtime and type consumers use named imports from the packed public surface.

## Review verdict

P0: 0.

P1: 0.

P2: 0 after the final adversarial coverage pass.

Increment 1 is ready for pull-request CI and public merge. No reducer, Mesh
adapter, environment adapter, evaluation implementation or registry
publication is claimed by this review.
