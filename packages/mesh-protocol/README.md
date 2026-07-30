# `@agentplat/mesh-protocol`

Closed, bounded and transport-neutral wire contracts for AgentPlat Mesh peers.

The implementation provides:

- strict UTF-8 and JSON parsing that rejects duplicate decoded keys, malformed
  Unicode, ambiguous syntax and documents outside explicit structural limits;
- deterministic JSON canonicalization for hashing and signing;
- closed-schema validation for `peer.hello`, `peer.ping` and `peer.ping_ack`;
- closed, bounded Alpha 2 discovery and capability records for `peer.card`,
  `peer.goodbye`, `capability.advertise` and `capability.withdraw`;
- closed, bounded Alpha 2 Objective records for `objective.announce`,
  `objective.revise` and `objective.cancel`;
- closed, bounded Alpha 2 Work Offer and Work Bid records for `work.offer` and
  `work.bid`;
- closed, bounded Alpha 2 award-response records for `work.award`,
  `work.accept` and `work.decline`;
- closed, bounded Alpha 2 execution records for `work.progress`,
  `work.checkpoint` and `work.result`;
- closed, bounded Alpha 2 Work Release and Work Cancel records for
  `work.release` and `work.cancel`;
- a closed, bounded Alpha 2 Lease Renewal record for `lease.renew`;
- a closed, bounded Alpha 2 Lease Takeover Proposal record for
  `lease.takeover_proposal`;
- exact representations for message IDs, SHA-256 payload digests and Ed25519
  proofs;
- receiver-context checks for tenant and Mesh scope, audience, freshness and
  critical-extension support; and
- public, structurally valid conformance fixtures in `fixtures/v0`.

Use `parseSignedMeshEnvelope` with the decompressed `Uint8Array` at a wire
boundary. Accepting bytes rather than pre-decoded text prevents lossy UTF-8
replacement from hiding an invalid representation. The parser performs strict
parsing and static protocol validation and returns a deeply frozen value. Apply
`validateMeshEnvelopeContext` before accepting that value into a local peer.

Use `canonicalizeMeshPayload` to obtain the bytes covered by `payloadHash`.
Use `createMeshSigningDocument` or `canonicalizeMeshSigningDocument` to obtain
the document covered by the envelope proof. The signing document deliberately
excludes the payload and the proof value while retaining the payload digest and
proof header.

This package does not calculate or verify a payload digest, resolve signing
keys, verify signatures, perform replay admission, or mutate peer state. Those
are separate stages so callers cannot confuse structural validity with
cryptographic authenticity or local acceptance.

Lease voting and certification, evidence, trust and peer-sync message families
remain reserved until their closed payload contracts are implemented. They fail
explicitly rather than entering a generic payload path. Implemented Objective,
Work, Lease Renewal and Lease Takeover Proposal records parse, sign and verify
structurally, but remain explicitly unsupported at the Mesh runtime boundary
until their reducers and state authorization are implemented.

## Frozen limits

Protocol v0 applies these structural limits before a payload can enter a
reducer:

| Limit                                  |             Maximum |
| -------------------------------------- | ------------------: |
| Decompressed envelope                  | 262,144 UTF-8 bytes |
| Payload                                | 196,608 UTF-8 bytes |
| Nesting depth                          |                  32 |
| Total object keys / keys in one object |         2,048 / 256 |
| Total array items / items in one array |       4,096 / 1,024 |
| One string                             |  65,536 UTF-8 bytes |
| Extensions / critical extensions       |              16 / 8 |
| Identifier                             |     256 UTF-8 bytes |
| Envelope lifetime                      |          10 minutes |
| Clock-skew allowance                   |           2 minutes |
| Replay window                          |     2,048 sequences |

The implemented Alpha 2 discovery and capability payloads additionally freeze
these narrower limits:

| Field                                          | Rule                                                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `protocolVersions`                             | 1–8 sorted unique non-negative safe integers and must include `0`                                                           |
| Peer Card transport hints                      | At most 8 sorted unique non-empty strings; 2,048 UTF-8 bytes each and 8,192 bytes in aggregate                              |
| Peer Card capability IDs                       | At most 32 sorted unique identifiers                                                                                        |
| Capability key                                 | Non-empty; at most 4,096 UTF-8 bytes                                                                                        |
| Capability version and optional variant        | Non-empty; at most 128 UTF-8 bytes each                                                                                     |
| Input or output media types                    | At most 16 sorted unique non-empty strings per collection; 128 UTF-8 bytes each                                             |
| Capability attributes                          | At most 32 entries; non-empty keys up to 128 UTF-8 bytes, non-empty values up to 1,024 bytes, and 16,384 bytes in aggregate |
| Peer Card or capability-advertisement validity | Greater than zero and at most exactly 24 hours                                                                              |

Every collection marked sorted and unique uses ascending lexicographic order
over UTF-16 code units, matching the JCS/RFC 8785 property-name ordering rule.
This is intentionally not Unicode code-point order; duplicate adjacent values
are rejected.

Envelope TTL is 30 seconds for `peer.ping` and `peer.ping_ack`, 60 seconds for
`peer.goodbye`, and 120 seconds for `peer.hello`, `peer.card`,
`capability.advertise` and `capability.withdraw`. These family limits are also
bounded by the global ten-minute maximum.

Work Release and Work Cancel envelopes have a two-minute TTL. Release is a
closed `owner`/`assignee` authority and `reoffer`/`close` disposition pair;
assignee release must be sent before its declared lease expiry. Cancel is a
closed `award_pending` branch without `acceptanceId` or `active` branch with
one. These are structural limits only; local state determines recipients,
authority, terminality, idempotency and accounting.

Lease Renewal envelopes have a 30-second TTL and must expire no later than the
currently declared lease. A renewal self-binds the assignee, requires direct
delivery and extends the declared expiry by a positive duration of at most 24
hours. The accepted Objective may impose a lower duration and renewal count.

Lease Takeover Proposal envelopes have a one-minute TTL. They require one direct
peer audience, mandatory causation and Objective-header equality. The trusted
receiver clock and accepted Objective policy—not sender-declared time—determine
whether lease expiry plus recovery grace has elapsed.

Alpha 2 domain-limit, ordering, validity, self-binding and predecessor
violations return `invalid_payload`. Envelope lifetime violations return
`invalid_lifetime`; generic parser structural-limit violations return
`structural_limit_exceeded`.

## Objective limits

Objective documents are complete replacements: announce is revision 1 with no
envelope causation ID; revise is revision 2 or greater, names a different
`previousObjectiveDocumentId`, and requires envelope `causationId`; cancel names
the current document and revision and also requires envelope `causationId`.
The envelope `causationId` is a message ID, not a substitute for the payload's
previous-document ID. All three messages require an envelope `objectiveId` that
exactly matches the payload. Document issuers must self-bind to the sender.
Structural acceptance of `contentReference` does not authorize retrieval;
issuer authority, reference authorization and current-revision checks require
accepted local state and remain outside the protocol parser.

| Field                        | Rule                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Summary or content reference | Exactly one non-empty representation; each at most 4,096 UTF-8 bytes                                                                           |
| Success criteria             | 1–32 non-empty strings, 4,096 UTF-8 bytes each and 16,384 bytes in aggregate                                                                   |
| Permitted capability keys    | 1–32 sorted unique non-empty strings, 4,096 UTF-8 bytes each                                                                                   |
| Work / concurrency           | Work items 1–1,000,000; concurrency 1 through work-item maximum                                                                                |
| Budget units                 | Non-negative safe integer                                                                                                                      |
| Timers                       | Bid window at most 1 hour; acceptance at most 15 minutes; lease at most 24 hours; recovery grace at most 1 hour; each must fit within validity |
| Lease renewals               | Safe integer 0–100                                                                                                                             |
| Recovery witnesses           | 3–32 sorted unique identifiers and strict-majority threshold                                                                                   |
| Authorized observers         | Optional, at most 32 sorted unique identifiers                                                                                                 |
| Objective validity           | Greater than zero and at most exactly 30 days                                                                                                  |

