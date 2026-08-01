# Agent Mesh `0.3.0-beta.1` acceptance checklist

Status: accepted. Every checkbox is closed by evidence tied to the exact
reviewed design or release commit. Local results from another commit are not
release evidence.

## Release identity and design freeze

- [x] Version is `0.3.0-beta.1` across the root and every public package.
- [x] Compatibility baseline is annotated tag `v0.3.0-alpha.5` at
      `5d11f715947bd7d3e5b8f7311c8f6f68c8c33a98`.
- [x] Design plan, threat model, package boundaries and non-goals are reviewed.
- [x] Design review records zero open P0/P1/P2 findings.
- [x] Exact normative design commit is recorded before implementation.
- [x] Production implementation contains no unreviewed scope outside the
      frozen design.

## Public package and API compatibility

- [x] Public catalog contains exactly 34 coordinated packages.
- [x] `@agentplat/mesh-conformance` is provider-neutral, side-effect-free on
      import and isolated from production dependency graphs.
- [x] Framework does not re-export Mesh or conformance packages.
- [x] Alpha 5 public-contract source fixtures compile unchanged against packed
      Beta 1 declarations.
- [x] Packed public-surface reports cover every package and export subpath.
- [x] No Alpha 5 export or subpath is removed or renamed.
- [x] No input is narrowed and no required parameter/property is added to an
      existing contract.
- [x] Versioned closed unions and discriminants remain source-compatible.
- [x] Browser entrypoints gain no Node built-in or provider-specific edge.
- [x] Runtime, Sessions, Rooms and Framework defaults remain unchanged.
- [x] All imports perform no network, database, migration, registration or
      telemetry side effect.

## Wire version 1

- [x] Current, previous and supported wire-version constants are public and
      exact: `1`, `0` and `[0, 1]`.
- [x] General envelope types and parsers represent both supported read
      versions without erasing the exact version.
- [x] Producer helpers default to v1.
- [x] V0 production requires an explicit construction-bound signing policy.
- [x] No existing payload shape or message family changes in Beta 1.
- [x] `wireVersion` remains part of the signed document.
- [x] Version replacement invalidates verification.
- [x] Retries preserve exact canonical signed bytes.
- [x] Parser policies can narrow but cannot add unsupported versions.
- [x] Unknown wire versions fail explicitly without fallback.
- [x] Peer Card protocol versions are sorted, unique, bounded and include the
      envelope's own version.
- [x] Unknown optional extensions remain ordinary signed data.
- [x] Unknown critical extensions fail before state mutation.

## Canonical protocol fixtures

- [x] Every committed v0 fixture is byte-identical to Alpha 5.
- [x] Every implemented message type has exactly one valid v1 fixture.
- [x] Fixture manifest accounts for every file with no duplicate/untracked
      vector.
- [x] File, canonical envelope, payload and signing-document digests recompute.
- [x] Public test keys and signatures verify; no private fixture key ships.
- [x] Deterministic generation reproduces all v1 bytes.
- [x] Malformed fixture classes produce their exact bounded coarse outcome.
- [x] V0 and v1 fixtures cannot substitute for each other's signature.

## Negotiation and downgrade resistance

- [x] Selection consumes only local policy and a verified, admitted, current
      Peer Card projection.
- [x] HTTP routes, transport hints and unverified remote responses cannot
      select a version.
- [x] Bootstrap defaults to v1 and v0 bootstrap is per-peer explicit policy.
- [x] Highest allowed common version is selected deterministically.
- [x] No common version returns unavailable without a send.
- [x] Selection binds peer, instance, card ID/revision and prior high-water.
- [x] Stale, expired, forged or wrong-lineage Peer Cards cannot select.
- [x] Lower selection than the retained high-water fails closed.
- [x] Transport failure, timeout, overload or unsupported response cannot clear
      the high-water.
- [x] Reset is explicit and bound to a newer admitted instance/card lineage.
- [x] Mixed-version fanout partitions recipients before signing.
- [x] Version-specific fanout uses distinct message/effect IDs and immutable
      outbox bytes.

## Crypto and transport compatibility

