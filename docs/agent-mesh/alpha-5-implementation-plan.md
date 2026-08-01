# Agent Mesh `0.3.0-alpha.5` implementation plan

Status: released as `0.3.0-alpha.5`. The design is frozen by commit
`0de423c85cc6096a674ce2bc54915de7ea72aa1c`; coordinated publication evidence
is recorded in the acceptance checklist.

This milestone adds explicit production-facing adapters around the existing
pure Mesh state machines. It does not change protocol v0, make a transport or
database mandatory, or move application authority into infrastructure code.

## Release outcome

Alpha 5 is complete when two independently executing Node.js processes can use
the public packages to exchange a signed protocol-v0 envelope through the
reference HTTP transport, durably accept it into PostgreSQL, recover processing
after a forced crash, commit the resulting state, journal and outbox records in
one transaction, and project explicitly selected Room work without creating
Mesh authority from a Room event.

The reviewed commit must also be installable from packed tarballs and the public
registry. The multi-process example and its crash/retry trace must be
reproducible from documented commands.

The release uses:

- fixed version `0.3.0-alpha.5` across every public package;
- npm distribution tag `next`;
- protocol `agentplat.mesh` and `wireVersion: 0`;
- compatibility baseline `v0.3.0-alpha.4`;
- Node.js 20.19.3 for the reference Ed25519 and server adapters;
- at-least-once transport and outbox delivery with protocol replay and
  assignment fencing, never an exactly-once claim.

## Product boundary

Alpha 5 provides:

- a Fetch-compatible HTTP client and inbound handler for signed Mesh
  envelopes;
- bounded request and response processing with coarse remote receipts;
- provider-neutral durability contracts under an explicit Mesh subpath;
- a PostgreSQL implementation of the durable inbox, peer snapshot, append-only
  journal and outbox;
- generation-fenced worker leases and compare-and-swap snapshot commits;
- explicit recovery of abandoned inbox and outbox claims;
- pure Room-to-Mesh and Mesh-to-Room projections plus an opt-in bridge driver;
- a local Docker Compose reference showing multiple processes, PostgreSQL,
  restart and duplicate-delivery behavior;
- conformance and fault scenarios for network, process and database boundaries.

Alpha 5 does not provide:

- a membership directory, service discovery system or global route registry;
- WebSocket, broker, queue-vendor or peer-to-peer NAT traversal adapters;
- TLS termination, certificate issuance, key enrollment or secret storage;
- payload encryption beyond the security supplied by the configured channel;
- a new wire message, a `wireVersion` change or a compatibility freeze;
- global transactions across PostgreSQL and a remote HTTP peer;
- exactly-once network delivery or exactly-once external effects;
- automatic trust, admission, Work assignment, lease extension or grant issue;
- automatic execution of a Room task from an untrusted Mesh message;
- durable storage for private keys, model context, Trust state, Action Grants or
  externally referenced checkpoint/result content;
- database replication, backup orchestration or a hosted control plane.

## Fixed design decisions

### 1. Additive, opt-in packages

Three public packages are added. Existing package roots keep their Alpha 4
behavior and none of the new packages is re-exported by Framework.

| Package                    | Layer     | Responsibility                                                             |
| -------------------------- | --------- | -------------------------------------------------------------------------- |
| `@agentplat/mesh-http`     | transport | Fetch-compatible HTTP client, handler and bounded coarse receipts.         |
| `@agentplat/mesh-postgres` | adapter   | PostgreSQL durability, migrations and worker-safe claims.                  |
| `@agentplat/rooms-mesh`    | adapter   | Explicit Room/Mesh projections and opt-in idempotent bridge orchestration. |

Provider-neutral durability types and worker orchestration are exported only
from `@agentplat/mesh/durability`. The Mesh root, `./loopback`,
`./coordination` and `./trust` exports remain compatible.

The dependency direction is:

```text
mesh-protocol ---> mesh-http
       |               |
       v               v
 mesh-crypto -------> mesh <--- rooms
                       |          |
                       v          v
                 mesh-postgres  rooms-mesh
                       |
                       v
                   postgres
```

Every package declares only imports it uses. Importing any entrypoint performs
no network I/O, database connection, migration, registration or global
mutation.

### 2. HTTP carries signed envelopes, not authority

The HTTP client accepts an already signed `SignedMeshEnvelope`. It resolves a
complete endpoint through a construction-bound resolver and sends exactly one
bounded attempt. It does not discover peers, sign messages, follow redirects,
or retry automatically.

