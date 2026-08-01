# Compatibility freeze threat model

Status: Beta 1 design candidate.

This document extends the Agent Mesh and adapter threat models for wire-version
negotiation, public API freeze, snapshot migration, conformance execution and
release-scale evidence.

## Assets

- the exact wire version covered by each signature;
- current and previous canonical fixture bytes and digests;
- authenticated Peer Card protocol-version claims;
- per-peer/instance/card version-selection high-water;
- private signing keys and public verification bindings;
- immutable inbox/outbox envelope bytes and digests;
- snapshot format, schema and integrity metadata;
- migration history, checksums, row counts and rollback decisions;
- journal ordering and chain anchors;
- public API baseline reports;
- conformance suite/fixture digests and result reports;
- soak and benchmark configuration/results;
- release commit, npm integrity ledger and annotated tag.

## Trust boundaries

```text
local version policy
        |
        v
verified + admitted Peer Card ----> pure selector ----> pinned version binding
        |                                  |                     |
        |                                  v                     v
        |                          unsigned envelope ----> signer/private key
        |                                                     |
        v                                                     v
transport route <---- immutable signed bytes ----> remote parser/verifier

stored legacy rows --> migration/codec boundary --> typed snapshot + metadata

third-party implementation --> isolated conformance harness --> redacted report
```

Crossing one boundary never satisfies the next. A signed Peer Card is not
admission. A selected wire version is not signing authority. A parsable
snapshot is not current or rollback-safe. A passing report is not operational
authorization.

## Adversaries and failures

- network attacker dropping, replaying, reordering or delaying Peer Cards;
- remote peer advertising false, unsorted, excessive or changing versions;
- stale admitted instance presenting an old lower-version card;
- proxy or route configuration attempting version fallback;
- caller attempting to relabel an already signed envelope;
- corrupted or conflicting v0/v1 message IDs and envelope bytes;
- malicious optional/critical extension data;
- database actor altering metadata, snapshots, journal rows or migration
  history;
- concurrent workers/migrators racing during upgrade;
- defective codec accepting the wrong format or nondeterministic migration;
- conformance implementation lying about capabilities or cleanup;
- harness target leaking secrets through errors, logs or reports;
- deliberately crafted implementation passing a shallow or optional-only
  suite;
- benchmark configuration hiding failures or producing misleading performance
  claims;
- package/release process mixing source, tarball, registry, tag or workflow
  commits.

## Required mitigations

| Threat                        | Mitigation                                                                                     | Verification                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Version stripping/downgrade   | select only from verified admitted current Peer Card; retain scoped high-water; explicit reset | forged, stale, lower-revision and transport-fallback scenarios |
| Bootstrap downgrade           | v1 default; v0 only through immutable per-peer bootstrap policy                                | absent-policy and wrong-peer tests                             |
| Post-sign relabel             | version participates in signing document; immutable envelope; verify after load                | v0/v1 substitution vectors                                     |
| Silent unsupported fallback   | no-common/unknown version is terminal for that attempt                                         | v2 and current-only interop tests                              |
| Route-based negotiation       | endpoint/path never selects; handler checks route/envelope coherence                           | alternate path, redirect and error-response tests              |
| Retry byte drift              | persist canonical signed bytes/digest and revalidate every load                                | crash after remote commit and byte-identity assertion          |
| Mixed-cohort alias            | select before signing; separate message/effect IDs per version cohort                          | mixed v0/v1 fanout test                                        |
| Critical-extension bypass     | unknown critical value fails before admission/replay/mutation                                  | unknown and removed-critical vectors                           |
| Fixture replacement           | byte-lock v0; complete manifest/digests/public keys for v1                                     | clean regeneration and substitution tests                      |
| Parser differential           | shared hard limits and canonical profile; version-specific expected results                    | malformed corpus across both parsers                           |
| Snapshot schema confusion     | explicit format/schema; exact codec binding; legacy marker                                     | wrong-codec, missing metadata and format-collision tests       |
| Nondeterministic migration    | pure one-step codecs, canonical digests and idempotent batches                                 | repeat, reorder, interrupt/resume tests                        |
| Partial database upgrade      | advisory lock, checksum history, expand-first schema, status/count validation                  | concurrent and statement-boundary fault injection              |
| Destructive rollback          | exact version, explicit data-loss flag, backup and incompatible-row guard                      | missing/wrong confirmation and Beta-only rows                  |
| Journal rewrite               | chain version, append-only sequence/digest checks and frozen anchors                           | mutate, delete, reorder and anchor mismatch tests              |
| False conformance pass        | required cases non-skippable; declared capability closes associated cases                      | skip manipulation and broken-adapter corpus                    |
| Harness resource damage       | caller isolation/cleanup; destructive consent; hard bounds                                     | wrong-scope, abort and cleanup-failure tests                   |
| Report exfiltration           | closed redacted report; forbidden-field scan; bounded reasons                                  | secret-like nested error fixtures                              |
| Performance misrepresentation | workload/environment manifest; correctness separate from diagnostic metrics                    | missing metadata and injected error-count tests                |
| API baseline evasion          | generate from tarballs; compile Alpha 5 consumers; reject surface/dependency drift             | removal, narrowing, hoisting and side-effect fixtures          |
| Release artifact mix          | exact SHA at CI/dry/publish; registry integrity; annotated tag; merged evidence                | commit/manifest/integrity mismatch tests                       |

