# Mesh adapters threat model

Status: Alpha 5 design frozen by commit
`0de423c85cc6096a674ce2bc54915de7ea72aa1c`; implementation findings are
tracked in the Alpha 5 implementation audit.

This document extends the Agent Mesh threat model for the public HTTP,
PostgreSQL and Room bridge adapters. It covers the boundary where deterministic
local state meets untrusted networks, process scheduling and durable storage.

## Assets

- signed envelope bytes and canonical message identity;
- accepted inbox records and replay evidence;
- current peer snapshot revision and integrity digest;
- assignment epoch, authority ID and fencing token retained in snapshots;
- append-only journal order and chain anchors;
- pending outbox effects and exact signed delivery bytes;
- Room policy, approvals, task and artifact provenance;
- database credentials, transport credentials and private signing keys;
- bounded worker, parser, database and network resources.

## Trust boundaries

```text
untrusted HTTP client
        |
channel authenticator and byte limits
        |
strict protocol parser
        |
durable inbox commit
        |
fenced worker claim
        |
existing Mesh verification and reducers
        |
atomic snapshot + journal + outbox commit
        |
HTTP delivery attempt
        |
remote durable inbox

Room repository -> pure bridge projection -> explicit Mesh command sink
accepted Mesh result -> pure Room proposal -> explicit Room application sink
```

HTTP channel identity is not Mesh peer identity. A PostgreSQL claim is not Mesh
Work authority. A Room role is not admission, issuer or assignment authority.
Crossing one boundary never implicitly satisfies the next.

## Adversaries and failures

- unauthenticated or authenticated clients sending malformed, oversized or
  high-rate input;
- a malicious sender probing signature, key, admission or Trust state through
  response differences;
- route data attempting SSRF, redirect credential leakage or cross-tenant
  delivery;
- duplicated, delayed, reordered or conflicting signed envelopes;
- compromised or defective workers processing after claim expiry;
- concurrent workers racing on one peer snapshot;
- process death at every point between network receipt and outbox settlement;
- database outage, serialization failure, partial migration or administrator
  rollback;
- database readers or telemetry sinks attempting content disclosure;
- malicious Room metadata, participant roles or events attempting to create
  Mesh authority;
- accepted but stale Mesh results attempting to mutate Room state;
- sink timeouts that make bridge application outcome ambiguous.

## Required mitigations

| Threat                           | Mitigation                                                                                                    | Verification                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Parser or memory exhaustion      | Bound request bytes before parsing; strict protocol limits; bounded response body                             | oversized, nested, slow and malicious body tests             |
| Verification oracle              | Coarse remote status classes; detailed reason only in redacted local diagnostics                              | response-equivalence tests across local rejection causes     |
| Unauthorized channel             | Optional construction-bound authenticator before durable callback                                             | forged header, callback substitution and disabled-auth tests |
| SSRF or redirect leakage         | Endpoint resolver is construction-bound; absolute scheme policy; redirects disabled                           | private/invalid URL, redirect and credential-header tests    |
| False accepted receipt           | Acknowledge only a committed inbox insert                                                                     | forced database failure before and during insert             |
| Message-ID collision             | Store canonical envelope digest; exact duplicate is idempotent; conflict fails closed                         | same ID/same bytes and same ID/different bytes               |
| Cross-scope collision            | Full tenant, Mesh, peer and instance key on all records and leases                                            | parallel identical IDs in every scope dimension              |
| Lost accepted work               | Durable inbox plus reclaimable expired claim                                                                  | kill after acknowledgement and recover in a new worker       |
| Stale worker commit              | Random token, generation and exclusive lease expiry checked in commit transaction                             | reclaim then settle with old token/generation                |
| Concurrent snapshot corruption   | Per-scope revision CAS inside transaction                                                                     | two claims attempting the same expected revision             |
| Partial transition               | Snapshot, journal, outbox and inbox settlement in one transaction                                             | injected failure after every statement boundary              |
| Duplicate external delivery      | Stable signed outbox bytes and effect ID; receiver inbox/replay idempotency                                   | crash after remote commit before local settle                |
| Journal rewrite                  | Append-only permissions, sequence constraints and digest chain                                                | row mutation, deletion, reorder and anchor mismatch tests    |
| Secret or content disclosure     | No credentials/keys in rows or diagnostics; redacted journal; caller-owned encryption for sensitive snapshots | packed-file, log and fixture scans                           |
| Migration race                   | Shared advisory lock and exact migration checksums                                                            | concurrent migration and altered-history tests               |
| Destructive rollback             | Exact version confirmation plus explicit data-loss flag                                                       | missing, stale and wrong confirmation tests                  |
| Room authority escalation        | Complete typed Mesh policy supplied separately; pure projection cannot sign or dispatch                       | hostile role/metadata/actor projection tests                 |
| Unverified Mesh-to-Room mutation | Driver requires accepted branded/domain input and only produces a proposal                                    | parsed-only, rejected and stale-result tests                 |
| Room policy bypass               | Proposal applies through explicit Room sink and ordinary Room policy; no implicit completion/approval         | approval-required and sink-rejection tests                   |
| Ambiguous bridge retry           | Atomic idempotency claim/complete contract, stable projection key and explicitly idempotent sink              | sink success/failure/time-out retry scenarios                |