The inbound handler accepts only a configured method, exact path and media
type. It reads a bounded body, uses the strict protocol parser before invoking
the application callback and rejects content encodings it cannot bound. The
callback decides whether an envelope was durably queued; the handler never
calls a Mesh reducer directly.

Remote receipts reveal only these classes:

- accepted, with first receipt and exact duplicate intentionally
  indistinguishable;
- malformed or unsupported request;
- unauthorized channel;
- overloaded and retryable;
- temporarily unavailable;
- permanent local rejection.

Signature, key, admission, replay, Trust and domain rejection details remain
local diagnostics. A successful HTTP response proves only receipt at the
configured adapter boundary. The signed envelope and local Mesh state remain
the authority inputs.

### 3. Durable receipt precedes HTTP acknowledgement

The PostgreSQL adapter returns an accepted HTTP receipt only after the inbox
insert is committed. The unique identity is the complete local peer scope plus
`messageId`. A byte-identical duplicate is idempotent; conflicting content for
the same key fails closed and is not exposed as a remote oracle.

The durable scope is:

```text
tenantId + meshId + peerId + instanceId
```

It prevents a peer ID reused by another tenant, Mesh or process instance from
sharing state or leases.

### 4. One atomic state transition

A successful inbox commit transaction must atomically:

1. validate the unexpired inbox claim and its generation-fenced lease token;
2. compare the expected peer snapshot revision;
3. write the complete next snapshot and its canonical digest;
4. append bounded redacted journal entries in strict sequence;
5. insert every resulting signed outbound envelope using a unique effect ID;
6. mark the inbox record applied or rejected; and
7. release the claim.

No outbox row becomes visible without the state that caused it. No inbox row is
marked applied without the state and journal commit. A callback exception,
lease loss, revision conflict or database error rolls the whole transaction
back.

The adapter stores a caller-defined strict JSON snapshot. The caller must use
the existing Mesh restore functions after loading it. PostgreSQL persistence is
not a substitute for snapshot schema validation, proof verification or
application-level encryption.

### 5. Leases are claims, not permissions

Inbox and outbox workers claim bounded batches with `FOR UPDATE SKIP LOCKED`.
Every claim receives an opaque random lease token and monotonically increasing
claim generation. Settlement checks the worker ID, token, generation and
exclusive expiry. A stale worker cannot commit after another worker has
reclaimed the row.

Database claim leases schedule work; they do not grant Mesh Work authority.
Objective revision, assignment epoch, assignment authority ID, fencing token
and lease rules continue to be evaluated by the existing Mesh reducers and by
downstream action adapters.

### 6. Delivery remains at least once

An outbox worker may crash after the remote peer commits the envelope but
before the sender settles its outbox row. The next worker sends the same signed
bytes again. The receiver's durable message key and protocol replay boundary
make this duplicate safe.

Claim validity is evaluated against PostgreSQL transaction time so worker clock
skew cannot extend ownership. Outbox attempts use a caller-supplied bounded
retry policy; terminal delivery means either an explicit permanent coarse
rejection or exhaustion of that policy. Failed delivery never rewrites the
committed peer snapshot.

### 7. Journal integrity and retention

The durable journal is append-only per peer scope, strictly sequenced and
hash-chained. Each entry binds its previous digest, transition ID, inbox
message ID when present, snapshot revision and snapshot digest. Payload content,
private keys, grants and unredacted model data are not journal fields.

Pruning is never implicit. A caller may create an integrity-protected snapshot
anchor and prune only entries strictly before that anchor through an explicit
administrative operation. Alpha 5 documents the contract but does not automate
retention or backups.

### 8. Room projection cannot manufacture Mesh authority

`@agentplat/rooms-mesh` is a separate adapter. Its pure outbound projection
requires a complete caller-supplied Objective policy, owner identity, revision,
budgets, capability requirements and deadlines. Room IDs and task IDs may be
used as stable application bindings, but Room role, `authorityLevel`, metadata
or an event actor never become Mesh admission, issuer or assignment authority.

The outbound projection produces typed local Mesh commands or projection
errors. It does not sign, publish, bid, select a peer, award Work or accept an
assignment.

The inbound projection accepts only a caller-asserted, already verified and
accepted Mesh domain result. It produces a bounded Room message or artifact
proposal with provenance. Applying that proposal is an explicit Room service
operation subject to normal Room policy and approval behavior. It cannot mark
a task executed, approve an artifact or complete a Room automatically.

Bridge idempotency is keyed by tenant, Room, Mesh message and projection kind.
Every sink call carries that deterministic key. In-memory idempotency is
included for tests; durable applications must supply a repository with atomic
`claim` and `complete` behavior and a sink that treats the key idempotently.
Without an idempotent sink, a timeout after a remote commit remains ambiguous
and the bridge makes no exactly-once claim.

