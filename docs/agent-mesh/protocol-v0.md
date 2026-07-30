# Agent Mesh wire protocol v0

Status: design contract for the `0.3.0` alpha line.

The alpha protocol establishes deterministic serialization, bounded parsing,
message identity and explicit authority before the peer runtime is implemented.
The wire version advances to `1` only when beta compatibility fixtures are
frozen.

## Envelope

Every envelope contains:

```text
protocol
wireVersion
messageId
tenantId
meshId
objectiveId?
type
sender.peerId
sender.instanceId
audience
sequence
sentAt
expiresAt
payloadHash
payload
proof.algorithm
proof.keyId
proof.value
correlationId?
causationId?
extensions?
criticalExtensions?
```

Rules:

- `protocol` is `agentplat.mesh`.
- `wireVersion` is `0` throughout alpha.
- `messageId` is the unpadded base64url encoding of 16 random bytes. Producers
  fail rather than fall back to a non-cryptographic random source. Receivers
  validate its representation, not its entropy.
- Tenant, Mesh, Objective, peer, instance and key IDs contain 1 to 256 ASCII
  characters and match `[A-Za-z0-9][A-Za-z0-9._:@-]*`. Receivers do not apply
  Unicode, case or whitespace normalization. `correlationId` and
  `causationId`, when present, use the exact `messageId` representation.
- Protocol v0 audience topics are exactly `membership`, `capability`,
  `objective`, `work` and `evidence`. Message types are exactly the
  discriminants listed in this document; arbitrary topic and type strings are
  rejected.
- Sequence starts at `1` and increases strictly per peer and instance.
- A restart uses a newly authorized instance ID and restarts sequence at `1`.
- Type must exactly equal the discriminant in the payload.
- Tenant, mesh, audience, sender, sequence, timestamps, type, digest,
  extensions, algorithm and key ID are signed.
- The top-level envelope schema is closed. Additional data belongs under
  `extensions`; unknown top-level fields are rejected.
- Unknown optional extensions may be preserved.
- Unknown critical extensions are rejected.
- A peer cannot select an algorithm outside local policy.
- `criticalExtensions` contains unique keys that are also present in
  `extensions`.

`audience` is one of:

```text
{ kind: "peer", peerId }
{ kind: "mesh", topic }
```

A direct message is accepted only by the named peer. A Mesh audience is
accepted only by an admitted peer in the named Mesh and by a handler subscribed
to the topic. Audience values are never inferred from a transport address.

Protocol v0 does not relay an envelope transitively. A sender may deliver the
same signed envelope directly to a bounded fanout from its local peer view. A
peer that propagates information creates a new signed message with its own
message ID, sequence, expiry and optional `causationId`; it cannot extend the
authority or lifetime of the earlier message.

`objectiveId` is optional only for the message types marked optional in the
authority matrix below. Work, lease and work-derived evidence messages always
bind an accepted Objective.

## Identity and admission bootstrap

An envelope signature proves possession of a key. It does not admit the sender
or establish that a self-claimed Peer Card is trusted.

Every deployment selects and documents at least one bootstrap method:

1. **Preprovisioned binding.** A local key resolver already contains the
   admitted `peerId`, `keyId`, public key and validity policy. `peer.card`
   refreshes expiring addresses and capabilities but does not introduce a new
   identity.
2. **Attested enrollment.** A detached Signed Peer Card contains a public key
   and an admission attestation that chains to a locally configured trust
   anchor. Enrollment verifies the card self-signature, the attestation and
   local admission policy before installing the key binding. The resulting
   `peer.card` envelope then follows the normal inbound path.

The same rule applies to Objective issuer keys. A self-signed document may
demonstrate key possession, but never grants participation or Objective issuer
authority by itself.

An envelope from an unknown key cannot bootstrap its own authority. Inbound key
resolution uses bounded local state and performs no network fetch. Discovery or
enrollment happens through an explicit adapter flow before normal message
acceptance.

A local key record binds:

```text
tenantId
meshId
peerId
keyId
algorithm
publicKey
validFrom
validUntil
status
revokedAt?
```