## Crash consistency model

The reference adapter guarantees atomicity only within one PostgreSQL
transaction. The important crash windows are:

1. Before inbox commit: no acknowledgement is sent; retry is safe.
2. After inbox commit but before claim: another worker can claim the row.
3. After claim but before transition commit: the claim expires and can be
   reclaimed; no state was committed.
4. During transition commit: PostgreSQL commits all affected rows or none.
5. After transition commit but before send: the outbox remains pending.
6. After remote commit but before outbox settle: delivery repeats and is
   idempotently received.
7. After outbox settle: later workers observe terminal state and do not send.

There is deliberately no distributed transaction between sender and receiver.
At-least-once delivery is the only accurate claim.

## Database assumptions

- PostgreSQL provides transactional atomicity, row locks, unique constraints
  and a trusted comparison clock for lease expiry.
- Connections use authenticated encrypted channels appropriate to the
  deployment.
- The application configures least-privilege roles and protects backups.
- Operators monitor disk exhaustion, replication lag and transaction age.
- Snapshot JSON and envelope payloads may contain application-sensitive data;
  database encryption and retention are deployment responsibilities.
- Administrators with write access can corrupt data. Journal verification can
  detect many changes but does not defend against an administrator able to
  replace both records and external anchors.

## HTTP assumptions

- Production deployments use HTTPS or another protected outer channel.
- Channel authentication controls network access but does not replace envelope
  signatures, key resolution, admission or replay checks.
- Proxies preserve request bytes and enforce compatible or stricter limits.
- Application resolvers return only authorized endpoints and keep credentials
  outside URLs and signed envelopes.
- Timeouts may be ambiguous; callers retry the exact signed envelope rather
  than creating a new effect identity for the same attempt.

## Room bridge assumptions

- Room repositories preserve their existing tenant and transaction checks.
- A caller supplies complete mapping policy and reviews application content
  bounds before projection.
- Bridge output remains untrusted application content until the normal Mesh or
  Room boundary accepts it.
- Human approval and Action Gateway enforcement remain separate from bridge
  transport and persistence.
- A bridge is not a scheduler, objective issuer, assignee selector or trust
  service.
- A non-idempotent Room sink may apply an operation before timing out. The
  bridge repeats the same key but cannot promise exactly-once application when
  the sink ignores it.

## Required invariants

- No HTTP input reaches durable receipt before byte, method, route and media
  bounds pass.
- No accepted transport receipt is returned before durable inbox commit.
- No stale claim can change inbox, snapshot, journal or outbox state.
- No peer snapshot revision advances without the same transaction recording
  its journal and outbound effects.
- No delivery retry changes signed envelope bytes, message ID or effect ID.
- No database claim creates or extends Mesh authority.
- No Room field creates admission, issuer, assignment, grant or action
  authority.
- No unverified, rejected or stale Mesh result produces an applied Room change.
- No remote receipt exposes detailed local policy or verification state.
- No import or constructor starts a server, worker, migration or background
  loop.

## Residual risks and deferred work

- A compromised database administrator can replace state and anchors unless an
  external integrity service protects anchors.
- A compromised admitted peer can send valid harmful application content;
  protocol and transport integrity do not prove truth or safety.
- Delivery remains at least once, and non-Mesh downstream effects still require
  idempotency or fencing.
- HTTP availability depends on deployment routing, TLS, proxies and capacity.
- PostgreSQL durability depends on operator backup, replication and recovery
  practices.
- Durable Trust state, durable Action Grant ledgers, remote key resolution and
  cross-process bearer grants remain outside Alpha 5.
- Broker adapters, confidential payload formats and protocol-v1 persistence
  fixtures remain future work.