### 9. Safe endpoint resolution

The reference client never constructs a URL from an envelope field. The
construction-bound endpoint resolver receives the already selected peer scope
and returns an allowlisted absolute `http:` or `https:` URL. Redirects are
disabled. Credentials, headers and mTLS configuration remain outside signed
payloads and normal diagnostics.

Applications are responsible for preventing private-network access when route
data originates outside their trust boundary. The reference example uses
static local endpoints only.

### 10. Compatibility baseline

- All Alpha 4 exports and fixtures compile unchanged.
- Protocol fixtures remain byte-identical and `wireVersion` remains `0`.
- Existing in-memory and simulation paths remain valid without PostgreSQL.
- Existing Runtime, Sessions, Rooms and Framework tests remain unchanged.
- The release catalog grows from 30 to 33 public packages.
- Preview persistence tables are versioned and isolated under the configured
  PostgreSQL schema; migrations never run during import or construction.

## Public durability contract

The exact TypeScript names may be refined during Phase 2, but the semantic
surface is frozen here.

### Records

- `MeshDurableScope`: exact tenant, Mesh, peer and instance.
- `MeshDurableInboxRecord`: signed envelope, canonical digest, receipt time,
  status, attempts and optional fenced claim.
- `MeshDurablePeerSnapshot`: revision, strict JSON state, digest and commit
  time.
- `MeshDurableJournalEntry`: ordered redacted hash-chain record.
- `MeshDurableOutboxRecord`: effect ID, exact signed envelope, status,
  attempts, next availability and optional fenced claim.
- `MeshDurableClaim`: worker ID, opaque lease token, generation and exclusive
  expiry.

### Repository operations

- `receive`: atomically insert or identify an exact duplicate inbox envelope.
- `loadSnapshot`: load one current peer snapshot without claiming work.
- `claimInbox`: reclaim expired work and return a bounded ordered batch.
- `commitInboxTransition`: perform the complete atomic state/journal/outbox
  transition.
- `abandonInbox`: make a retryable claim available without changing state.
- `claimOutbox`: reclaim expired delivery work in bounded order.
- `settleOutbox`: record delivered, retryable or terminal status under the
  exact claim fence.
- `inspectJournal`: return a bounded ordered redacted slice.
- `verifyJournal`: recompute the retained chain from its anchor.
- `close`: release adapter-owned resources without closing a caller-owned pool.

### Worker operations

`createMeshDurableWorker` composes a repository with explicit processor and
delivery callbacks. `runInboxBatch` and `runOutboxBatch` perform one bounded
batch and then return; no background loop starts implicitly. `start` is a
separate opt-in helper with an abort signal and bounded idle delay.

The inbox processor receives the claimed signed envelope and current strict
snapshot. It must return either:

- `applied`: complete next snapshot, redacted journal records and already
  signed outbound envelopes; or
- `rejected`: stable local reason class and optional unchanged snapshot
  journal record.

The worker validates closed result shape and scope before asking the repository
to commit.

## PostgreSQL schema contract

The first migration creates these tenant-scoped tables:

- `mesh_peer_snapshots`;
- `mesh_inbox`;
- `mesh_journal`;
- `mesh_outbox`;
- `mesh_journal_anchors`.

Primary and foreign keys include the full durable scope. JSON columns contain
only strict JSON values. Check constraints bound status values, non-negative
attempts, positive generations and digest formats. Claim selection uses indexes
on scope, status, availability and lease expiry. The migration uses the shared
`@agentplat/postgres` schema qualification and migration lock primitives.

Rollback is destructive and therefore requires the existing explicit version,
confirmation token and `allowDataLoss` flow.

## HTTP contract

The default endpoint path is `/agentplat/mesh/v0/envelopes`; callers may choose
another exact path at construction. The handler supports `POST` and `OPTIONS`
only when an explicit CORS policy is supplied. Default CORS behavior is absent.

The request contract is:

- `Content-Type: application/json`;
- no redirect following;
- identity content encoding unless a bounded decompressor is injected;
- body not larger than the configured protocol envelope limit;
- one strict signed envelope and no wrapper object;
- optional construction-bound channel authenticator before durable receipt.

The response is a bounded JSON receipt with a schema version, message ID when
safe, coarse disposition and optional bounded retry delay. It contains no
signature result, key state, admission detail, replay offset, Trust score,
database error or stack trace.

## Room bridge contract

The bridge exposes three separately testable layers:

1. pure Room aggregate projection into Objective and Work command inputs;
2. pure accepted Work progress/checkpoint/result projection into Room message
   and artifact proposals; and
3. opt-in driver orchestration with caller-supplied Mesh command sink, Room
   application sink and idempotency repository.

Only the third layer performs caller-provided I/O. The public Room models and
service gain no required field and no dependency on Mesh.

## Failure matrix

| Failure point                                     | Required outcome                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| HTTP body exceeds bound                           | reject before JSON parse or durable callback                            |
| channel authentication fails                      | coarse rejection; no protocol or key detail                             |
| process dies before inbox commit                  | no accepted receipt; sender may retry                                   |
| process dies after inbox commit                   | inbox remains claimable; accepted message is not lost                   |
| two workers claim the same inbox row              | only one live generation can commit                                     |
| worker loses lease while processing               | stale commit rejected with no partial state/outbox                      |
| database fails during transition                  | inbox, snapshot, journal and outbox all roll back                       |
| process dies after transition before delivery     | outbox remains claimable                                                |
| remote commits before sender outbox settlement    | same signed envelope is retried; receiver reports duplicate safely      |
| route times out or returns overload               | bounded retry schedule; committed state is not rewritten                |
| conflicting message content reuses a message ID   | fail closed locally; no reducer invocation                              |
| bridge sees an event twice                        | one projection application per idempotency key                          |
| bridge receives unverified or merely parsed input | public driver refuses it; no Room mutation                              |
| obsolete Mesh assignment produces a result        | existing assignment fence rejects it before Room projection             |
| shutdown or abort occurs                          | no new claims; in-flight operations settle or expire for later recovery |

## Implementation increments

### Phase 0: design freeze

- land this plan, acceptance checklist and adapter threat model;
- freeze package names, dependency direction and non-goals;
- record independent design review findings and resolution;
- verify no public terminology or package-policy violations.

Exit: zero unresolved P0/P1 design findings and a normative reviewed commit.

### Phase 1: public scaffolding and contracts

- add three cataloged package skeletons and the Mesh durability subpath;
- add compile-only public contract tests;
- keep all imports inert and browser declarations accurate;
- update release, pack and registry-consumer expectations to 33 packages.

Exit: install, build, type-check, public audit and pack smoke pass with contract
stubs.

### Phase 2: HTTP transport

- implement strict client URL resolution and one-attempt delivery;
- implement bounded handler parsing, channel authentication and receipts;
- test size, media type, redirects, aborts, timeouts, status coarsening and
  malicious response bodies.

Exit: malformed or unbounded network input cannot reach the durable callback,
and remote output cannot expose local verification decisions.

### Phase 3: durability core and PostgreSQL

- implement record validation, journal chaining and bounded worker batches;
- add migration, repository and explicit rollback support;
- test duplicate receipt, CAS conflicts, stale claims, `SKIP LOCKED`, atomic
  rollback, recovery and pool ownership;
- run optional integration tests against PostgreSQL in CI.

Exit: the failure matrix proves no acknowledged envelope is lost and no stale
worker can partially commit a transition.

### Phase 4: Room bridge

- implement pure outbound and inbound projections;
- implement opt-in idempotent driver contracts;
- prove Room metadata and roles cannot create Mesh authority;
- prove accepted Mesh output cannot bypass Room policy or approvals.

Exit: bridge tests cover duplicates, cross-scope input, missing authority,
stale assignment, projection bounds and sink failure.

### Phase 5: multi-process example

- compose two peer processes, PostgreSQL and HTTP with static routes;
- document migration, startup, forced crash, resume and cleanup;
- emit only redacted deterministic evidence;
- provide a non-Docker contract test for the composition boundary.

Exit: documented local commands reproduce delivery, crash recovery and safe
duplicate behavior.

### Phase 6: release hardening

- run all unit, adapter, scenario, type, browser, public-audit and pack tests;
- run protocol/Alpha 4 compatibility and migration/rollback checks;
- record benchmark bounds for receipt, claim and batch operations;
- resolve independent security, architecture and release audit findings;
- complete the acceptance checklist against one exact commit.

Exit: zero open checklist items and zero unresolved P0/P1 findings.

### Phase 7: publication and evidence

- set every public package to `0.3.0-alpha.5`;
- merge the implementation PR into public `main`;
- run a dry publication and then the real `next` publication;
- verify registry metadata, dist-tags, integrity and isolated consumers;
- create annotated tag `v0.3.0-alpha.5` on the release commit;
- merge exact release evidence without changing the tagged artifacts.

Exit: all 33 packages are public under `next`, exact integrity verification is
green, and the public acceptance checklist is closed.
