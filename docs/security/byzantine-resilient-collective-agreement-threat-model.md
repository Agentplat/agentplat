# Byzantine-resilient collective agreement threat model

## Protected assets

- uniqueness of the committed value for one policy-domain, slot and height;
- validator vote/lock state across crashes and concurrent requests;
- membership epoch, validator identity and key binding;
- commit-history continuity during catch-up;
- attributable evidence when a validator signs conflicting votes.

## Trust and fault assumptions

The validator set contains exactly `n = 3f + 1` members. At most `f` may behave
arbitrarily, collude, omit messages, equivocate or disclose their signing keys.
Cryptographic primitives, the configured key resolver and at least `2f + 1`
validator repositories are trusted to preserve their documented behavior.

Safety does not depend on message timing. Liveness assumes eventual synchrony,
at least `2f + 1` responsive validators and an eventually responsive correct
proposer. A compromised host and its signing key count as one faulty validator,
not two independent failures.

## Boundary controls

| Threat                         | Control                                                                                              | Failure behavior                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Conflicting proposals          | Deterministic proposer, exact coordinate and value digest                                            | Reject wrong proposer or malformed binding                                          |
| Validator double vote          | Transactional one-vote key per height, round and phase                                               | Refuse the second local signature; retain conflicting remote signatures as evidence |
| Conflicting commits            | `2f + 1` prevote and precommit certificates under one `3f + 1` membership                            | Reject below-threshold, duplicate-signer or mismatched certificates                 |
| Lock bypass in a later round   | Persisted lock; conflicting value requires a verified prior prevote certificate at or above the lock | Reject as `locked`                                                                  |
| Membership substitution        | Epoch and full configuration digest in every coordinate; resolver must return the exact set          | Fail closed when binding is absent or different                                     |
| Unsafe membership change       | Joint certificates from prior and next validator sets                                                | Do not activate a one-sided transition                                              |
| Forged or stale message        | Ed25519 verification, active key interval, audience/scope checks and bounded TTL                     | Reject before semantic evaluation                                                   |
| Replay and concurrent delivery | Deterministic message identities plus durable idempotent votes and commits                           | Return the prior exact vote or reject conflict                                      |
| Catch-up fork or gap           | Ordered heights, prior-commit hash chain, per-commit signature and membership verification           | Reject the complete bundle                                                          |
| Oversized network input        | One MiB canonical envelope limit and bounded HTTP request/response bodies                            | Return a size error without protocol mutation                                       |
| Invalid application decision   | Caller-supplied semantic validation runs before prevote                                              | Abstain from the proposal                                                           |
| Compromised validator detected | Portable equivocation proof maps to Trust evidence                                                   | Policy may restrict or quarantine; agreement does not auto-punish                   |

Live protocol handling requires an unexpired envelope and a key that is still
usable at verification time. Historical certificate, catch-up and evidence
verification instead accepts a retained revoked key only when the signed
envelope predates the authenticated revocation timestamp. This keeps key
rotation from invalidating committed history without allowing a revoked key to
participate in a new round.

## Safety argument

Any two sets of `2f + 1` validators in a set of exactly `3f + 1` intersect in
at least `f + 1` validators. With no more than `f` faulty validators, the
intersection contains a correct validator. A correct validator durably signs at
most one value per round/phase and does not replace a lock without a qualifying
prior certificate. Therefore two conflicting valid commit certificates cannot
be produced for one height under the stated assumptions.

Joint reconfiguration applies the argument independently to both validator
sets. Catch-up accepts only already certified commits and cannot create a new
decision.

## Residual risks and non-goals

- More than `f` compromised validators can violate safety.
- Denial of service can prevent progress even when safety remains intact.
- Faulty semantic validators may certify a payload that is validly encoded but
  undesirable; application policy is a separate control.
- Side-channel resistance, hardware-key custody, denial-of-service admission,
  discovery and automatic timeout tuning are deployment responsibilities.
- V1 does not provide confidential payloads, aggregate signatures, weighted
  voting, proof-of-stake economics or arbitrary state-machine replication.

## Required verification

- seven validators commit with two participants unavailable;
- four of seven validators cannot produce a certificate;
- restart retains vote, lock and commit state;
- a conflicting higher-round proposal without sufficient justification fails;
- duplicate, malformed, wrong-membership and forged messages fail closed;
- live messages from revoked keys fail while pre-revocation history verifies;
- two conflicting valid votes produce deterministic equivocation evidence;
- joint membership requires both old and new certificates;
- catch-up rejects gaps, forks and invalid signatures;
- HTTP and PostgreSQL adapters preserve the same invariants.
