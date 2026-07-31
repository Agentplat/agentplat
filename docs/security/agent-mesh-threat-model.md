# Agent Mesh threat model

Status: design baseline for the Agent Mesh alpha line.

This document defines what the public protocol, peer runtime, Inference Control
and Resilience Lab must protect and test. It does not claim protection beyond
the stated trust boundaries and assumptions.

## Integrity and authorization assets

- tenant and mesh isolation;
- peer and objective issuer identity;
- payload integrity, audience and freshness;
- authority over Work Items, leases and external actions;
- epochs, fencing tokens and idempotency records;
- evidence provenance and append-only history;
- bounded peer resources and continued local operation.

## Confidentiality-sensitive assets

- private key material;
- credentials and Action Grants;
- application content, evidence and content references;
- provider input, output and private reasoning.

Protocol v0 signs envelopes but does not encrypt payloads. It protects these
assets from normal telemetry disclosure and requires secure key handling;
network and end-to-end confidentiality depend on the transport and application
adapters documented below.

## Trust boundaries

```text
network transport
message parser and verifier
peer admission policy
Mesh peer reducer and stores
agent runtime and provider adapter
context, memory and evidence
Action Gateway, tools and MCP
Room bridge and control plane
audit and telemetry sinks
```

Transport authentication and signed message identity are separate layers.
Rooms, audit and metrics are optional consumers and are not trusted to maintain
steady-state coordination.

The coordination inbound boundary revalidates bounded structure,
scope, audience, freshness and critical extensions before cryptographic work.
It is constructed once with trusted local key resolution, cryptographic policy,
Web Crypto and protocol limits; remote message requests cannot substitute those
dependencies. It then uses the reference verifier for payload digest, proof and
locally resolved key binding before consulting admission or replay state. Key
resolution is synchronous and local; network-backed discovery must occur
outside this decision boundary. The verified envelope is revalidated and must
be canonically identical to the requested envelope.

Replay windows and retained message IDs are a separate, non-evictable,
schema-versioned snapshot shared by discovery and Objective ingress. Processing
orders context, cryptographic verification, exact admission and, for Objective
messages, issuer authority, replay accounting, then the relevant domain
transition. An
authenticated message that reaches replay may consume normal replay accounting
before a later domain predecessor, revision or capacity rejection, but that
rejection cannot change the domain projection. Receiving a topic envelope never
relays it.

The coordination and Objective topic drivers are bounded in-memory reference
components, not a membership service or durable transport. Their process-local
endpoint registry is used only as a route table after a sender-local active
Peer View has selected recipients and joined them to exact current instances.
It takes one atomic, bounded queue admission decision for the entire recipient
snapshot, copies the exact signed envelope, and serializes FIFO processing
through construction-bound receiver clocks and inbound processors. It provides
no global fanout, implicit forwarding, complete membership knowledge or
recipient oracle. Public receipts coarsen failures; detailed codes are emitted
only to local diagnostics so remote senders cannot probe validation outcomes.

The Objective/Work projection is another explicit local trust boundary. Its
pure Objective evaluator accepts only values that a caller asserts were already
verified. It revalidates closed structure, scope, audience, freshness, exact
admission instance and provisioned issuer authority, but does not itself verify
the signature or consume replay state. Untrusted transports must use the
authenticated shared inbound processor rather than calling this evaluator
directly. The Objective processor composes immutable identity-aligned
coordination, discovery, Objective and inbound-security snapshots. It uses an
ephemeral clock-aligned Objective view when discovery alone has advanced logical
time.

Objective authority is provisioned as an issuer peer plus a bounded sorted key
allowlist and exclusive validity limit. A current issuer may rotate among those
keys; a different issuer peer cannot revise or cancel the Objective. Local Work
commands derive the local owner, owner epoch and next revision, accept no
command-embedded clock or caller-selected next revision, and use a separate
driver-supplied trusted time input plus stable generation-fenced deadlines.
Strict runtime composition binds Objective-scoped domain metadata through
`objectiveId`, retains every accepted signed Objective envelope and its derived
policy under a hard non-evicting limit, and canonicalizes each Work Item to that
exact policy head. Restore revalidates closed envelope structure, recomputes the
canonical SHA-256 payload digest, derives expiry from retained trusted time and
requires the accepted domain record to carry the same digest. Cancelled heads
retain the signed cancellation envelope and bind its payload, digest, message,
cause and trusted validation time to the terminal record. It rejects coherent
historical policy/Work forgery, fabricated cancellation, orphan timers,
historical document/message ID reuse, ambiguous composite IDs and Work timers
rebound to a later Objective revision. Timer-ID collisions fail closed, the
generic coordination timer evaluator refuses workflow-owned Objective expiry
and Work deadline timers, and exact nanosecond timestamp arithmetic prevents
valid sub-millisecond inputs from triggering an exception or early expiry.
Restore does not re-resolve keys or reverify retained proofs; the driver must
integrity-protect persisted snapshots.