Objective announce and revise have a five-minute envelope TTL; cancel has a
two-minute TTL. Objective scope, binding, closure, ordering, revision,
causation, timer and limit violations reject with `invalid_payload`; their TTL
violations reject with `invalid_lifetime`.

## Work Offer and Bid limits

Work Offers name an immutable Objective document and work-item revision. The
first attempt has no predecessor or envelope causation; later attempts require
both and must name a different `previousOfferId`. Offers self-bind their owner
to the envelope sender and may target one peer or the `work` topic. Work Bids
name one Offer, self-bind their bidder to the sender, require causation, and
must be addressed directly to the named owner. Bid revision 1 has no predecessor;
later revisions require a different `previousBidId`.

| Field                        | Rule                                                                                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required capability keys     | 1–32 sorted unique non-empty strings, at most 4,096 UTF-8 bytes each                                                                                                                |
| Matching attributes          | At most 32 entries; non-empty keys up to 128 UTF-8 bytes, non-empty values up to 1,024 bytes, and 16,384 bytes in aggregate                                                         |
| Input summary or reference   | Exactly one non-empty representation; each at most 4,096 UTF-8 bytes                                                                                                                |
| Completion criteria          | 1–32 non-empty strings, at most 4,096 UTF-8 bytes each and 16,384 bytes in aggregate                                                                                                |
| Bid assumptions              | 0–32 non-empty strings, at most 4,096 UTF-8 bytes each and 16,384 bytes in aggregate                                                                                                |
| Reservation and budget units | Budget values are non-negative safe integers; capacity reservation is a safe integer from 1 through 1,000,000                                                                       |
| Offer deadlines              | `sentAt < bidDeadline < workDeadline`; bid deadline is at most 1 hour after send, work deadline at most 30 days after send, and envelope expiry must not exceed bid deadline        |
| Bid deadlines                | `sentAt < bidExpiresAt <= bidDeadline < expectedCompletionAt <= workDeadline`; the same one-hour bid and 30-day work horizons apply, and envelope expiry must not exceed bid expiry |

Offer and Bid envelope TTL is two minutes. Structural validation does not decide
whether an Objective revision is current, a Work Item is current, an offer
attempt supersedes another offer, a capability advertisement is accepted, a
bid has capacity or budget authority, or deadlines and reservations are valid
against accepted local state. Those checks require reducer authorization state
and remain deferred.

## Work Award, Accept and Decline limits

An Award names one Offer and selected Bid and self-binds the owner sender. Any
direct peer audience is structurally valid; whether it is the assignee or a
witness is a local-state check. It carries an assignment epoch,
assignment-authority ID and fencing token. The normal `authorityKind: "award"`
branch requires both IDs to equal `awardId` and forbids recovery references. The
`authorityKind: "recovery_certificate"` branch requires `recoveryCertificateId`
and requires both IDs to equal that certificate; an optional resume checkpoint
is structural metadata only.

Accept and Decline each name the Award and self-bind the assignee sender.
Accept accepts any direct peer audience structurally; owner-or-witness
authorization is stateful. Decline is structurally directed to the owner. Both
require an envelope causation ID. Resolving Award causation to the selected Bid
envelope, and response causation to the accepted Award envelope, requires the
local causal journal and is stateful. All three records bind the envelope
Objective ID to the payload Objective ID.

| Field            | Rule                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Owner epoch      | Positive safe integer; frozen at `1` for this protocol slice                               |
| Assignment epoch | Positive safe integer; recovery authority requires epoch `2` or greater                    |
| Award time order | `sentAt <= leaseStartsAt < acceptanceDeadline <= leaseExpiresAt <= workDeadline`           |
| Award windows    | Acceptance window at most 15 minutes; lease at most 24 hours; work horizon at most 30 days |
| Award expiry     | At most two minutes and no later than `acceptanceDeadline`                                 |
| Response time    | `sentAt < acceptanceDeadline`; expiry at most two minutes and no later than that deadline  |

