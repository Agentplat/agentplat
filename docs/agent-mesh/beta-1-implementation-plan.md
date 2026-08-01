# Agent Mesh `0.3.0-beta.1` compatibility-freeze implementation plan

Status: design frozen; implementation not started. This plan, its acceptance
checklist and its threat model were accepted in public
[PR #46](https://github.com/Agentplat/agentplat/pull/46) as the normative design
freeze with zero open P0/P1 findings. The freeze is anchored by merge commit
[`9d726581f5689a4d72c4f31d8a2a4049d0112ccf`](https://github.com/Agentplat/agentplat/commit/9d726581f5689a4d72c4f31d8a2a4049d0112ccf).

## Objective

Beta 1 converts the additive Alpha 5 surface into a compatibility contract. It
freezes wire version 1, preserves explicit interoperability with wire version
0, freezes canonical protocol and persistence fixtures, introduces a public
conformance package, and ties scale evidence to the exact release commit.

The milestone succeeds only if an application can answer, with reproducible
evidence:

1. which wire version was selected for each peer and why;
2. which exact bytes were signed, accepted, retried and persisted;
3. which snapshot format and schema version are stored;
4. whether an Alpha 5 database and fixture corpus can be read and migrated;
5. whether an alternate adapter satisfies the same observable contract;
6. whether the packed and registry artifacts preserve the reviewed public API;
7. which release commit produced every compatibility and benchmark result.

## Release identity

- release version: `0.3.0-beta.1`;
- npm distribution tag: `next`;
- compatibility baseline: `v0.3.0-alpha.5`;
- baseline release commit:
  `5d11f715947bd7d3e5b8f7311c8f6f68c8c33a98`;
- baseline evidence commit:
  `afbf7cb0796c0387a030a7ef7751fb958c265b86`;
- current wire version: `1`;
- preceding readable and explicitly writable wire version: `0`;
- protocol identifier: `agentplat.mesh`;
- signature algorithm: Ed25519;
- canonical JSON profile: the existing bounded RFC 8785-compatible profile;
- coordinated public package count: 34 after adding
  `@agentplat/mesh-conformance`;
- existing package versions move together; no package is independently
  promoted.

The npm package version, wire version, snapshot schema version, database
migration version and conformance report version remain independent values.

## Verified Alpha 5 baseline

The design audit starts from public `main` after the Alpha 5 evidence merge.
The unmodified baseline passed:

- public-surface audit over 946 files with zero secret or restricted-term
  findings;
- build and strict public type checks for 33 publishable packages;
- 519 unit subtests: 513 passed, six intentional `todo`, zero failures;
- existing adapter suites;
- 28 Inference Control scenarios and 27 Trust scenarios;
- release verification for 33 package manifests;
- 33 isolated tarballs and 45 declared exports;
- the signed Mesh scenario, allocation/recovery scenario, Trust consumer and
  Alpha 5 adapter consumer.

This baseline is evidence for planning only. Beta 1 acceptance requires the
same gates against the exact Beta 1 release commit.

## Non-goals

Beta 1 does not:

- change the protocol identifier or signature algorithm;
- add a new message family or change an existing payload schema;
- translate or relabel an already signed envelope;
- infer peer compatibility from an HTTP route, DNS name, transport hint or
  unauthenticated response;
- silently downgrade after a peer has been pinned to a higher wire version;
- make optional extensions authoritative;
- introduce global membership, global routing or a universal capability
  registry;
- add broker, queue or service-mesh adapters;
- promise exactly-once network delivery or external effects;
- make PostgreSQL mandatory;
- encrypt payloads, snapshots or journal contents;
- certify implementations in languages that have not executed the fixtures;
- define a universal throughput or latency service-level objective;
- re-export Mesh or conformance packages from Framework;
- change Runtime, Sessions, Rooms or Framework default behavior;
- publish hosted infrastructure or operate a control plane.

## Compatibility invariants

The implementation must preserve all of the following:

1. Version selection occurs before payload hashing and signing.
2. `wireVersion` remains inside the signed document.
3. A signed v0 envelope never becomes v1 by field replacement, and vice
   versa.
4. Retries use the same canonical signed bytes, message ID and target binding.
5. Readers accept only the explicitly supported set `{0, 1}`.
6. Writers default to v1 and may emit v0 only under an explicit
   construction-bound compatibility policy.
7. The selected version is the highest allowed intersection between local
   policy and an authenticated, admitted current Peer Card.
8. A lower version than the pinned high-water fails closed unless an explicit
   operator-authorized reset is applied to a newer admitted instance/card
   lineage.
9. Unknown critical extensions fail before admission, replay or state
   mutation. Unknown optional extensions are retained as ordinary signed data.
10. Envelope validation, signature verification, admission, replay,
    assignment authority and Trust remain separate decisions.
11. Snapshot wrapper version, snapshot content format and snapshot content
    schema are never conflated.
12. Database migrations are explicit, locked, idempotent and never run on
    import.
13. A conformance pass proves only the exercised contract and declared
    capabilities; it does not prove operational security or correctness of
    unexercised code.
14. No compatibility path grants identity, admission, permission, assignment,
    fencing, Room approval or Action Grant authority.
15. Published versions and release evidence are immutable.

## Public package and dependency boundaries

### Existing packages

`@agentplat/mesh-protocol` owns:

- current, previous and supported wire-version constants;
- version-parameterized envelope types;
- strict v0/v1 parsing and canonicalization;
- version-specific fixture manifests;
- protocol compatibility and error contracts.

`@agentplat/mesh-crypto` owns:

- signing-policy enforcement before a v0 or v1 envelope is signed;
- verification for both supported versions;
- version-preserving signature and payload-hash operations.

`@agentplat/mesh/coordination` owns:

- authenticated Peer Card version projections;
- pure version selection and downgrade-fence state;
- version-specific preparation before signing;
- migration of the discovery snapshot that retains the version high-water.

`@agentplat/mesh-http` owns:

- the v1 default route;
- explicit optional v0 route compatibility;
- path/envelope-version coherence;
- bounded receipts that do not reveal negotiation state.

`@agentplat/mesh/durability` owns:

- versioned durable record contracts;
- explicit snapshot content descriptors;
- canonical envelope bytes and digest invariants;
- provider-neutral migration/codec contracts.

`@agentplat/mesh-postgres` owns:

- additive database migration 2;
- stored record and snapshot metadata;
- Alpha 5 row adoption and backfill support;
- migration status and rollback guards.

`@agentplat/mesh-sim` owns:

- deterministic mixed-version peer scenarios;
- downgrade, incompatibility and upgrade fault plans;
- version-aware trace and replay fixtures.

`@agentplat/rooms-mesh` remains a projection boundary. It consumes accepted
domain records and gains no wire-version authority.

### New package: `@agentplat/mesh-conformance`

This provider-neutral testing package is the public home for compatibility
runners and reports. It is in the `testing` layer, is not re-exported by any
runtime package and has no import-time I/O.

Planned subpaths:

| Subpath        | Responsibility                                                           |
| -------------- | ------------------------------------------------------------------------ |
| `.`            | closed suite/report contracts, capability manifest and report validation |
| `./protocol`   | v0/v1 parser, canonicalization and fixture runner                        |
| `./transport`  | generic signed-byte delivery and coarse-receipt runner                   |
| `./durability` | durable inbox/outbox/snapshot/journal contract runner                    |
| `./rooms`      | idempotency repository and projection-sink contract runner               |

The package may depend on protocol, Mesh durability and Rooms bridge contracts.
Production packages never depend on the conformance package.

## Wire version contract

### Constants and types

The protocol root will export:

```ts
MESH_WIRE_VERSION = 1;
MESH_PREVIOUS_WIRE_VERSION = 0;
MESH_SUPPORTED_WIRE_VERSIONS = [0, 1];
type MeshWireVersion = 0 | 1;
```

Envelope types become version-parameterized without removing existing names.
The default public envelope type can represent either supported read version;
producer inputs use an explicit version parameter and helpers default to the
current version. Existing code that uses `MESH_WIRE_VERSION` moves to v1
without source changes. Existing source that explicitly models v0 remains
compilable through the supported-version union and v0 aliases.

No v1 payload field changes are planned. Beta 1 freezes the reviewed Alpha 5
payload shapes under a new signed wire-version value. This deliberately
separates protocol stabilization from feature expansion.

### Parser profiles

The general strict parser accepts v0 and v1 and returns the exact version in
the branded result. Version-specific parser helpers require exactly one
version. Parser options can narrow accepted versions but cannot add versions
outside the built-in supported set.

Every version uses the same pre-parse byte, depth, key, array, string and
lifetime ceilings unless a versioned fixture states a stricter bound. A caller
may only narrow the existing hard maxima.

The validator for `PeerCardPayload.protocolVersions` requires:

- one to eight sorted unique non-negative safe integers;
- inclusion of the envelope's own wire version;
- no assumption that an advertised unknown version is implemented locally;
- no selection before signature, admission and card-lineage checks pass.

### Canonical bytes and signatures

Canonical payload bytes remain independent of wire version because the payload
schema is unchanged. The signing document includes `wireVersion`, so the v0 and
v1 signatures and canonical envelope bytes differ.

The reference signer:

- defaults to signing only v1;
- accepts v0 only if its immutable signing policy lists v0;
- validates the complete unsigned envelope before invoking the private key;
- never rewrites version, message ID, audience, extension or time fields;
- returns the exact selected version in the branded signed type.

The reference verifier accepts both versions by default and may be narrowed by
policy. Verification never performs negotiation or downgrade decisions.

### Message identity across versions

One stored outbound attempt has one version and one immutable signed byte
sequence. It cannot be re-encoded under another version after commit.

If an application creates version-specific fanout records for different peer
cohorts, each prepared envelope has its own message ID and outbox effect ID.
Domain record IDs and correlation IDs may bind the common logical operation.
Delivering two differently signed versions to the same receiver is not a retry;
it is a separate message and remains subject to domain idempotency/conflict
rules.

## Negotiation and downgrade protection

### Inputs

Version selection consumes only:

- an immutable local policy listing allowed current/previous versions;
- an admitted peer and exact process instance;
- the current signature-verified Peer Card projection;
- the Peer Card revision and predecessor lineage;
- an optional existing per-peer version high-water;
- an explicit bootstrap version for a peer without an accepted card.

HTTP status, redirect targets, TLS negotiation, route names, transport hints,
unverified payloads and remote error bodies are never selection inputs.

### Bootstrap

There is no unsigned version-negotiation endpoint. Before a current Peer Card
exists, outbound bootstrap uses a construction-bound per-peer policy:

- default: v1 only;
- compatibility mode: explicitly configured v0 bootstrap for an admitted
  peer/instance;
- no configuration: no automatic retry under a lower version.

A v0 bootstrap Peer Card may advertise `[0, 1]`. Once its signature, admission,
instance, card revision and validity are accepted, the selector can pin v1 for
subsequent messages.

### Selection

The pure selector computes the highest version in the intersection of:

1. locally implemented versions;
2. locally allowed versions for that peer;
3. versions advertised by the current accepted Peer Card.

No intersection produces `wire_version_unavailable`. The result binds peer ID,
instance ID, Peer Card ID, card revision, selected version and the prior
high-water. Callers must include this binding when preparing an outbound
envelope.

### Downgrade fence

For one admitted peer/card lineage, a selection lower than the retained
high-water produces `wire_version_downgrade`. A newer card that removes v1 does
not by itself authorize fallback. Reset requires an explicit immutable local
decision bound to the new admitted instance or card lineage. The decision is
auditable but is not carried as remote authority.

Peer restart, transport failure, timeout, overload, connection refusal and an
`unsupported_wire_version` receipt never clear the high-water.

### Mixed-version fanout

Topic routing partitions selected recipients by wire version before signing.
Each partition produces version-specific immutable envelopes and per-recipient
outbox targets. A single signed envelope is never mutated while traversing a
mixed cohort. Failed selection for one recipient does not silently remove it
from diagnostics, nor does it grant delivery to another peer.

## HTTP compatibility

The current default path becomes `/agentplat/mesh/v1/envelopes`. The v0 path
remains `/agentplat/mesh/v0/envelopes` and is enabled only by explicit handler
policy.

The handler requires route/envelope coherence:

- v1 route accepts only a v1 envelope;
- v0 route accepts only a v0 envelope;
- wrong or disabled versions produce the same bounded unsupported/permanent
  disposition without revealing local peer-card or downgrade state;
- authentication runs before durable receipt and remains independent of wire
  identity;
- CORS policy is still construction-bound and does not advertise versions.

The client sends one already signed envelope to one resolved endpoint. It does
not select or rewrite the version, follow redirects, probe alternate version
paths or retry under a different version.

## Persistence freeze

### Separate version domains

Beta 1 distinguishes:

| Domain                       | Meaning                                                      |
| ---------------------------- | ------------------------------------------------------------ |
| durable record schema        | shape of inbox, outbox, snapshot and journal wrapper records |
| envelope wire version        | exact signed protocol version stored in inbox/outbox         |
| snapshot format              | stable owner-qualified identifier for snapshot content       |
| snapshot schema version      | version interpreted by the selected snapshot codec           |
| PostgreSQL migration version | installed physical database schema                           |
| journal chain version        | digest material and chain rules                              |

No field substitutes for another.

### Durable record schema 2

The provider-neutral durable contracts advance to wrapper schema 2 while
retaining strict readers for Alpha 5 wrapper schema 1. Schema 2 adds:

- `envelopeWireVersion` on inbox and outbox records;
- `envelopeCanonicalBytes` or an equivalent immutable canonical-byte result
  whose digest is rechecked on every load;
- `snapshotFormat` and `snapshotSchemaVersion` on peer snapshots;
- an explicit journal chain version;
- legacy/untyped snapshot status during migration;
- closed migration reason codes.

New writes require typed snapshot metadata. Legacy rows may be read in an
explicit compatibility mode but cannot be silently treated as a typed current
snapshot.

### Snapshot codecs

A construction-bound `MeshSnapshotCodec` owns:

- one exact format identifier;
- current and readable schema versions;
- strict validation and deep freezing;
- canonical byte production and digest verification;
- deterministic one-step migrations;
- optional downgrade only when lossless and explicitly declared.

Repositories store bytes/JSON and metadata; they do not infer a codec from
untrusted state. Importing or constructing a repository does not migrate data.

### PostgreSQL migration 2

Migration 2 is expand-only for normal upgrade:

1. add nullable record-version, wire-version, snapshot-format,
   snapshot-schema and chain-version metadata;
2. backfill values that can be derived exactly from stored envelopes/records;
3. leave Alpha 5 opaque snapshot content explicitly marked legacy/untyped;
4. add indexes and checks in a non-destructive compatible form;
5. expose counts and unresolved legacy rows through migration status;
6. require an application-supplied codec/backfill operation for opaque
   snapshots;
7. validate digests, counts and full scope before current-only mode;
8. make Beta writes require complete metadata.

The old columns and rows remain throughout Beta 1. Contract/removal is a later
release. A down migration is allowed only with exact version confirmation,
`allowDataLoss`, no incompatible Beta-only row, and an explicit snapshot
backup/recovery procedure.

### Frozen persistence fixtures

Fixtures cover:

- core peer state;
- coordination state;
- discovery state with wire-version high-water;
- inbound replay state;
- Objective/Work schema versions 1 and 2;
- Allocation schema versions 1 through 6;
- simulator snapshot and replay trace;
- durable wrapper schemas 1 and 2;
- PostgreSQL migration-1 schema adoption;
- PostgreSQL migration-2 expanded schema;
- one Alpha 5 database dump manifest and its expected migrated counts/digests.

Sensitive application content and private keys are absent. Fixture manifests
record canonical SHA-256 digests and expected reader/migration outcomes.

## Canonical protocol fixtures

`packages/mesh-protocol/fixtures/v0` remains byte-for-byte frozen. Beta 1 adds
`fixtures/v1` with one valid signed fixture for every implemented message type,
plus malformed fixture manifests for shared boundary classes.

Each valid fixture record binds:

- file name and message type;
- exact UTF-8 file SHA-256;
- canonical envelope SHA-256;
- payload canonical SHA-256;
- signing-document SHA-256;
- public key ID and public test key;
- expected wire version and parser outcome.

Private fixture keys are generation-only test assets and are not published.
Committed fixtures contain signatures and public keys only. A deterministic
fixture-generation command must reproduce bytes in a clean checkout or fail on
any difference.

The fixture gate verifies:

- all v0 bytes are unchanged from Alpha 5;
- every v1 message family is represented exactly once;
- fixture manifests have no untracked or duplicate file;
- payload/signing/envelope digests recompute;
- malformed vectors fail with the expected coarse code and bounded path;
- v0 and v1 copies cannot substitute for one another's signature.

## Public conformance suite

### Suite contract

The conformance package exports a closed capability manifest. Implementations
declare only capabilities they actually expose. Initial capabilities are:

- protocol v0 read;
- protocol v0 explicit write;
- protocol v1 read/write;
- canonical JSON and signing-document compatibility;
- transport exact-byte retry;
- bounded coarse transport receipts;
- durable inbox;
- atomic transition/outbox;
- fenced claims;
- journal hash chain;
- snapshot codec migration;
- Room projection idempotency.

Required Beta 1 protocol capabilities cannot be skipped. Optional adapter
capabilities may be absent, but a declared capability makes every associated
case mandatory.

### Harness isolation

Each runner receives a caller factory that returns an isolated implementation,
scope and cleanup callback. Runners:

- do no work on import;
- never read ambient credentials;
- use caller-supplied clocks, random seeds and temporary resources;
- apply hard case and timeout ceilings;
- do not delete caller resources without explicit destructive-test consent;
- redact envelopes, connection strings and application state from reports;
- always attempt cleanup after failure/abort;
- report cleanup failure separately from behavioral failure.

### Report schema

The machine-readable report includes:

- report schema version;
- conformance package version;
- suite and fixture-manifest digests;
- implementation name/version supplied by the caller;
- declared capabilities;
- deterministic seed;
- case IDs and `passed`, `failed`, `skipped` or `not_declared` outcome;
- bounded reason codes;
- redacted environment facts;
- start/end timestamps supplied by the harness clock;
- aggregate counts and final verdict.

Raw secrets, payload content, snapshots and database rows are forbidden. A
valid report is evidence that the named binary passed those cases, not a trust
or certification credential.

### Reference and negative implementations

The suite runs against Agentplat reference adapters and deliberately broken
test doubles. Negative doubles include:

- parser accepting an unsupported version;
- signer relabeling after signing;
- transport following redirects or changing retry bytes;
- inbox acknowledging before commit;
- repository allowing stale claims;
- non-atomic snapshot/outbox transition;
- journal with a broken previous digest;
- bridge without stable idempotency.

The harness is accepted only when it passes the references and catches every
negative double.

## Public API compatibility freeze

### Baseline inventory

Beta 1 creates a machine-readable public-surface report for every package and
declared export subpath. It records:

- package and subpath;
- runtime export names;
- type export names;
- declaration entrypoint digest;
- browser/Node classification;
- side-effect declaration;
- internal public dependency edges.

The report is generated from packed tarballs, not only source files.

### Compatibility gates

The Alpha 5 public-contract sources compile unchanged against Beta 1 tarballs.
The gate additionally rejects:

- removed or renamed exports;
- removed export subpaths;
- new required parameters or object properties;
- narrowed input types;
- widened outputs that invalidate existing narrowing;
- changed discriminants in versioned closed unions;
- newly introduced import-time side effects;
- Node built-ins entering a browser entrypoint;
- provider-specific dependencies entering a provider-neutral graph;
- declarations that resolve only through workspace hoisting.

Beta 1 itself becomes the baseline for subsequent `0.3.0-beta.*` releases.
Additive changes use new versioned names or subpaths when extending a closed
contract would break exhaustive consumers.

Runtime, Sessions, Rooms and Framework regression fixtures remain unchanged.
No Mesh or conformance root is re-exported from Framework.

## Compatibility matrix

The release suite executes at least these combinations:

| Sender                    | Receiver             |      Selected wire | Expected outcome                 |
| ------------------------- | -------------------- | -----------------: | -------------------------------- |
| Beta 1                    | Beta 1               |                  1 | accepted and verified            |
| Beta 1 compatibility mode | Alpha 5              |                  0 | accepted by Alpha 5              |
| Alpha 5                   | Beta 1               |                  0 | accepted by Beta 1 v0 reader     |
| Beta 1 current-only       | Alpha 5              |               none | explicit unavailable, no send    |
| Beta 1 pinned v1          | forged/stale v0 card |               none | downgrade rejected               |
| Beta 1 mixed topic        | v0 and v1 peers      | 0 and 1 partitions | version-specific immutable sends |
| unknown v2                | Beta 1               |               none | unsupported, no downgrade        |

Persistence combinations include:

- Alpha 5 process on migration 1 schema;
- Beta 1 compatibility reader on migration 1 schema;
- Beta 1 migration from 1 to 2;
- Beta 1 process on migration 2 with legacy rows;
- Beta 1 current-only mode after typed snapshot backfill;
- interrupted and concurrently attempted migration;
- rollback refusal with Beta-only data;
- backup/restore followed by digest and count validation.

## Fault, soak and scale evidence

### Correctness under duration

A release soak uses multiple independent Node processes, HTTP and PostgreSQL
with deterministic workload generation. It includes:

- mixed v0/v1 peers;
- rolling peer restarts;
- sender and receiver termination at every durable boundary;
- network timeout, duplicate, reorder and overload;
- stale Peer Card and downgrade attempts;
- database connection interruption and recovery;
- migration contention;
- outbox retry after remote commit;
- graceful shutdown and lease expiry.

The soak fails on lost accepted work, duplicate protected effect, stale-fence
mutation, digest mismatch, unbounded queue growth, leaked secret, incomplete
cleanup or nondeterministic final state.

### Benchmark workloads

The benchmark manifest includes fixed typical and boundary-size workloads for:

- strict v0/v1 parse and canonicalization;
- payload hash, signing and verification;
- negotiation selection and mixed-cohort preparation;
- HTTP ingress and exact-byte delivery;
- PostgreSQL receipt, claim, transition, journal and outbox settlement;
- snapshot migration and restore;
- conformance runner overhead.

Reports record Node/PostgreSQL versions, OS/architecture, CPU count, memory,
sample counts, concurrency, data sizes, median, p95, p99, throughput and error
count. Raw benchmark measurements are diagnostic, not universal SLOs.

Correctness ceilings are normative. Performance regression thresholds are
applied only on the same controlled runner using repeated samples and a
documented baseline; a noisy one-off measurement cannot block or approve a
release by itself.

## Independent clean consumers

Two install graphs validate published artifacts without workspace links:

1. Node 20 + pnpm + strict TypeScript (`skipLibCheck: false`), exercising all
   package exports, v0/v1 protocol, durability and conformance runners;
2. Node 22 + npm + plain ESM, exercising the same registry versions from a
   separate cache/configuration and running the mixed-version reference
   scenario.

Both pin all 34 packages to the exact release version, validate registry
SHA512 integrity and run with registry credentials removed. These are
independent artifact/install paths, not claims of independent organizational
endorsement.

## Security and privacy requirements

- Wire negotiation data has no authority until signature, admission and card
  lineage validation complete.
- Downgrade high-water state is scoped by tenant, Mesh, peer and instance/card
  lineage.
- Version error responses are coarse and do not reveal installed packages,
  keys, Peer Cards or database state.
- Fixture keys are public test identities only.
- Conformance reports contain no raw envelope, payload, snapshot, credential,
  connection string or private key.
- Benchmark and soak logs use bounded redacted diagnostics.
- Migration status contains counts and schema metadata, not application state.
- Snapshot encryption remains caller-owned; compatibility does not weaken the
  existing sensitive-data classification.
- Public audit scans source, generated declarations, fixtures, reports and
  packed artifacts.

## Migration and rollback operations

### Upgrade

1. back up the Alpha 5 database and record migration/checksum status;
2. deploy Beta readers in current-and-previous compatibility mode;
3. apply PostgreSQL migration 2 under the shared advisory lock;
4. validate derived wire metadata and identify legacy snapshot rows;
5. run caller-selected snapshot codecs in bounded idempotent batches;
6. compare row counts, scope keys and canonical digests;
7. enable Beta writes with complete schema-2 metadata;
8. pin v1 only after authenticated Peer Cards establish compatibility;
9. retain v0 read/write compatibility for the documented support window.

### Rollback

Application rollback restores the npm `next` tag to Alpha 5 and configures Beta
peers for explicit v0 compatibility before binary rollback. An already signed
v1 outbox record is not rewritten for Alpha 5; it must be drained by a Beta
worker or reconciled explicitly.

Database rollback is refused if Beta-only data cannot be represented by the
Alpha 5 schema. Destructive down requires exact confirmation,
`allowDataLoss`, a verified backup and recorded unresolved-row count. Normal
recovery prefers leaving the additive migration-2 columns in place while
running Alpha-compatible readers.

Published npm versions and Git tags are never deleted or overwritten.

## Implementation increments

### Increment 0 — Design freeze

Deliverables:

- this implementation plan;
- Beta 1 acceptance checklist;
- compatibility-freeze threat model;
- design review with zero open P0/P1 findings;
- release-plan and compatibility-policy links;
- exact normative merge commit recorded before code implementation.

Exit: public design PR merged; no production source changed.

### Increment 1 — Release plumbing and API baselines

Deliverables:

- 34-package Beta 1 release cohort;
- package catalog entry for conformance;
- fixed-version and release-line guards;
- packed public-surface report generator;
- unchanged Alpha 5 contract consumer;
- negative API compatibility fixtures.

Exit: Beta 1 manifests can be staged atomically and breaking surface mutations
fail before publication.

### Increment 2 — Dual wire parser and canonical fixtures

Deliverables:

- supported-version constants/types;
- v0/v1 strict parsers and version narrowing;
- v1 fixtures and complete manifest;
- v0 byte-lock manifest;
- fixture generator/verifier;
- signature substitution and malformed-version tests.

Exit: all message families validate under v1, Alpha 5 v0 fixtures are unchanged
and Beta readers accept both versions exactly.

### Increment 3 — Crypto, negotiation and transports

Deliverables:

- construction-bound signing version policy;
- authenticated discovery selector and high-water snapshot migration;
- downgrade/reset decisions;
- mixed-version preparation/fanout;
- HTTP v1 route and explicit v0 compatibility route;
- loopback/simulation version awareness;
- interop and hostile-negotiation tests.

Exit: Beta/Beta and Beta/Alpha interop pass without relabeling, route probing or
silent downgrade.

### Increment 4 — Persistence freeze

Deliverables:

- durable wrapper schema 2;
- snapshot descriptor and codec contracts;
- canonical envelope-byte reload checks;
- PostgreSQL migration 2 and status metrics;
- Alpha 5 adoption/backfill and rollback guards;
- frozen JSON/SQL/dump manifests;
- migration crash/race tests.

Exit: Alpha 5 data migrates idempotently with exact counts/digests and no Beta
write lacks format/version metadata.

### Increment 5 — Public conformance package

Deliverables:

- package/subpaths and closed capability/report schemas;
- protocol, transport, durability and Rooms runners;
- reference implementation adapters;
- deliberately broken negative adapters;
- bounded cleanup/abort/report tests;
- isolated tarball consumer example.

Exit: references pass, every negative adapter is detected and required cases
cannot be skipped.

### Increment 6 — Scale, soak and compatibility matrix

Deliverables:

- deterministic mixed-version soak runner;
- release benchmark manifest/report;
- PostgreSQL/HTTP multi-process fault matrix;
- Node 20/pnpm and Node 22/npm clean consumers;
- reproducible environment and redacted outputs.

Exit: zero correctness violations, all compatibility cells pass and diagnostic
performance evidence is tied to one candidate commit.

### Increment 7 — Audit and release candidate

Deliverables:

- architecture/API compatibility audit;
- protocol/downgrade security audit;
- persistence/migration audit;
- conformance false-positive/false-negative audit;
- dependency and public-surface audit;
- full CI and packed artifact evidence;
- zero open P0/P1/P2 release findings.

Exit: implementation PR merged to public `main` with all required checks green.

### Increment 8 — Publication and evidence

Deliverables:

- exact-commit dry publication under `next`;
- coordinated publication of 34 packages;
- both registry consumers;
- registry integrity ledger and staging-tag cleanup;
- annotated `v0.3.0-beta.1` tag at the published commit;
- machine-readable release, fixture, compatibility and benchmark evidence;
- accepted checklist merged to public `main`.

Exit: every acceptance item is checked against reproducible public evidence.

## Required test matrix

At minimum, implementation evidence covers:

1. every v0 fixture remains byte-identical;
2. every implemented message type has a v1 fixture;
3. v0/v1 payload and signing digests recompute;
4. version/signature substitution fails;
5. parser narrowing rejects the other supported version;
6. unknown versions fail without fallback;
7. v0 signing requires explicit policy;
8. verified v1 Peer Card selects v1;
9. verified `[0,1]` card selects highest allowed;
10. v0 bootstrap is construction-bound;
11. stale/forged/expired cards cannot select a version;
12. downgrade below high-water fails;
13. explicit reset is bound to new admitted lineage;
14. transport failure cannot reset high-water;
15. mixed fanout signs immutable version cohorts;
16. HTTP path and envelope version must agree;
17. remote receipts do not reveal installed/selected versions;
18. v0 Alpha sender reaches Beta receiver;
19. explicit Beta v0 sender reaches Alpha receiver;
20. current-only Beta refuses Alpha without sending;
21. durable retry preserves canonical bytes;
22. schema-1 durable records restore under compatibility mode;
23. schema-2 records require wire/snapshot metadata;
24. opaque Alpha snapshots cannot masquerade as typed snapshots;
25. codec migrations are deterministic and bounded;
26. migration 2 is locked, idempotent and status-reporting;
27. interrupted migration resumes without duplicate effects;
28. rollback refuses incompatible Beta data;
29. all frozen snapshot families restore;
30. journal chain survives migration and detects tampering;
31. conformance references pass;
32. every deliberately broken adapter fails its expected case;
33. required conformance cases cannot be skipped;
34. reports reject unknown fields and inconsistent counts;
35. reports contain no secret or raw application content;
36. Alpha 5 public contract sources compile unchanged;
37. packed surface reports reject removal/narrowing/side effects;
38. all browser entrypoints remain browser-safe;
39. mixed-version soak converges after restarts/outages;
40. no accepted work is lost across every fault window;
41. stale assignment and stale database claims remain fenced;
42. benchmark report contains complete environment/sample metadata;
43. both clean consumers install exact registry artifacts;
44. all 34 SHA512 registry integrities match evidence;
45. no staging distribution tag remains;
46. annotated release tag resolves to the published commit.

## Stop-ship conditions

Any of the following blocks Beta 1:

- signature-valid message accepted under a different version than signed;
- silent or transport-triggered downgrade;
- v0 fixture drift;
- unknown critical extension accepted;
- Alpha 5 public consumer source break without an approved versioned escape;
- ambiguous snapshot content format/schema;
- accepted inbox work lost or falsely acknowledged;
- stale claim or assignment authority mutating state;
- partial migration or transition commit;
- conformance required case skipped or known-broken adapter passing;
- raw sensitive data in reports/logs/fixtures;
- migration rollback possible without exact destructive confirmation;
- registry integrity mismatch;
- open P0/P1/P2 release finding;
- tag, workflow or evidence tied to different commits.

## Definition of done

Beta 1 is complete only when the design freeze, implementation, migrations,
fixtures, conformance package, compatibility matrix, soak/benchmark evidence,
two clean consumers, npm publication, annotated tag and final evidence are all
merged or publicly verifiable with zero open checklist items.
