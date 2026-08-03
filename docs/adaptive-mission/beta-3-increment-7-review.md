# AgentPlat `0.3.0-beta.3` Increment 7 review

Status: release-candidate implementation evidence. This review covers the
public planning-conformance surface, durable PostgreSQL profile, isolated
consumers and operations documentation. It does not claim completion of the
normative scale/statistical campaign, registry publication or a production
deployment.

## Public planning conformance

`@agentplat/mesh-conformance/planning` is an additive, browser-safe subpath. It
publishes a closed V1 capability vocabulary, case registry, deterministic
fixture manifest, bounded runner, assessment contract and report validator.
Every declared capability has at least one case. Portable and reducer cases are
required; snapshot, replanning, fencing, Mesh projection, evaluation and
durability remain explicit declarations rather than inferred support.

The eleven public cases cover:

- unknown fields in an intent-shaped record;
- proposal scope widening;
- dependency cycles;
- exact duplicate replay;
- cross-scope and rollback snapshots;
- a missing causal replanning predecessor;
- a stale effect fence;
- assignment/projection mismatch;
- private evidence in a public artifact; and
- restart without the required durable fence high-water.

Reports cannot omit, duplicate or add cases. Validation recomputes suite and
fixture-manifest bindings, declared/undeclared coverage, result shape, counts
and verdict. Options, reports, adapters and arrays reject exotic prototypes,
symbols, accessors and sparse values before evaluation. Case, suite, abort,
cleanup and timeout-plus-cleanup failures remain distinguishable.

The fixtures are public. A passing adapter report is executable conformance for
the named adapter and exact fixture set, not a cryptographic certification that
an implementation cannot special-case them. The executable example therefore
labels its fixture interpreter separately from the real resilience campaign
and never reuses campaign evidence as the interpreter's evidence digest.

## Durable planning and recovery

`@agentplat/mesh-postgres` adds an opt-in migration 003 and a planning/recovery
repository. Import and construction perform no connection, migration, worker
startup or cloud operation. The caller owns the PostgreSQL pool and applies
migrations explicitly.

Each stream binds the exact tenant, policy domain, mission intent revision and
digest, selection-policy digest, local peer and peer instance. The stored
planning value is a real `PlanningReducerSnapshotV1`, validated by Collective
Planning before it reaches persistence. Recovery state is closed and binds
assignment epoch, replay sequence, revocation, budget-reservation and fencing
high-waters. Derived durable high-waters additionally cover logical time, plan
revision, fragment revision and intent revision.

Commits use generation plus state-digest compare-and-swap under a row lock and
append exactly one hash-chained event in the same transaction. Assignment epoch
may remain unchanged only with the same fencing token, or advance exactly one
with a rotated token. Planning snapshot restore and the explicit durable
high-waters both reject rollback.

`restore()` is fail-closed. It may initialize an empty exact scope or confirm an
identical snapshot already present. It will not jump a non-empty stream to a
later or forked journal head because the snapshot-only API cannot prove the
missing journal tail. Later state must arrive through verified commits.

The migration is additive to prior Mesh durability tables. Its down migration
is explicitly destructive and requires the existing backup/data-loss gates.
The historical default rollback confirmation remains version 2; version 3
rollback is requested explicitly. The Beta 1 PostgreSQL fault matrix now first
rolls migration 3 back to 2, then preserves the prior refusal to expose
incompatible Beta rows to an Alpha reader.

## Consumers and operations

The small executable example runs the real paired three-peer resilience
reference and separately demonstrates the public planning fixture adapter. The
same source runs from all coordinated tarballs in isolated pnpm and independent
npm installs. The pack gate imports every public export and contains no
workspace link dependency at execution.

The operations runbook separates off, shadow and enforce modes; identifies
runtime campaign evidence independently from fixture-adapter output; documents
explicit PostgreSQL migration and scope admission; and gives fail-closed crash,
restore, reconciliation and rollback procedures. It makes no cloud-deployment
or production-scheduler claim.

## Independent review and remediation

Cross-review initially found and closed:

- a consumer that repeated public expected outcomes and mislabeled its result
  as runtime evidence;
- planning options that could invoke accessors before validation;
- cleanup failures that collapsed into a generic assertion result;
- a declared durability capability without its own case;
- PostgreSQL scope/placeholder and fencing-token gaps;
- restore of an unverifiable later/forked journal head;
- a PostgreSQL test cleanup path that could retain a failed-test schema;
- a changed default rollback confirmation and reduced fault-matrix coverage;
  and
- missing package documentation for the new public subpath.

Final independent re-reviews report zero open P0, P1 or P2 findings in the
Increment 7 scope.

## Verification evidence

Focused evidence passed:

- planning-conformance build, public type checks and seven runtime tests;
- PostgreSQL planning/recovery tests: five of five against PostgreSQL 16,
  including migration, pool/repository restart, empty-scope restore, rollback,
  fork and head-gap fencing;
- the existing PostgreSQL crash/fencing/compatibility matrix: 29 of 29 cells;
- isolated pnpm and npm tarball consumers, including the new resilience and
  planning-conformance example; and
- public terminology/secret audit and diff validation.

The repository-wide `pnpm check`, pull-request workflows and exact merged-main
workflow are the final integration gates recorded outside this review.

## Deferred release boundaries

Increment 8 still owns frozen campaign registrations, the complete
50/100/250/500-agent paired ladder, registered multi-seed fault strata,
independent statistical verification and immutable raw evidence manifests.
Increment 9 still owns registry staging, dist-tag promotion, annotated release
tagging and evidence-only merge. No unchecked acceptance item is implied by
this Increment 7 implementation.