An exact historical Objective duplicate is idempotent only after current
ingress, admission, issuer-authority and freshness validation at the pure
Objective boundary. Duplicate handling does not restore a prior head or bypass
those checks.

The Allocation recovery boundary retains the accepted assignment, current
lease head, latest witnessed checkpoint and a stable fence independently of
award IDs and epochs. The accepted Objective revision fixes a sorted witness
set and majority threshold. A proposal is eligible only after trusted local
expiry plus recovery grace and targets exactly the next epoch. Each witness can
endorse at most one proposal for that scope and epoch. A certificate resolves a
threshold of distinct retained votes before it advances the fence; it grants no
execution authority until the unchanged owner issues a matching recovery award
and the certified candidate accepts it. Every recovery fanout is a bounded set
of direct recipient-specific signed envelopes. A local recovery command proves
the complete expected fanout; a received envelope proves only the recipient's
own direct copy and causal chain, never delivery to other recipients. Recovery
award and acceptance retain the prior committed reservation rather than charge
the Objective again. The award names the retained checkpoint, and the first
replacement checkpoint must name it as parent at prior sequence plus one.
Snapshot restoration revalidates the full bounded proposal, vote, certificate,
fence, journal, timer and checkpoint graph rather than trusting serialized
derived heads.

The deterministic simulation fault injector is outside production reducers. A
versioned, bounded fault plan changes adapter delivery, topology, peer running
state and peer-local clock inputs. Its digest, cursor, topology, offsets,
queued events, random streams and metrics are part of the simulation snapshot
and trace so restore and replay cannot silently omit an applied fault.

Detailed cryptographic rejection codes are local diagnostics. Transports must
not echo them to untrusted senders, and must apply bounded queues and ingress
rate limits so pre-admission verification cannot become a key-status oracle or
unbounded CPU-amplification path.

## Adversaries

- unauthenticated network clients;
- defective or compromised transports;
- admitted peers that are stale, faulty or malicious;
- multiple admitted peers that coordinate false input;
- compromised objective issuers;
- compromised or revoked signing keys;
- parsers receiving oversized or adversarial JSON;
- model output and peer content attempting to change trusted instructions;
- adapters that ignore cancellation, budgets or action policy.

## Threats, mitigations and verification

| Threat                             | Required mitigation                                                                                                          | Verification                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Identity or audience spoofing      | Signed scope, sender, instance and audience; local key binding                                                               | Tamper and cross-audience conformance fixtures                                                  |
| Unauthorized identity bootstrap    | Preprovisioned binding or trust-anchor-attested enrollment before ordinary message acceptance                                | Unknown, self-signed and admitted-card scenarios                                                |
| Cross-tenant or cross-mesh replay  | Signed tenant/mesh plus early local scope checks                                                                             | Isolation tests before reducer invocation                                                       |
| Duplicate or reordered delivery    | Message IDs, bounded sequence windows and idempotent reducers                                                                | Duplicate/reorder scenarios                                                                     |
| Version downgrade                  | Exact supported versions and critical feature negotiation                                                                    | Unknown and downgrade fixtures                                                                  |
| Algorithm substitution             | Signed algorithm/key ID and local suite allowlist                                                                            | Unsupported algorithm tests                                                                     |
| Revoked-key reuse                  | Fresh local revocation state; live rejection independent of sender-provided time                                             | Rotation, backdating and archival replay scenarios                                              |
| Stale executor commit              | Assignment epoch, lease and fencing token                                                                                    | Crash/reassignment action test                                                                  |
| Award or recovery equivocation     | Logical IDs bound to canonical content; one witness vote per stable scope and next epoch; conflicting reuse fails closed     | Divergent award, proposal, vote and certificate scenarios                                       |
| Recovery split brain               | Fixed majority witness policy, distinct-vote threshold, exact next epoch and fence-before-activation                         | Minority/majority partitions, concurrent proposals and healed stale delivery                    |
| Premature takeover                 | Trusted monotonic time, exclusive lease expiry and signed recovery grace                                                     | Before/at/after-grace and clock-offset scenarios                                                |
| Snapshot rollback or graph forgery | Strict schema migration and complete proposal/vote/certificate/fence/journal relation validation                             | Tampered graph, missing vote, stale fence and uninterrupted-versus-restored simulation          |
| Recovery resource exhaustion       | Bounded proposals, votes, certificates, witness evidence, timers and direct fanout; fail-closed backpressure                 | Capacity and no-quorum recovery-storm scenarios                                                 |
| Gossip amplification               | Sender-local active-view snapshot, atomic bounded FIFO admission and backpressure; no global fanout or transitive forwarding | Signed three-peer A-to-B and explicit B-to-C scenario, saturation and cyclic topology scenarios |
| Parser resource exhaustion         | Pre-parse byte limits, strict JSON limits and bounded errors                                                                 | Fuzz and oversized input tests                                                                  |
| Capability spoofing                | Treat capabilities as self-claims; verify outcomes separately                                                                | False-advertisement scenario                                                                    |
| Objective issuer takeover          | Provisioned peer/key authority, peer-stable revisions, exact parent causation and terminal heads                             | Key-rotation, alternate-issuer, stale-parent and terminal replay scenarios                      |
| Deadline or timer confusion        | Injected monotonic time, length-prefixed timer IDs, exact domain binding and generation fencing                              | Early, stale, late, ambiguous-ID and cross-revision timer scenarios                             |
| Evidence poisoning                 | Signed provenance, contradiction sets and diversity policies                                                                 | Conflicting evidence scenarios                                                                  |
| Trust manipulation                 | Local scoped profiles, decay, uncertainty and low third-party weight                                                         | False-report and recovery scenarios                                                             |
| Context injection                  | Trust zones and structured peer content; no implicit instruction promotion                                                   | Inference control fixtures                                                                      |
| Tool or action escalation          | Action Gateway, short-lived grants and local atomic grant consumption; downstream idempotency or fencing                     | Must-deny, stale-grant and duplicate-effect tests                                               |
| Payload disclosure                 | Protected transport, minimal disclosure, authorized content references and optional application encryption                   | Transport and telemetry disclosure tests                                                        |
| Telemetry exfiltration             | Redacted structured events; raw content disabled by default                                                                  | Audit fixture and sink failure tests                                                            |
| Control-plane outage               | Locally available accepted Objective, journal, policies, keys, content and peer view                                         | Offline control-plane scenario                                                                  |