`validFrom` is inclusive and `validUntil` is exclusive. Live verification uses
a trusted local verification time rather than the sender-controlled `sentAt`.
The reference static resolver is bounded at construction, rejects duplicate
bindings and performs no callbacks or I/O during lookup. Lookup is scoped by
`tenantId`, `meshId`, `peerId`, `keyId` and `algorithm`; a key from another
tenant or Mesh cannot satisfy the binding. A revoked record requires a
`revokedAt` inside its validity interval, while an active record cannot carry
one.

For live acceptance, a locally revoked key is rejected regardless of the
sender-controlled `sentAt`. Historical verification may establish that an
archived signature was valid at an earlier time, but archived messages never
re-enter live reducers or authorize actions. Revocation protection is therefore
conditional on the freshness of each peer's local key state.

## Signing input

1. Canonicalize the payload.
2. Compute `sha256:<base64url digest>`, where the digest is exactly 32 bytes and
   the base64url representation is exactly 43 characters without padding.
3. Build the signing document from every envelope field except the payload and
   `proof.value`. The document includes `proof.algorithm` and `proof.keyId`.
4. Canonicalize the signing document.
5. Sign its UTF-8 bytes.

The reference suite uses canonical JSON compatible with RFC 8785, SHA-256,
base64url without padding and Ed25519 through Web Crypto. For the reference
suite, `proof.algorithm` is exactly `Ed25519`, and `proof.value` decodes to a
64-byte signature represented by exactly 86 base64url characters without
padding.

No field is normalized after signing. Private keys are never protocol payloads,
fixtures or telemetry.

## Initial limits

| Limit                             |    Default |
| --------------------------------- | ---------: |
| Decompressed envelope UTF-8 bytes |    262,144 |
| Payload JSON UTF-8 bytes          |    196,608 |
| Signed Peer Card UTF-8 bytes      |     65,536 |
| JSON nesting depth                |         32 |
| Total object keys                 |      2,048 |
| Keys in one object                |        256 |
| Total array items                 |      4,096 |
| Items in one array                |      1,024 |
| One string UTF-8 bytes            |     65,536 |
| Top-level extensions              |         16 |
| Critical extensions               |          8 |
| Opaque ID UTF-8 bytes             |        256 |
| Message type UTF-8 bytes          |        128 |
| Audience topic UTF-8 bytes        |        128 |
| Envelope lifetime                 | 10 minutes |
| Clock skew allowance              |  2 minutes |
| Replay sequence window            |      2,048 |

Envelope size is measured after transport decompression and before JSON
parsing. Payload size is the UTF-8 byte length of the payload JSON as received,
before canonicalization. Total key and array limits include the envelope and
payload together. Transport adapters that support compression additionally
enforce a compressed-size and decompression-ratio limit before allocating the
full output buffer.

Implementations reject duplicate JSON object keys, numbers outside the safe
integer range where integers are required, non-positive or non-integer
sequences, invalid RFC 3339 timestamps and content above any applicable limit.
`expiresAt` must be later than `sentAt`, `sentAt` cannot exceed the clock skew
allowance into the future, and the signed lifetime cannot exceed ten minutes.
Large results use authorized content references.

Protocol v0 uses a closed RFC 3339 timestamp profile: four-digit years from
1970 through 9999, uppercase `T` and `Z`, valid calendar components, an
optional fractional-second component containing one to nine digits, and
numeric offsets from `00:00` through `23:59`. Leap seconds, lowercase
separators and greater-than-nanosecond precision are rejected. Receivers
preserve the signed timestamp text and use its represented instant for
lifetime and freshness comparisons.

## Inbound order

1. Apply connection, compressed-size and decompression-ratio limits.
2. Parse strict JSON, reject duplicate keys and enforce structural limits.
3. Validate the closed envelope schema, protocol and exact wire version.
4. Validate type/payload equality and critical extension support.
5. Validate tenant, mesh, audience, issue time, expiry and lifetime.
6. Resolve the key from bounded local state and apply the local suite allowlist.
7. Recompute and compare the payload digest.
8. Verify the signing document.
9. Verify peer/key binding, validity and live revocation status.
10. Apply peer admission and message-specific authority.
11. Apply the replay sequence window and message idempotency.
12. Validate the causal state transition.
13. Persist inbox and replay acceptance atomically.
14. Acknowledge durable receipt at the transport boundary.
15. Apply the reducer and emit a redacted local event.