These are structural contracts only. Selection of a current bid, current owner
and revision, budget reservation, acceptance uniqueness, deadline observation,
causal-reference resolution, and recovery-certificate acceptance all require
local state and remain deferred.

## Work Progress, Checkpoint and Result limits

Execution records self-bind the assignee sender, require a direct peer audience
and causation, and bind Objective and Work Item revisions, accepted assignment
IDs, epoch, authority token and lease expiry. Each record has a stable domain
ID independent of the envelope message ID.

| Field              | Rule                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| Owner epoch        | Positive safe integer; frozen at `1` for this protocol slice                                    |
| Assignment binding | Positive epoch; `assignmentAuthorityId` and `fencingToken` must be identical identifiers        |
| Progress           | Positive sequence and non-empty summary of at most 4,096 UTF-8 bytes; checkpoint ID is optional |
| Checkpoint         | Positive sequence, canonical SHA-256 digest and exactly one summary or reference                |
| Checkpoint parent  | Sequence `1` omits a parent; later sequences require a different `previousCheckpointId`         |
| Result             | Canonical SHA-256 digest, optional checkpoint ID and exactly one summary or reference           |
| Content            | Summaries and references are non-empty and at most 4,096 UTF-8 bytes                            |
| Execution expiry   | At most five minutes, strictly after `sentAt` and no later than the signed `leaseExpiresAt`     |

The structural parser does not prove that causation resolves to the matching
accepted `work.accept`, that the recipient is an authorized owner, observer or
witness, or that the assignment, epoch, authority, token, lease and checkpoint
head are current. It also does not enforce progress ordering or result
uniqueness. Those checks require accepted local state and remain deferred to
the Mesh runtime reducer boundary.

## Lease Renewal limits

Lease Renewal carries the accepted assignment authority plus
`leaseRenewalId`, `leaseRenewalSequence` and `renewedLeaseExpiresAt`. The
existing `leaseExpiresAt` is the current lease that limits delivery; the renewed
timestamp is the proposed successor. Sequence `1` omits
`previousLeaseRenewalId`; later sequences require a different predecessor ID.

The sender self-binds to `assigneePeerId`, the audience is one direct peer, the
envelope Objective ID equals the payload Objective ID, and causation is
required. The first accepted renewal resolves causation to `work.accept`; later
renewals resolve it to the immediately preceding `lease.renew` envelope for
that recipient. Recipient authorization, exact predecessor and sequence,
current assignment and lease, Work deadline, Objective duration/count policy,
terminal state and idempotency remain stateful reducer checks.

## Lease Takeover Proposal limits

Lease Takeover Proposal carries the accepted assignment authority and current
lease expiry plus a stable `takeoverProposalId`. It identifies the self-bound
`proposerPeerId`, a closed `candidate` or `witness` `proposalAuthority`, the
different `proposedAssigneePeerId`, and exactly the next declared assignment
epoch. It does not propose a fencing token; an accepted recovery certificate's
stable ID becomes that token later.

`leaseRenewalSequence` is `0` for the initial accepted lease and omits
`latestLeaseRenewalId`. Values `1` through `100` require that stable renewal ID.
Causation resolves to the accepted `work.accept` for sequence `0`, or to the
latest accepted `lease.renew` envelope for the receiving witness.

The parser enforces closed fields, role consistency, direct delivery, mandatory
causation, Objective equality and the one-minute TTL. It does not establish that
the lease head is accepted or expired, recovery grace elapsed, the proposer and
candidate are eligible, the recipient is a configured witness, or the Work Item
is current and non-terminal. Those checks require accepted local state and a
trusted receiver clock. A valid proposal records recovery intent only; it does
not advance the epoch, grant execution authority, change fencing or reserve
budget.

Importing the package performs no parsing, key resolution, network or storage
operation.