## Downgrade model

The version selector is local policy, not a network handshake. The selected
version is bound to the exact tenant, Mesh, peer, process instance, accepted
Peer Card ID/revision and prior high-water.

An attacker may suppress v1-capable Peer Cards and cause unavailability, but
must not cause automatic v0 use. Availability loss is preferable to an
unauthorized downgrade. A local operator can authorize v0 bootstrap or reset
for a specific admitted lineage; that decision is explicit, auditable and not
derived from a remote error.

Peer Card signature verification alone is insufficient. Admission, instance,
validity, revision and predecessor checks must succeed before advertised
versions affect selection. An old signed card cannot roll back the high-water.

## Signed-byte and replay model

The same logical payload signed under v0 and v1 produces different signed
documents. A sender cannot change versions for an already committed outbox
attempt. A new version-specific envelope is a new message, not a retry.

Repositories reparse and recompute canonical bytes/digests after JSON/database
load. The durable message-ID conflict rule remains exact per receiver scope.
Domain reducers retain their own record-ID idempotency and authority checks.

## Persistence and migration model

Migration 2 expands the database before requiring new metadata. Exactly
derivable wire/record metadata may be backfilled automatically. Snapshot
content format cannot be guessed from arbitrary Alpha 5 JSON, so such rows stay
explicitly legacy until a caller binds a codec.

Migration status and codec runs use full tenant/Mesh/peer/instance scope. A
partial batch cannot mark an unresolved row current. Re-execution is
idempotent. Current-only mode requires zero unresolved legacy row in the
selected scope and exact count/digest validation.

The migration framework does not establish snapshot confidentiality or
rollback freshness. Callers retain encryption, backup and external anchor
responsibilities.

## Conformance model

The harness executes untrusted or defective implementation code inside a
caller-owned isolation boundary. Timeouts and aborts are cooperative within a
process; high-risk implementations should be run in separate processes or
containers. The package does not claim to sandbox arbitrary JavaScript.

A report proves that the named implementation artifact produced the recorded
outcomes for the exact suite/fixture digest. It does not prove:

- absence of hidden behavior;
- correctness outside declared capabilities;
- production deployment security;
- identity, Trust, permission or certification;
- cross-language compatibility unless that implementation ran the suite.

Required protocol cases cannot be skipped. Optional adapter cases become
required once the implementation declares the capability.

## Public API compatibility model

An export-name manifest alone cannot prove TypeScript source compatibility.
Beta 1 therefore combines packed runtime/type inventories, unchanged Alpha 5
consumer compilation, negative breaking-change fixtures and functional clean
consumers.

The freeze does not promise ABI compatibility for unpublished internals,
private class fields, generated temporary files or undocumented deep imports.
Only cataloged package exports are public.

## Privacy and logging

Diagnostics and reports may include bounded case ID, coarse reason, wire
version, package version, fixture digest, counts and timings. They must not
include raw payloads, envelope signatures, private keys, credentials,
connection strings, unredacted snapshots or database rows.

Version availability can itself reveal software age. Remote receipts therefore
use coarse unsupported/permanent classes and do not expose the full local
supported set or downgrade high-water.

## Availability and resource bounds

- supported versions: exactly two in Beta 1;
- advertised versions: at most eight;
- conformance capabilities and case counts: hard bounded by suite schema;
- per-case timeout and total suite timeout: required;
- report strings, cases and serialized bytes: bounded;
- migration batch size and transaction duration: bounded;
- benchmark samples, concurrency and payload size: bounded;
- no fallback loop or recursive version probe;
- no unbounded report/log retention.

## Residual risks

- Explicit v0 compatibility retains the security properties and limitations of
  the frozen Alpha 5 protocol.
- A compromised admitted peer can truthfully sign a misleading Peer Card; local
  policy and high-water limit downgrade but cannot make the peer honest.
- A caller-selected snapshot codec can be defective; conformance and fixtures
  reduce but cannot eliminate that risk.
- TypeScript structural compatibility tests cannot cover every consumer
  program. Reviewed API reports and versioned contracts remain necessary.
- Performance results vary by environment and are not capacity promises.
- Process-local timeout cannot safely terminate arbitrary hostile JavaScript;
  external isolation is required for untrusted implementations.

## Incident and rollback posture

On suspected downgrade, fixture, migration or integrity failure:

1. stop new sends/claims/migration batches;
2. preserve signed bytes, migration history and redacted diagnostics;
3. keep version high-water and assignment/database fences intact;
4. do not relabel or resign pending outbox work automatically;
5. restore npm `next` only to an integrity-verified prior version;
6. prefer additive-schema binary rollback over destructive database down;
7. require explicit reconciliation for Beta-only work;
8. publish a new version for any artifact correction;
9. record the affected commits, fixture digests and scopes.

## Acceptance boundary

Beta 1 is blocked by any signature/version confusion, silent downgrade, v0
fixture drift, ambiguous snapshot schema, false conformance pass, lost accepted
work, stale-fence mutation, partial migration, secret-bearing evidence,
registry integrity mismatch or open P0/P1/P2 release finding.