A receipt acknowledgement does not mean the Work Item was accepted or
completed. It is a transport primitive, not `peer.ping_ack`. Invalid input
never reaches a reducer.

## Replay window

Each receiver keeps a highest accepted sequence and a 2,048-position seen
bitmap for every admitted `peerId + instanceId` pair:

- a sequence above the current highest advances the window and is accepted once;
- an unseen sequence within the retained window may be accepted despite network
  reordering;
- a seen sequence or one older than the retained window is rejected as replay;
- message IDs are additionally retained for at least the maximum envelope
  lifetime plus twice the allowed clock skew;
- inbox acceptance, the sequence bitmap and message-ID retention are committed
  atomically.

Starting a new instance requires an instance ID authorized by the current peer
identity policy. Implementations rate-limit instance churn. Before sequence
would exceed the largest safe integer, the peer must authorize a new instance
rather than wrap or reuse sequence values.

## Message families

```text
peer.hello
peer.card
peer.ping
peer.ping_ack
peer.digest
peer.sync_request
peer.sync_response
peer.goodbye

capability.advertise
capability.withdraw

objective.announce
objective.revise
objective.cancel

work.offer
work.bid
work.award
work.accept
work.decline
work.progress
work.checkpoint
work.result
work.release
work.cancel

lease.renew
lease.takeover_proposal
lease.vote
lease.certificate

evidence.claim
evidence.attest
evidence.challenge
evidence.retract

trust.observation
```

## Normative authority matrix

“Self” means that the signed sender is also the subject identified by the
payload. “Current owner”, “assignee”, “lease holder”, “witness” and “issuer”
are resolved only from accepted local state at the envelope's Objective,
revision and epoch.

A direct audience names exactly one peer. Where a row requires delivery to
several roles, the sender emits a distinct envelope for each recipient, with a
new message ID, sequence and signature, or uses the explicitly permitted Mesh
topic. A direct envelope never names an assignee and witnesses simultaneously.
Multi-recipient payloads therefore carry a stable domain record ID, such as an
offer ID, award ID or certificate ID, that is identical in each recipient's
envelope. Envelope message IDs deduplicate deliveries; domain record IDs
deduplicate the logical state transition.

