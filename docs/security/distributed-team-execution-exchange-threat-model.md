# Distributed team execution exchange threat model

## Protected assets

- integrity of dispatch, artifact, result and recovery records;
- execution/team epoch and member-binding currentness;
- causal stream continuity and deterministic replay;
- availability of bounded peer-local inbox, pending and outbox state;
- confidentiality of provider output, credentials and hidden reasoning; and
- authority enforced by individual Work Contracts and action controls.

## Trust boundaries

Transport bytes are untrusted until the existing Mesh verifier returns a
`VerifiedMeshEnvelope`. A valid Mesh signature identifies an envelope sender
but does not prove current team membership. The membership port and artifact
service are trusted local dependencies. Handlers and outbound publishers are
effectful boundaries and must durably deduplicate `messageId`.

## Threats and mitigations

| Threat                                            | Mitigation                                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Forged or modified record                         | The critical extension participates in the Mesh signing document; extraction accepts only verified envelopes and recomputes domain digests. |
| Cross-tenant, cross-objective or recipient replay | Exact outer tenant, mesh, sender, message-id and direct-audience binding plus signed inner objective scope and local scope matching.        |
| Removed or ignored semantics                      | The extension key must be present in `criticalExtensions`; unsupported peers reject it at Mesh validation.                                  |
| Revoked or stale member                           | Local membership decision must match peer, instance, member, binding, membership epoch and configuration and remain unexpired.              |
| Duplicate delivery                                | Message identity and digest deduplication plus idempotent handler/outbound contracts.                                                       |
| Causal omission or reordering                     | Per-source sequence and predecessor digest; future messages remain pending until the exact chain arrives.                                   |
| Stream fork/equivocation                          | Conflicting predecessor, stale head, reused message id and duplicate pending sequence fail closed.                                          |
| Partition                                         | Bounded missing-interval fetch returns verified envelopes that re-enter normal admission.                                                   |
| Queue exhaustion                                  | Immutable local ceilings for streams, pending, inbox, outbox, TTL, recovery batch and CAS attempts.                                         |
| Crash between effect and acknowledgement          | Durable ready/pending state is committed first; retries reuse `messageId`.                                                                  |
| Raw data leakage                                  | Records contain content references and digests; artifact bytes, prompts, credentials and hidden reasoning are outside exchange state.       |
| Authority escalation                              | Exchange records are coordination data; effect gateways still validate Work Contracts, assignment epochs, leases, fences and controls.      |

## Residual risks

- A trusted membership implementation can authorize the wrong member.
- A compromised current peer can publish false but attributable results.
- Artifact references may become unavailable outside the exchange's control.
- Exactly-once external effects require durable idempotency in application
  handlers; the runtime provides at-least-once retries.
- Permanent partitions preserve safety but can prevent progress.

## Operational requirements

- Run signed-envelope validation with this extension key in the supported
  critical-extension set.
- Persist exchange state and the Mesh outbox durably in production.
- Share handler idempotency receipts across peers eligible for the same work.
- Bound and monitor pending depth, recovery attempts, rejected forks, handler
  failures and artifact unavailability without logging message payloads.
- Rotate Mesh keys and membership configurations through their existing
  mechanisms; do not encode private keys or credentials in exchange records.
