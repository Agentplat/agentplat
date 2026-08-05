# Certified planning availability threat model

## Scope and protected properties

This model covers proactive planning-artifact replication, signed storage
receipts, replication certificates, certificate synchronization, exact fallback
resolution, HTTP transport, and immutable evidence persistence.

It protects:

- exact tenant, mesh, policy-domain, producer, member-instance, fragment, and
  artifact binding;
- deterministic replica selection under one current membership configuration;
- evidence that the configured threshold signed storage acknowledgements before
  producer publication completed;
- durable, idempotent certificate custody at the configured threshold;
- safe exact retrieval from a receipt signer after producer loss;
- continued use of normal planning admission and authority checks;
- bounded protocol, memory, and database resource use.

It does not protect arbitrary blobs, credentials, private reasoning, signing
keys, semantic plan quality, or external effects.

## Assets and trust boundaries

Assets include planning records and publications, membership and key history,
replica-selection inputs, signed requests and receipts, replication
certificates and acknowledgements, immutable repository rows, endpoint maps,
channel credentials, logical time, and private signing keys.

The local host trusts its configured repositories, membership resolver, clock,
signing key, endpoint map, and admission policy. The network, HTTP response,
remote peer, remote storage claim, and synchronized record remain untrusted
until their relevant signatures, digests, current membership, scope, policy,
time window, and closed schema validate.

Channel identity is not peer identity. A database insert is not a storage
receipt until the exact member instance signs it. A replication certificate is
not a planning decision, assignment, Work Contract, Action Grant, or effect
permit.

## Adversaries and failures

- unauthenticated network participants sending malformed or oversized input;
- admitted but faulty, compromised, or colluding peers;
- malicious or compromised producers;
- stale peer instances and restored databases;
- delayed, duplicated, reordered, omitted, replayed, or substituted messages;
- partitions and permanent process loss;
- endpoint or proxy misconfiguration, redirect attacks, and credential leaks;
- repository failures, conflicts, rollback, corruption, and disk exhaustion;
- operator policy mismatch across peers;
- key compromise or incorrect historical-key retention.

## Threats and controls

| Threat                                          | Required control                                                                                       | Verification                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Replica choice differs by host ordering         | Code-unit-stable digest ranking over exact membership and fragment                                     | Reordered membership yields identical selection            |
| Producer chooses friendly replicas              | Selection is deterministic; producer and ambiguous instances are excluded                              | Selection conformance and insufficient-population failures |
| Cross-scope request or certificate              | Exact tenant, mesh, policy domain, peer, instance, and membership checks                               | Foreign-scope sync record rejection                        |
| Store receipt issued before persistence         | Replica writes artifact and sync record before signing and retaining receipt                           | Repository failure and threshold tests                     |
| Receipt or certificate tampering                | Ed25519 envelope proofs, canonical digests, closed shapes, and aggregate revalidation                  | Tampered receipt and certificate cases                     |
| Duplicate signer inflates threshold             | Unique selected `(peerId, instanceId)` and unique receipt signer keys                                  | Duplicate-evidence negative cases                          |
| Stale membership authorizes fallback            | Certificate and every receipt bind one configuration; current membership is required                   | Membership-rotation rejection                              |
| Expired custody evidence is replayed            | Logical expiration, policy lifetime ceiling, and current clock checks                                  | Expiration rejection                                       |
| Certificate claims another artifact             | Exact publication, fragment, artifact, and content-reference equality                                  | Substitution and normal repository validation              |
| Non-replica serves an artifact                  | Fallback targets only valid receipt signers                                                            | Producer-loss scenario and certified-source selection      |
| Conflicting evidence replaces history           | Immutable identity keys; exact duplicate is idempotent and different content conflicts                 | In-memory and PostgreSQL conflict tests                    |
| Redirect leaks channel credentials              | Construction-bound endpoints, HTTP(S) only, no URL credentials, safe relative path, redirects disabled | Invalid endpoint/path and transport tests                  |
| Oversized body exhausts memory                  | Advertised and streamed byte limits plus canonical protocol limits                                     | HTTP boundary tests                                        |
| Certificate bypasses authority                  | Retrieved record re-enters the existing planning repository and reducers                               | Public runtime-port contract and multiprocess offer flow   |
| Producer disappears after success               | Threshold replicas retain artifact and certificate; receiver uses signed fallback                      | Five-process permanent-loss scenario                       |
| Partial producer attempt is reported as success | `put()` requires receipt and certificate-acknowledgement thresholds                                    | Independent threshold failure cases                        |

## Security meaning of a certificate

A valid certificate proves that the named current member instances produced
valid signed receipts for the exact artifact and that the producer assembled
those receipts under the configured policy. Successful producer `put()` also
requires threshold acknowledgement that certificate copies were stored.

It does not prove that a compromised peer actually retained bytes after
signing, that media will survive indefinitely, that a replica is online now,
or that the plan is correct. Deployments must choose membership and threshold
under their trust and failure assumptions. A colluding threshold can make a
false custody claim.

## Residual risks and operational assumptions

- Liveness after producer loss requires at least one honest receipt signer with
  both artifact and certificate to remain reachable.
- Membership change deliberately invalidates existing certificates; automatic
  recertification across configurations is outside this profile.
- Certificate expiration may make a still-present artifact unavailable through
  certified fallback until the application produces current evidence.
- The reference selection policy uses current membership, not dynamic storage
  capacity, geography, trust scores, or failure-domain labels.
- PostgreSQL administrators can corrupt or replace rows and backups. External
  integrity anchors and protected backups remain deployment responsibilities.
- HTTP rate limiting, TLS termination, channel authentication, service
  discovery, and network isolation remain host responsibilities.
- Signed envelopes prove key possession and integrity, not honesty or physical
  durability.
- The protocol does not provide consensus, fork choice, globally ordered
  planning state, or exactly-once external effects.