| Message type              | Authorized sender                           | Audience                                             | Objective                        | Required state rule                                             |
| ------------------------- | ------------------------------------------- | ---------------------------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| `peer.hello`              | self, already bound or enrolled             | direct or `membership` topic                         | optional                         | Peer Card is unexpired                                          |
| `peer.card`               | Peer Card subject                           | direct or `membership` topic                         | omitted                          | Card revision increases and admission remains valid             |
| `peer.ping`               | admitted peer                               | direct                                               | omitted                          | Target is the audience peer                                     |
| `peer.ping_ack`           | recipient of correlated ping                | direct to ping sender                                | omitted                          | `causationId` names an accepted ping                            |
| `peer.digest`             | admitted peer                               | direct                                               | optional                         | Digest scope is locally authorized                              |
| `peer.sync_request`       | admitted peer                               | direct                                               | optional                         | Requested scope is locally authorized                           |
| `peer.sync_response`      | recipient of correlated request             | direct                                               | optional                         | Response cannot exceed requested scope                          |
| `peer.goodbye`            | self                                        | direct or `membership` topic                         | omitted                          | Cannot remove another peer's identity or history                |
| `capability.advertise`    | capability owner                            | direct or `capability` topic                         | optional                         | Capability revision increases and expiry is bounded             |
| `capability.withdraw`     | capability owner                            | direct or `capability` topic                         | optional                         | References the owner's accepted capability revision             |
| `objective.announce`      | authorized Objective issuer                 | direct or `objective` topic                          | required                         | Payload Objective ID equals envelope Objective ID               |
| `objective.revise`        | current authorized issuer                   | direct or `objective` topic                          | required                         | Revision strictly increases                                     |
| `objective.cancel`        | current authorized issuer                   | direct or `objective` topic                          | required                         | Cancellation is append-only and references current revision     |
| `work.offer`              | current Work Item owner                     | direct or `work` topic                               | required                         | Work revision and owner epoch are current                       |
| `work.bid`                | bidder self                                 | direct to Work Item owner                            | required                         | Offer revision is current and bid window is open                |
| `work.award`              | current Work Item owner                     | one direct envelope per assignee or witness          | required                         | Bid, revision, epoch and reserved budget are current            |
| `work.accept`             | awarded assignee                            | one direct envelope per owner or witness             | required                         | Award and epoch are current                                     |
| `work.decline`            | awarded assignee                            | direct to owner                                      | required                         | Award and epoch are current                                     |
| `work.progress`           | current assignee                            | one direct envelope per owner or authorized observer | required                         | Assignment epoch and fencing token are current                  |
| `work.checkpoint`         | current assignee                            | one direct envelope per owner or witness             | required                         | Assignment epoch and checkpoint parent are current              |
| `work.result`             | current assignee                            | one direct envelope per owner or authorized observer | required                         | Assignment epoch and fencing token are current                  |
| `work.release`            | current owner or assignee for its own lease | one direct envelope per affected peer                | required                         | Names the current revision and epoch                            |
| `work.cancel`             | current owner under Objective policy        | one direct envelope per assignee or witness          | required                         | Names the current revision and epoch                            |
| `lease.renew`             | current lease holder                        | one direct envelope per owner or witness             | required                         | Lease, epoch and fencing token are current                      |
| `lease.takeover_proposal` | eligible recovery candidate or witness      | one direct envelope per witness                      | required                         | Current lease has expired under local policy                    |
| `lease.vote`              | configured witness self                     | one direct envelope per recovery participant         | required                         | One vote per witness, Work Item and proposed epoch              |
| `lease.certificate`       | certificate assembler                       | one direct envelope per affected peer                | required                         | Contains the required valid witness votes                       |
| `evidence.claim`          | claim source self                           | direct or `evidence` topic                           | required for work-derived claims | Provenance is in an authorized scope                            |
| `evidence.attest`         | attester self                               | direct or `evidence` topic                           | same scope as claim              | References an accepted claim                                    |
| `evidence.challenge`      | admitted participant in claim scope         | direct or `evidence` topic                           | same scope as claim              | References an accepted claim or attestation                     |
| `evidence.retract`        | original claim or attestation author        | same as original scope                               | same scope as original           | Adds a retraction; never deletes history                        |
| `trust.observation`       | observer self                               | direct by default                                    | optional when explicitly scoped  | References locally inspectable evidence and grants no authority |

## Normative state and lifetime matrix

The TTL below is the maximum `expiresAt - sentAt` for that message. A sender
uses the smaller of this value, the ten-minute envelope limit and any applicable
bid, acceptance, lease or Objective deadline. TTL controls delivery freshness;
it does not shorten the validity of a separately signed Peer Card, Objective,
lease certificate or evidence record.

Every accepted envelope is immutable. “Supersedes” changes the local projection
through a later signed event; it never edits or deletes the earlier envelope.
Revisions and epochs are positive safe integers. A new record starts at `1`;
each accepted successor is exactly the preceding value plus one and names the
immediately preceding domain record where the matrix requires causation.