- [x] Signer validates the selected version before private-key use.
- [x] Verifier accepts v0/v1 independently from negotiation policy.
- [x] V1 HTTP path accepts only v1 envelopes.
- [x] V0 HTTP path is disabled by default and accepts only v0 when enabled.
- [x] Client never rewrites version, probes fallback paths or follows
      redirects.
- [x] Remote receipts do not reveal Peer Cards, version high-water, keys,
      admission or database state.
- [x] Alpha 5 sender reaches Beta 1 v0 reader.
- [x] Explicit Beta 1 v0 sender reaches Alpha 5.
- [x] Beta 1 current-only mode refuses an Alpha 5-only peer before send.
- [x] Beta/Beta selects and verifies v1.

## Durable records and snapshots

- [x] Durable wrapper schema 2 is distinct from envelope, snapshot and database
      versions.
- [x] Schema-1 records remain strictly readable in compatibility mode.
- [x] Inbox/outbox expose and validate the exact envelope wire version.
- [x] Canonical stored envelope bytes/digest recompute on every load.
- [x] Snapshot format and snapshot schema version are explicit on Beta writes.
- [x] Legacy untyped snapshots remain visibly legacy and cannot masquerade as
      a current typed format.
- [x] Snapshot codec registry is construction-bound and exact-format selected.
- [x] Codecs validate, deep-freeze, canonicalize and migrate deterministically.
- [x] Unsupported/lossy downgrade is refused.
- [x] Full tenant/Mesh/peer/instance scope remains on every durable record.
- [x] Accepted receipt still occurs only after inbox commit.
- [x] Snapshot, journal, outbox and inbox settlement remain one transaction.
- [x] Stale/expired claims cannot mutate or settle work.
- [x] Journal chain version and digests detect omission, reorder or rewrite.
- [x] Outbox retry preserves exact signed bytes across restart.

## PostgreSQL migration 2

- [x] Migration is explicit, schema-qualified, checksum-bound and advisory
      locked.
- [x] Concurrent migration attempts converge on one installed history.
- [x] Alpha 5 migration-1 schemas are adopted without data loss.
- [x] Exactly derivable metadata is backfilled and validated.
- [x] Opaque snapshot rows are counted and left explicitly unresolved until a
      caller codec migrates them.
- [x] Codec backfill is bounded, idempotent and resumable.
- [x] Interrupted migration/backfill resumes without partial logical state.
- [x] Row counts, full scopes and canonical digests match before current-only
      mode.
- [x] Beta writes cannot omit required metadata.
- [x] Migration status reports versions/counts without application content.
- [x] Normal rollback prefers the additive schema and Alpha-compatible readers.
- [x] Destructive down requires exact confirmation, `allowDataLoss`, verified
      backup and zero incompatible row or an explicit loss decision.
- [x] Caller-owned pools are never closed by migrations or repositories.

## Persistence fixtures

- [x] Core peer, coordination, discovery and inbound states have canonical
      fixtures.
- [x] Objective/Work schema versions 1 and 2 remain readable.
- [x] Allocation schema versions 1 through 6 remain readable.
- [x] Simulator snapshot/replay fixtures reproduce deterministically.
- [x] Durable wrapper schemas 1 and 2 are represented.
- [x] Migration-1 adoption and migration-2 expanded SQL manifests are frozen.
- [x] Alpha 5 dump-manifest migration reproduces expected counts and digests.
- [x] Fixtures contain no private key, credential or sensitive application
      content.

## Public conformance package

- [x] Root capability/report contracts reject unknown fields and inconsistent
      counts.
- [x] Protocol runner covers v0/v1 parse, canonicalization and signatures.
- [x] Transport runner covers exact-byte retry, bounds and coarse receipts.
- [x] Durability runner covers commit receipt, conflicts, claims, atomicity,
      journal and recovery.
- [x] Rooms runner covers projection scope, stable idempotency and sink retry.
- [x] Required protocol cases cannot be skipped.
- [x] Every declared optional capability makes its cases mandatory.
- [x] Undeclared optional capabilities are `not_declared`, not falsely passed.
- [x] Harness uses caller factories, scopes, clocks, seeds and cleanup.
- [x] No destructive resource operation occurs without explicit consent.
- [x] Abort, timeout and cleanup failure are bounded and separately reported.
- [x] Reports contain no raw envelope, payload, snapshot, credential or
      connection string.
