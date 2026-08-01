# Agent Mesh `0.3.0-beta.1` acceptance checklist

Status: design candidate. A checkbox is closed only by evidence tied to the
exact reviewed design or release commit. Local results from another commit are
not release evidence.

## Release identity and design freeze

- [ ] Version is `0.3.0-beta.1` across the root and every public package.
- [ ] Compatibility baseline is annotated tag `v0.3.0-alpha.5` at
      `5d11f715947bd7d3e5b8f7311c8f6f68c8c33a98`.
- [ ] Design plan, threat model, package boundaries and non-goals are reviewed.
- [ ] Design review records zero open P0/P1/P2 findings.
- [ ] Exact normative design commit is recorded before implementation.
- [ ] Production implementation contains no unreviewed scope outside the
      frozen design.

## Public package and API compatibility

- [ ] Public catalog contains exactly 34 coordinated packages.
- [ ] `@agentplat/mesh-conformance` is provider-neutral, side-effect-free on
      import and isolated from production dependency graphs.
- [ ] Framework does not re-export Mesh or conformance packages.
- [ ] Alpha 5 public-contract source fixtures compile unchanged against packed
      Beta 1 declarations.
- [ ] Packed public-surface reports cover every package and export subpath.
- [ ] No Alpha 5 export or subpath is removed or renamed.
- [ ] No input is narrowed and no required parameter/property is added to an
      existing contract.
- [ ] Versioned closed unions and discriminants remain source-compatible.
- [ ] Browser entrypoints gain no Node built-in or provider-specific edge.
- [ ] Runtime, Sessions, Rooms and Framework defaults remain unchanged.
- [ ] All imports perform no network, database, migration, registration or
      telemetry side effect.

## Wire version 1

- [ ] Current, previous and supported wire-version constants are public and
      exact: `1`, `0` and `[0, 1]`.
- [ ] General envelope types and parsers represent both supported read
      versions without erasing the exact version.
- [ ] Producer helpers default to v1.
- [ ] V0 production requires an explicit construction-bound signing policy.
- [ ] No existing payload shape or message family changes in Beta 1.
- [ ] `wireVersion` remains part of the signed document.
- [ ] Version replacement invalidates verification.
- [ ] Retries preserve exact canonical signed bytes.
- [ ] Parser policies can narrow but cannot add unsupported versions.
- [ ] Unknown wire versions fail explicitly without fallback.
- [ ] Peer Card protocol versions are sorted, unique, bounded and include the
      envelope's own version.
- [ ] Unknown optional extensions remain ordinary signed data.
- [ ] Unknown critical extensions fail before state mutation.

## Canonical protocol fixtures

- [ ] Every committed v0 fixture is byte-identical to Alpha 5.
- [ ] Every implemented message type has exactly one valid v1 fixture.
- [ ] Fixture manifest accounts for every file with no duplicate/untracked
      vector.
- [ ] File, canonical envelope, payload and signing-document digests recompute.
- [ ] Public test keys and signatures verify; no private fixture key ships.
- [ ] Deterministic generation reproduces all v1 bytes.
- [ ] Malformed fixture classes produce their exact bounded coarse outcome.
- [ ] V0 and v1 fixtures cannot substitute for each other's signature.

## Negotiation and downgrade resistance

- [ ] Selection consumes only local policy and a verified, admitted, current
      Peer Card projection.
- [ ] HTTP routes, transport hints and unverified remote responses cannot
      select a version.
- [ ] Bootstrap defaults to v1 and v0 bootstrap is per-peer explicit policy.
- [ ] Highest allowed common version is selected deterministically.
- [ ] No common version returns unavailable without a send.
- [ ] Selection binds peer, instance, card ID/revision and prior high-water.
- [ ] Stale, expired, forged or wrong-lineage Peer Cards cannot select.
- [ ] Lower selection than the retained high-water fails closed.
- [ ] Transport failure, timeout, overload or unsupported response cannot clear
      the high-water.
- [ ] Reset is explicit and bound to a newer admitted instance/card lineage.
- [ ] Mixed-version fanout partitions recipients before signing.
- [ ] Version-specific fanout uses distinct message/effect IDs and immutable
      outbox bytes.

## Crypto and transport compatibility

- [ ] Signer validates the selected version before private-key use.
- [ ] Verifier accepts v0/v1 independently from negotiation policy.
- [ ] V1 HTTP path accepts only v1 envelopes.
- [ ] V0 HTTP path is disabled by default and accepts only v0 when enabled.
- [ ] Client never rewrites version, probes fallback paths or follows
      redirects.
- [ ] Remote receipts do not reveal Peer Cards, version high-water, keys,
      admission or database state.
- [ ] Alpha 5 sender reaches Beta 1 v0 reader.
- [ ] Explicit Beta 1 v0 sender reaches Alpha 5.
- [ ] Beta 1 current-only mode refuses an Alpha 5-only peer before send.
- [ ] Beta/Beta selects and verifies v1.

## Durable records and snapshots

- [ ] Durable wrapper schema 2 is distinct from envelope, snapshot and database
      versions.
- [ ] Schema-1 records remain strictly readable in compatibility mode.
- [ ] Inbox/outbox expose and validate the exact envelope wire version.
- [ ] Canonical stored envelope bytes/digest recompute on every load.
- [ ] Snapshot format and snapshot schema version are explicit on Beta writes.
- [ ] Legacy untyped snapshots remain visibly legacy and cannot masquerade as
      a current typed format.