| Message type or family        | Required revision or epoch                                               | Required causal reference                            |                                Maximum TTL | Mutation and retraction rule                                                                              |
| ----------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- | -----------------------------------------: | --------------------------------------------------------------------------------------------------------- |
| `peer.hello`                  | accepted Peer Card revision and current instance ID                      | accepted Peer Card ID                                |                                  2 minutes | Updates liveness only; a later hello supersedes liveness data                                             |
| `peer.card`                   | strictly increasing card revision                                        | prior card ID except initial enrollment              |                                  2 minutes | New revision supersedes metadata; it cannot rewrite identity history                                      |
| `peer.ping`                   | current instance ID                                                      | none                                                 |                                 30 seconds | Ephemeral probe; no durable peer authority change                                                         |
| `peer.ping_ack`               | current instance ID                                                      | accepted ping message ID                             |                                 30 seconds | Ephemeral response; cannot acknowledge another ping                                                       |
| `peer.digest`                 | digest scope version                                                     | latest locally known scope head                      |                                   1 minute | Hint only; cannot mutate authoritative journal state                                                      |
| `peer.sync_request`           | requested scope version or range                                         | digest or local scope head that exposed the gap      |                                   1 minute | Immutable request                                                                                         |
| `peer.sync_response`          | returned scope version or range                                          | accepted sync request message ID                     |                                   1 minute | Adds verified missing records; cannot exceed requested scope                                              |
| `peer.goodbye`                | current card revision and instance ID                                    | current Peer Card ID                                 |                                   1 minute | Appends departure status; cannot delete identity, evidence or trust history                               |
| `capability.advertise`        | strictly increasing capability revision                                  | prior advertisement ID except first revision         |                                  2 minutes | New revision supersedes the self-claim                                                                    |
| `capability.withdraw`         | current capability revision                                              | accepted advertisement ID                            |                                  2 minutes | Appends withdrawal; reactivation requires a new higher revision                                           |
| `objective.announce`          | Objective revision `1`                                                   | none                                                 |                                  5 minutes | Creates an immutable Objective document                                                                   |
| `objective.revise`            | strictly increasing Objective revision                                   | immediately preceding accepted Objective document ID |                                  5 minutes | New revision supersedes future policy; prior decisions remain attributable                                |
| `objective.cancel`            | current Objective revision                                               | current accepted Objective document ID               |                                  2 minutes | Appends cancellation; it cannot erase accepted work or history                                            |
| `work.offer`                  | current Work Item revision and owner epoch                               | parent Work Item or preceding offer when revised     |                                  2 minutes | New owner-authorized revision supersedes an open offer                                                    |
| `work.bid`                    | offered Work Item revision and owner epoch                               | accepted offer ID                                    |        lesser of 2 minutes or bid deadline | Immutable proposal; expiry or decline ends consideration                                                  |
| `work.award`                  | offered Work Item revision and new assignment epoch                      | accepted offer and selected bid IDs                  | lesser of 2 minutes or acceptance deadline | Immutable award; release, cancellation or a certified newer epoch supersedes it                           |
| `work.accept`, `work.decline` | awarded Work Item revision and assignment epoch                          | accepted award ID                                    | lesser of 2 minutes or acceptance deadline | Exactly one terminal response per assignee and award                                                      |
| `work.progress`               | current Work Item revision and assignment epoch                          | accepted `work.accept` message ID                    |     lesser of 5 minutes or remaining lease | Append-only status; it cannot extend a lease                                                              |
| `work.checkpoint`             | current Work Item revision and assignment epoch                          | accepted `work.accept` plus preceding checkpoint ID  |     lesser of 5 minutes or remaining lease | Append-only checkpoint; compaction preserves its digest chain                                             |
| `work.result`                 | current Work Item revision and assignment epoch                          | accepted `work.accept` and applicable checkpoint     |     lesser of 5 minutes or remaining lease | Immutable result; later verification or evidence may accept or contest it without rewriting it            |
| `work.release`                | current Work Item revision and assignment epoch                          | accepted `work.accept` or latest `lease.renew` ID    |                                  2 minutes | Appends release; a new assignment requires a higher epoch                                                 |
| `work.cancel`                 | current Work Item revision and assignment epoch                          | current `work.award`, `work.accept` or lease ID      |                                  2 minutes | Appends cancellation; it does not erase completed effects or evidence                                     |
| `lease.renew`                 | current Work Item revision and assignment epoch                          | accepted `work.accept` or preceding renewal envelope |    lesser of 30 seconds or remaining lease | Appends a bounded lease extension under Objective policy                                                  |
| `lease.takeover_proposal`     | proposed epoch exactly one above the declared current epoch              | accepted `work.accept` or latest renewal envelope    |                                   1 minute | Immutable proposal; it grants no execution authority                                                      |
| `lease.vote`                  | proposed epoch from takeover proposal                                    | accepted takeover proposal ID                        |                                   1 minute | One immutable vote per witness, Work Item and proposed epoch; conflicting votes are equivocation evidence |
| `lease.certificate`           | certified epoch strictly greater than current epoch                      | takeover proposal and required vote IDs              |                                   1 minute | Immutable certificate; only a later valid certificate can supersede its epoch                             |
| `evidence.claim`              | work-derived claims carry Work Item revision and epoch                   | producing result/checkpoint IDs when work-derived    |                                  5 minutes | Immutable claim; only its original author may issue a separate retraction                                 |
| `evidence.attest`             | claim scope revision; work scope includes revision and epoch             | accepted claim ID                                    |                                  5 minutes | Immutable attestation; only its author may retract it                                                     |
| `evidence.challenge`          | target scope revision; work scope includes revision and epoch            | accepted claim or attestation ID                     |                                  5 minutes | Immutable challenge; responses are new evidence events                                                    |
| `evidence.retract`            | same scope revision and epoch as target                                  | exact claim or attestation ID                        |                                  5 minutes | Appends retraction without deleting or altering the target                                                |
| `trust.observation`           | explicit trust-policy version; work evidence includes revision and epoch | locally inspectable evidence IDs                     |                                  5 minutes | Immutable local observation; decay or correction creates new profile state, not rewritten evidence        |