## Required invariants

- No unaccepted envelope reaches a domain reducer.
- No structurally invalid, expired, unauthenticated, unadmitted or replayed
  message mutates state. An authenticated admitted message rejected by a later
  domain rule may advance only bounded replay security accounting.
- No accepted message or Action Grant authorizes an action across tenant or
  mesh scope.
- No stale epoch can authorize an external action.
- A certificate can advance only the stable assignment fence for exactly the
  next epoch, and no proposal or vote alone creates execution authority.
- One retained witness contributes at most one vote per assignment scope and
  proposed epoch. Duplicate delivery is idempotent; conflicting content is not
  counted.
- A replacement resumes only from the checkpoint named by the recovery award;
  an old-epoch progress, renewal or result remains fenced after healing.
- A conforming Action Gateway dispatches a single-use Action Grant at most once
  locally. Effectively-once downstream behavior is conditional on adapter or
  service idempotency or fencing.
- Peer views, queues and replay caches are bounded. Live journals are bounded
  through versioned checkpoints, retention and backpressure without silently
  discarding state still required for replay, revocation, fencing or
  idempotency.
- Telemetry failure does not change a peer decision.
- Loss of the control plane by itself does not stop already accepted work while
  required data, credentials, policies, keys, budgets and peers remain
  available.
- Untrusted peer content never becomes trusted instructions implicitly.
- Private keys, secrets and private reasoning do not enter fixtures or normal
  telemetry.

## Assumptions and limits

Message signatures do not provide confidentiality, truth or correct model
behavior. They do not repair a fully compromised endpoint or a stolen private
key. Trust scoring does not provide identity admission or unlimited Sybil
resistance.

Signatures authenticate key possession. Accepted identity additionally depends
on local key binding and admission. Self-signed Peer Cards do not admit
themselves. Peer Cards and capability advertisements are self-claims, not
statements of truth; outcomes require separate verification. Live revocation
protection depends on sufficiently fresh local key state; a peer that has not
received a revocation cannot enforce it. Archived
verification is separate from live acceptance and never authorizes a reducer or
action.

Availability and quorum properties apply only under their documented
connectivity, membership and fault assumptions. A policy that requires tool
interception cannot run in enforce mode with a provider that executes
unobservable tools.

Alpha 2 recovery assumes crash, omission and partition faults with at least
three fixed witnesses and a threshold greater than half. It does not tolerate a
compromised witness majority or guarantee progress to a minority partition. If
the owner, threshold, eligible candidate or retained authenticated state is
unavailable, the safe result is no replacement authority. Owner transfer,
Objective issuer failover and production-durable inbox or vote storage remain
outside this alpha.

Protocol v0 does not provide payload encryption. Transport confidentiality,
managed identity distribution, hardware-backed keys, application-level
encryption and organization-wide policy administration are adapter or hosted
service concerns. Fencing and idempotency reduce duplicate effects but cannot
guarantee uniqueness when the downstream system does not enforce either
contract.