- [ ] Snapshot codec registry is construction-bound and exact-format selected.
- [ ] Codecs validate, deep-freeze, canonicalize and migrate deterministically.
- [ ] Unsupported/lossy downgrade is refused.
- [ ] Full tenant/Mesh/peer/instance scope remains on every durable record.
- [ ] Accepted receipt still occurs only after inbox commit.
- [ ] Snapshot, journal, outbox and inbox settlement remain one transaction.
- [ ] Stale/expired claims cannot mutate or settle work.
- [ ] Journal chain version and digests detect omission, reorder or rewrite.
- [ ] Outbox retry preserves exact signed bytes across restart.

## PostgreSQL migration 2

- [ ] Migration is explicit, schema-qualified, checksum-bound and advisory
      locked.
- [ ] Concurrent migration attempts converge on one installed history.
- [ ] Alpha 5 migration-1 schemas are adopted without data loss.
- [ ] Exactly derivable metadata is backfilled and validated.
- [ ] Opaque snapshot rows are counted and left explicitly unresolved until a
      caller codec migrates them.
- [ ] Codec backfill is bounded, idempotent and resumable.
- [ ] Interrupted migration/backfill resumes without partial logical state.
- [ ] Row counts, full scopes and canonical digests match before current-only
      mode.
- [ ] Beta writes cannot omit required metadata.
- [ ] Migration status reports versions/counts without application content.
- [ ] Normal rollback prefers the additive schema and Alpha-compatible readers.
- [ ] Destructive down requires exact confirmation, `allowDataLoss`, verified
      backup and zero incompatible row or an explicit loss decision.
- [ ] Caller-owned pools are never closed by migrations or repositories.

## Persistence fixtures

- [ ] Core peer, coordination, discovery and inbound states have canonical
      fixtures.
- [ ] Objective/Work schema versions 1 and 2 remain readable.
- [ ] Allocation schema versions 1 through 6 remain readable.
- [ ] Simulator snapshot/replay fixtures reproduce deterministically.
- [ ] Durable wrapper schemas 1 and 2 are represented.
- [ ] Migration-1 adoption and migration-2 expanded SQL manifests are frozen.
- [ ] Alpha 5 dump-manifest migration reproduces expected counts and digests.
- [ ] Fixtures contain no private key, credential or sensitive application
      content.

## Public conformance package

- [ ] Root capability/report contracts reject unknown fields and inconsistent
      counts.
- [ ] Protocol runner covers v0/v1 parse, canonicalization and signatures.
- [ ] Transport runner covers exact-byte retry, bounds and coarse receipts.
- [ ] Durability runner covers commit receipt, conflicts, claims, atomicity,
      journal and recovery.
- [ ] Rooms runner covers projection scope, stable idempotency and sink retry.
- [ ] Required protocol cases cannot be skipped.
- [ ] Every declared optional capability makes its cases mandatory.
- [ ] Undeclared optional capabilities are `not_declared`, not falsely passed.
- [ ] Harness uses caller factories, scopes, clocks, seeds and cleanup.
- [ ] No destructive resource operation occurs without explicit consent.
- [ ] Abort, timeout and cleanup failure are bounded and separately reported.
- [ ] Reports contain no raw envelope, payload, snapshot, credential or
      connection string.
- [ ] Agentplat reference implementations pass.
- [ ] Every deliberately broken implementation fails its expected case.
- [ ] Tarball and registry consumers can run the conformance package without
      workspace links.

## Compatibility matrix, soak and benchmarks

- [ ] Beta/Beta v1, Beta/Alpha v0 and Alpha/Beta v0 cells pass.
- [ ] Current-only, no-common-version, unknown-version and downgrade cells fail
      exactly as designed.
- [ ] Mixed-version multi-process workload converges after rolling restarts.
- [ ] Fault injection covers every inbox/outbox/migration crash window.
- [ ] Network duplicate, reorder, timeout and overload retain deterministic
      outcomes.
- [ ] Database interruption/recovery loses no accepted work.
- [ ] No stale assignment or database claim mutates state.
- [ ] Soak completes with bounded queues, zero integrity mismatch and complete
      cleanup.
- [ ] Benchmark manifest covers typical and boundary sizes.
- [ ] Report records environment, versions, concurrency, samples, median, p95,
      p99, throughput and errors.
- [ ] Correctness thresholds are normative; performance values are not
      misrepresented as universal SLOs.
- [ ] Benchmark and soak evidence bind the exact release commit.

## Quality, audit and publication

- [ ] Build, strict public types, unit tests and adapter tests pass.
- [ ] Inference Control and Trust scenario catalogs remain green.
- [ ] Public terminology, dependency, secret and package audits pass over
      source, build, fixtures, reports and tarballs.
- [ ] Architecture/API, protocol/security, persistence/migration and
      conformance audits have zero open P0/P1/P2 findings.
- [ ] All 34 packages install/import from cataloged tarballs.
- [ ] Every declared browser entrypoint passes browser traversal.
- [ ] Release manifests, packed files, versions and dependency ranges verify.
- [ ] Node 20/pnpm strict-TypeScript clean consumer passes.
- [ ] Node 22/npm plain-ESM clean consumer passes from an independent cache.
- [ ] Dry publication succeeds for the exact release commit.
- [ ] All 34 packages publish as `0.3.0-beta.1` under npm `next`.
- [ ] Every registry SHA512 integrity matches the final ledger.
- [ ] No staging distribution tag remains.
- [ ] Annotated `v0.3.0-beta.1` resolves to the published commit.
- [ ] Final machine-readable compatibility, benchmark and release evidence is
      merged into public `main` with zero open item.

## Evidence

Normative design commit: pending.

Design PR: pending.

Implementation commit and PR: pending.

Compatibility and fixture manifests: pending.

Soak and benchmark report: pending.

Dry-run and publication workflows: pending.

Registry integrity ledger and final evidence: pending.