### Execution-record wire boundary

`work.progress`, `work.checkpoint` and `work.result` each carry the Objective
and Work Item IDs and revisions, `ownerPeerId`, owner epoch `1`,
`assigneePeerId`, `awardId`, `acceptanceId`, assignment epoch,
`assignmentAuthorityId`, an equal `fencingToken`, and `leaseExpiresAt`. They
require a causation ID, bind their signed sender to `assigneePeerId`, require a
direct peer audience, and bind the envelope Objective ID to the payload. Their
envelope TTL is at most the lesser of five minutes and the remaining lease.

`work.progress` adds `progressId`, a positive `progressSequence`, a bounded
`progressSummary` (at most 4,096 UTF-8 bytes), and may name a `checkpointId`.
`work.checkpoint` adds `checkpointId`, a positive `checkpointSequence`, a
SHA-256 `checkpointDigest`, and exactly one bounded `checkpointSummary` or
`checkpointReference`. Sequence one omits `previousCheckpointId`; a later
sequence requires a non-self previous checkpoint ID. `work.result` adds
`resultId`, SHA-256 `resultDigest`, may name `checkpointId`, and carries exactly
one bounded `resultSummary` or `resultReference`.

The wire validator enforces only these structural, binding, closed-schema and
timestamp constraints. Recipient authorization (owner, observer or witness),
resolution of `causationId` to the accepted `work.accept` envelope matching
`acceptanceId`, current assignment authority, epoch, token, lease validity,
checkpoint-head lineage and result uniqueness are stateful rules. They are
resolved from accepted local state and must be enforced before an execution
record changes a projection, journal or budget.

`work.release` and `work.cancel` use the Work assignment-authority fields.
Release is an accepted-assignment record and also carries `acceptanceId`,
`releaseId`, `releaseAuthority` (`owner` or `assignee`) and
`releaseDisposition` (`reoffer` or `close`). Its sender self-binds to the
declared role; only an assignee release is structurally bounded by
`leaseExpiresAt`. Cancel carries `cancellationId` and is a closed union:
`award_pending` omits `acceptanceId`, while `active` requires it. Its sender
self-binds to `ownerPeerId`. Both require causation, direct peer delivery,
Objective-header equality and a TTL of at most two minutes. Recipient
authorization and causal resolution are stateful: pending cancellation names
the current accepted `work.award`, while active cancellation and release name
the accepted `work.accept` or latest accepted `lease.renew`. Current authority,
lease, terminal state, idempotency and budget accounting also remain stateful.

`lease.renew` is an accepted-assignment record carrying the same authority
fields as execution records. Its `leaseExpiresAt` names the currently accepted
lease; `renewedLeaseExpiresAt` is a strictly later proposed expiry, with a
structural extension ceiling of 24 hours. It adds a stable `leaseRenewalId` and
positive `leaseRenewalSequence`. Sequence one omits
`previousLeaseRenewalId`; every later sequence requires a different predecessor
ID. The assignee self-binds as sender, delivery is direct, causation is required,
the Objective header must match, and TTL is at most the lesser of 30 seconds and
the remaining current lease.