- [x] Agentplat reference implementations pass.
- [x] Every deliberately broken implementation fails its expected case.
- [x] Tarball and registry consumers can run the conformance package without
      workspace links.

## Compatibility matrix, soak and benchmarks

- [x] Beta/Beta v1, Beta/Alpha v0 and Alpha/Beta v0 cells pass.
- [x] Current-only, no-common-version, unknown-version and downgrade cells fail
      exactly as designed.
- [x] Mixed-version multi-process workload converges after rolling restarts.
- [x] Fault injection covers every inbox/outbox/migration crash window.
- [x] Network duplicate, reorder, timeout and overload retain deterministic
      outcomes.
- [x] Database interruption/recovery loses no accepted work.
- [x] No stale assignment or database claim mutates state.
- [x] Soak completes with bounded queues, zero integrity mismatch and complete
      cleanup.
- [x] Benchmark manifest covers typical and boundary sizes.
- [x] Report records environment, versions, concurrency, samples, median, p95,
      p99, throughput and errors.
- [x] Correctness thresholds are normative; performance values are not
      misrepresented as universal SLOs.
- [x] Benchmark and soak evidence bind the exact release commit.

## Quality, audit and publication

- [x] Build, strict public types, unit tests and adapter tests pass.
- [x] Inference Control and Trust scenario catalogs remain green.
- [x] Public terminology, dependency, secret and package audits pass over
      source, build, fixtures, reports and tarballs.
- [x] Architecture/API, protocol/security, persistence/migration and
      conformance audits have zero open P0/P1/P2 findings.
- [x] All 34 packages install/import from cataloged tarballs.
- [x] Every declared browser entrypoint passes browser traversal.
- [x] Release manifests, packed files, versions and dependency ranges verify.
- [x] Node 20/pnpm strict-TypeScript clean consumer passes.
- [x] Node 22/npm plain-ESM clean consumer passes from an independent cache.
- [x] Dry publication succeeds for the exact release commit.
- [x] All 34 packages publish as `0.3.0-beta.1` under npm `next`.
- [x] Every registry SHA512 integrity matches the final ledger.
- [x] No staging distribution tag remains.
- [x] Annotated `v0.3.0-beta.1` resolves to the published commit.
- [x] Final machine-readable compatibility, benchmark and release evidence is
      merged into public `main` with zero open item.

## Evidence

Normative design commit:
[`9d726581f5689a4d72c4f31d8a2a4049d0112ccf`](https://github.com/Agentplat/agentplat/commit/9d726581f5689a4d72c4f31d8a2a4049d0112ccf).

Design PR: [#46](https://github.com/Agentplat/agentplat/pull/46).

Implementation commit:
[`b38c25098599499813fe2caea605b5d61f939222`](https://github.com/Agentplat/agentplat/commit/b38c25098599499813fe2caea605b5d61f939222).

Implementation PR: [#48](https://github.com/Agentplat/agentplat/pull/48).

Compatibility and fixture manifests:
[compatibility report](./beta-1-compatibility-report.json),
[v0 manifest](../../packages/mesh-protocol/fixtures/v0/manifest.json),
[v1 manifest](../../packages/mesh-protocol/fixtures/v1/manifest.json) and
[persistence manifest](../../packages/mesh/fixtures/beta1/manifest.json).

Scale and failure evidence:
[PostgreSQL fault report](./beta-1-postgres-fault-report.json),
[soak report](./beta-1-soak-report.json) and
[benchmark report](./beta-1-benchmark-report.json).

Dry-run workflow:
[30684349222](https://github.com/Agentplat/agentplat/actions/runs/30684349222).

Publication workflow:
[30684566608](https://github.com/Agentplat/agentplat/actions/runs/30684566608).

Annotated release tag:
[`v0.3.0-beta.1`](https://github.com/Agentplat/agentplat/tree/v0.3.0-beta.1).

Registry integrity ledger and final evidence:
[Beta 1 release evidence](./beta-1-release-evidence.json).