The first renewal's causation resolves to the accepted `work.accept`; later
renewals resolve to the immediately preceding renewal envelope for that
recipient, while `previousLeaseRenewalId` identifies the shared logical record.
The wire validator does not authorize recipients or prove that the declared
current expiry, predecessor, sequence, assignment authority or lease is current.
It also does not enforce the Work deadline, the accepted Objective's lower
duration/count limits, terminality or idempotency; those are reducer rules.

`lease.takeover_proposal` carries the accepted assignment authority, current
lease expiry and a stable `takeoverProposalId`. It identifies a self-bound
`proposerPeerId`, a closed `candidate` or `witness` `proposalAuthority`, a
different `proposedAssigneePeerId`, and exactly the next declared assignment
epoch. It carries no proposed fencing token: only an accepted
`lease.certificate` supplies the new authority ID and token.

`leaseRenewalSequence` is zero for the initial accepted lease and then requires
`latestLeaseRenewalId` for values one through 100. Causation resolves to the
accepted `work.accept` at zero or the latest accepted renewal envelope for that
recipient. Delivery is direct, the Objective header must match, causation is
required and TTL is at most one minute.

Structural acceptance does not prove that the declared assignment and lease head
are current, or that lease expiry plus Objective recovery grace has elapsed.
Those checks use accepted local state and trusted receiver time, not the
sender-declared timestamp. Proposer/candidate eligibility, witness recipient
authorization, terminality, idempotency and proposal conflicts also remain
stateful. A proposal alone never advances an epoch, changes fencing, grants
execution authority or modifies budget.

`lease.vote` is an affirmative endorsement of one causally accepted takeover
proposal. Its closed payload carries a stable `leaseVoteId`, the logical
`takeoverProposalId`, the self-bound `witnessPeerId` and `objectiveId`. It does
not repeat the candidate, Work Item, assignment, lease, epoch or fencing
snapshot; verifiers resolve those fields from the accepted proposal named by
causation and reject a logical proposal ID whose content conflicts.

Delivery is direct to one recovery participant, the Objective header must
match, causation is required and TTL is at most one minute. Witness-set
membership, recipient authorization, accepted proposal resolution and the
one-vote-per-witness/Work Item revision/proposed epoch rule are stateful. A
duplicate identical vote is idempotent; endorsing another proposal in that
scope is conflicting vote evidence and cannot count toward a certificate. A
vote alone never advances an epoch, changes fencing, grants execution authority
or modifies budget.

Every message has exactly one matching authority rule. There is no generic
remote command, implicit issuer authority or permissive fallback for an unknown
message type. A message that omits a required Objective, revision, epoch or
causal reference is rejected before reducer invocation.

## Bounded journals

Work and evidence history is append-only within each retained journal segment,
but live storage is not unbounded. A peer configuration sets maximum events and
bytes per Objective and Work Item. Before reaching a limit, the peer creates a
versioned checkpoint containing the projected state, prior segment digest and
retention metadata. Older live segments may then move to an optional archive or
be pruned according to policy without presenting the checkpoint as the original
events.

If a required checkpoint or archive operation fails, the peer applies
backpressure or stops accepting new work in that scope. It does not silently
discard replay, fencing, revocation or idempotency state still required for live
security decisions.

## Delivery

Delivery is at-least-once and may be duplicated, delayed or reordered. Direct
messages target one peer. Fanout is bounded by local peer view and resource
policy. Protocol v0 has no transitive forwarding and no mutable routing budget.

External actions require an idempotency key, current epoch, fencing token and
local action grant. A conforming Action Gateway atomically consumes a
single-use grant before dispatch, but effectively-once external effects also
require the downstream adapter or service to enforce idempotency or fencing.
Without that downstream contract, duplicate effects remain possible and the
protocol only reduces their likelihood.

## Confidentiality

Signatures provide integrity and key-possession authentication, not
confidentiality. Protocol v0 does not define payload encryption. Deployments
protect transport channels, minimize capability and evidence disclosure, use
authorized content references for sensitive or large data, and keep raw
payloads out of normal telemetry. End-to-end payload confidentiality requires a
separate future protection contract or application adapter.
