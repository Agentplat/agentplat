# Evidence and Trust threat model

Status: Alpha 4 design frozen at normative commit
`e08e43beecf913e6e0a650c29625371ea1a29a4b`.

This document defines the security boundary for `@agentplat/trust`, the Mesh
Evidence ingress and the opt-in Inference Control Trust bindings. It complements
the Agent Mesh and Inference Control threat models; it does not replace their
identity, signature, replay, lease, fencing, context or Action Grant controls.

## Security objective

Alpha 4 must preserve these properties under malformed, duplicated, delayed,
reordered, replayed, contradictory and adversarial Evidence:

- only strict, bounded and correctly scoped records enter authoritative local
  Trust state;
- a signature is never interpreted as proof that a Claim is true;
- identity multiplication and correlated sources cannot exceed locally
  configured dependency-group caps;
- Trust Profiles and Fusion Decisions are deterministic and explainable;
- uncertainty, contradiction, equivocation, staleness and unavailable content
  cannot silently improve a profile;
- quarantine is exact-scope and cannot affect another tenant, subject,
  capability or dimension;
- quarantine recovery requires new independent qualifying Evidence;
- restore cannot invent positive Evidence, erase contradiction or resurrect a
  stale profile;
- Trust can restrict an explicit integration but cannot create execution or
  authorization authority.

## Protected assets

### Evidence integrity

- immutable Claim, Attestation, Challenge and Retraction content;
- content-bound IDs and domain digests;
- author, subject, scope and causal relationships;
- local admission origin and logical admission time;
- active, pending, challenged, retracted, conflicted and unavailable status;
- append-only history needed to explain a decision.

### Policy integrity

- Fusion policy ID, version, lineage and digest;
- source bindings and allowed roles;
- dependency-group membership and caps;
- criterion-to-dimension mapping;
- score, uncertainty, decay, eligibility, quarantine and recovery thresholds;
- limits, redaction and diagnostic bindings.

### Derived-state integrity

- exact Fusion input set and inclusion/exclusion reasons;
- per-source and per-group effective weights;
- independent Trust Profile dimensions;
- uncertainty, freshness and effective weight;
- profile and quarantine heads;
- logical-time high-water mark and trace digest.

### Authority separation

- Mesh admission, Objective issuer and Work assignment authority;
- lease, epoch, recovery certificate and fencing state;
- Inference Control policies, assessments and dependency bindings;
- Action Grants, message permits, idempotency and downstream fences;
- application authentication and permissions.

Trust state must never mutate or substitute these assets.

### Confidentiality-sensitive data

- Evidence content and references;
- source/dependency topology;
- unredacted Fusion decisions;
- private policy thresholds;
- full snapshots;
- controlled prompts, outputs, action arguments and messages referenced by a
  local Claim.

## Trust boundaries

### Boundary A: strict local record admission

The root package accepts application-supplied local records only after strict
shape, limit, canonical digest, scope and relationship validation. The caller
is responsible for the authenticity of a `local` source. Root APIs do not label
caller data as verified Mesh Evidence.

### Boundary B: authenticated Mesh Evidence ingress

The Mesh subpath construction-binds parser limits, key resolver, crypto policy,
local identity, admission state, accepted coordination state, replay state,
source bindings and Trust policy. Its order is parse, scope/freshness, crypto,
admission/role, replay, causal authority, Evidence binding and pure Trust
transition.

A wire payload, a TypeScript cast or a signature without admission cannot cross
this boundary.

### Boundary C: referenced-content resolver

The reducer never fetches content. A separately constructed resolver checks
authorization, tenant/scope, media type, maximum bytes, immutable version and
content digest before returning an inspectable result. Data unavailable under
that exact binding remains unavailable.

### Boundary D: local Fusion engine

Fusion consumes only accepted state, an exact local policy and trusted logical
time. It performs no I/O and treats unknown sources, remote observations,
unresolved relationships and stale bindings as ineffective.

### Boundary E: profile and quarantine projection

Profiles and quarantine are derived local state. They do not change signatures,
keys, admission or coordination authority. Recovery is a new local transition,
not a mutation of historical Evidence.

### Boundary F: Mesh eligibility integration

The explicit filter receives the existing candidate set and may preserve or
reduce it. It cannot add a peer, select an assignee, issue an award, renew a
lease, advance an epoch or generate a fence.

### Boundary G: Inference Control integration

Trust-bound wrappers use existing Alpha 3 execution and gateway boundaries.
They may refuse delegation or emit an observation. They cannot mint or alter an
assessment, Action Grant, scope, idempotency record, dispatcher authority or
downstream fence. The state-backed path recognizes only an opaque token built
by strict Trust snapshot restore; Trust state stays in a private runtime
registry. On each check, an identity/version/protector-bound current source
must repeat the exact external rollback anchor used for that token. The current
profile-resolver and operation-boundary heads bind the policy, subject mapping,
eligibility template, runtime source and real base implementation.

The bound current source is explicitly in the trusted computing base. It must
read the application's durable Trust high-water anchor atomically on every
check and cannot be a cache. A valid older anchor cannot reveal an authentic
successor that this process has never observed; returning such an older head as
the first sample is a source compromise/operational boundary violation, not a
condition local digest validation can detect.

### Boundary H: snapshot and restore

Full state is sensitive. State hashes detect inconsistency but are not
authentication. Strict restore requires a construction-bound cryptographic
protector, an exact durable rollback anchor outside the candidate blob and, for
`verified_mesh`, the original authenticated envelope proof in composite Mesh
state. It then revalidates every record and rederives indexes, Fusion decisions,
profiles and quarantine history. Redacted support projections cannot be
restored.

### Boundary I: observability

Audit and diagnostic effects are bounded and redacted. They are consumers, not
Evidence or authority stores. Logs cannot be replayed as Trust state.

## Adversary model

Alpha 4 assumes an attacker may:

- send arbitrary bytes and deeply nested or oversized JSON;
- control an admitted peer and its valid signing key;
- create false but correctly signed Claims;
- issue contradictory or strategically timed Attestations and Challenges;
- duplicate, delay, reorder, omit or replay messages;
- replay Evidence across tenants, Meshes, Objectives, Work revisions, epochs,
  fences, runs or policies;
- create many identities when the deployment's admission process permits it;
- coordinate multiple sources that share control or a failure domain;
- exploit missing or mutable external content;
- induce network partition, dependency outage, timeout or restart;
- submit forged snapshots or remove unfavorable history;
- attempt logical-clock rollback or extreme time advance;
- exhaust record, relationship, challenge, profile, quarantine or diagnostic
  capacity;
- call unwrapped Runtime, provider, Mesh, tool or message APIs directly;
- inspect public rejection behavior to infer policy or source state.

Alpha 4 does not assume every admitted source is honest, accurate or
independent.

## Assumptions and residual limits

- A valid signature proves control of the configured key and record integrity,
  not correctness.
- Admission and source-binding policy are configured by a trusted local
  administrator outside remote-message input.
- Dependency groups accurately reflect the operator's current independence
  assumptions. The package cannot discover common ownership or hidden
  coordination.
- Identity multiplication resistance ultimately depends on admission and source
  binding. Unknown identities receive zero weight but can still consume bounded
  ingress work.
- A colluding set spanning enough groups configured as independent can satisfy
  policy. Alpha 4 documents this limit and cannot infer hidden collusion.
- Trusted logical time is monotonic within one state lineage. Wall-clock
  correctness and cross-peer synchronization are not required for deterministic
  local evaluation.
- Key revocation effectiveness depends on fresh local key state. Historical
  records remain attributable but do not regain live authority.
- External content may be missing or confidential. Absence does not prove a
  Claim false, but it blocks a positive decision when content is required.
- Local in-memory state is not a durable multi-process transaction log.
- Snapshot authenticity depends on a locally trusted protector/key binding, and
  rollback resistance depends on atomically durable external anchor or
  authenticated journal state. Without both, restrict-mode restore is
  unavailable.
- Restoring verified Mesh Evidence depends on retaining its signed envelope and
  historical crypto/admission/coordination proof in authenticated composite
  Mesh state; a normalized Trust record alone is insufficient.
- Restrictive checks are point-in-time local decisions unless a downstream
  service offers an atomic policy/fence transaction.
- A direct call outside an opt-in Trust wrapper is outside the enforcement
  boundary and receives no Trust-derived authority.

## Threats and required controls

| Threat                                       | Required control                                                   | Fail-closed result                              |
| -------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| Oversized or pathological JSON               | Pre-clone byte/depth/node/key/array limits and strict JSON         | Record rejected, state unchanged                |
| Unknown field or permissive payload          | Closed schemas and discriminants                                   | `invalid_record` or protocol rejection          |
| Digest-domain confusion                      | Domain-separated prefixes and recomputation                        | `digest_mismatch`                               |
| Same logical relation, conflicting content   | Content-bound IDs plus relationship conflict index                 | Both excluded; equivocation retained            |
| Retraction hides relation equivocation       | Permanent relationship-conflict state                              | All variants remain ineffective                 |
| Duplicate delivery                           | Exact record digest idempotency                                    | No state/profile change                         |
| Cross-tenant/scope replay                    | Exact tenant, Mesh, Objective, Work, epoch, fence and run binding  | Rejected before Trust mutation                  |
| Sender timestamp manipulation                | Trusted effective time for age/decay/recovery                      | Sender time informational only                  |
| Logical-clock rollback                       | State high-water check                                             | Entire transition rejected                      |
| False signed Claim                           | Independent attestation and local criterion policy                 | No positive contribution without threshold      |
| Zero-threshold criterion                     | Positive group and weight minima required in every criterion       | Policy rejected                                 |
| Third-party Claim against unrelated subject  | Criterion Claim-authority rule plus historical role/basis binding  | `claim_subject_authority_invalid`               |
| Self-Attestation                             | Source/subject comparison and group independence                   | Cannot satisfy independent groups               |
| Many identities in one organization          | Configured dependency group and group cap                          | Aggregate capped once                           |
| Many Claims/roots from one group             | Aggregate dimension/criterion/group cap across all roots           | Weight capped once                              |
| Unknown identity burst                       | Admission and source allowlist; zero effective weight              | Record-only or ingress rejection                |
| Hidden collusion across configured groups    | Explicit residual-risk documentation and conservative thresholds   | No unsupported stronger claim                   |
| Contradictory Attestations within one group  | Conservative group resolution                                      | Group counts as contradiction                   |
| Simultaneous support and contradiction       | Explicit contested classification                                  | Higher uncertainty; no arbitrary tie-break      |
| Negative inversion                           | Contradicted Claims never become inverse facts                     | Claim excluded                                  |
| Challenge-based reputation attack            | Challenge has no negative weight or quarantine authority           | Exact target unavailable only                   |
| Challenge with unverifiable/irrelevant basis | Criterion authority, exact resolved bases and scope                | Challenge unavailable; target unchanged         |
| Same-group Challenge identity flood          | Canonical group aggregation, non-forward cutoff and quotas         | One blocker; no refresh                         |
| Challenge resolution by colluding identities | Causal-cutoff groups, source-group exclusion and caps              | Target remains unavailable                      |
| Challenge flood                              | Per-source/scope/global limits and backpressure                    | New challenge rejected                          |
| Third-party Retraction                       | Author and exact target digest validation                          | Rejected                                        |
| Retraction erases history                    | Append-only status projection                                      | History retained                                |
| Missing/mutable referenced content           | Bound resolver, size/media/digest verification                     | `unavailable` or digest mismatch                |
| Bare or substituted causal reference         | Closed reference kind/type plus exact ID and digest                | Relationship unavailable or rejected            |
| Divergent wire/local ID material             | Shared pure Mesh-to-local normalizer and cross-package vectors     | Record rejected                                 |
| TOCTOU after content verification            | Immutable version/digest binding                                   | Later bytes require new resolution              |
| Forged content-resolution result             | Claim/reference/resolver/time-bound resolution record              | Resolution rejected                             |
| Resolver rotation destroys history           | Historical-time binding validation; current-binding Fusion check   | Old record retained but ineffective             |
| Stale or substituted local dependency        | Typed immutable binding lineage and exact digest lookup            | Evaluation unavailable                          |
| Evidence cycle or laundering                 | Bounded graph walk, cycle/root-basis checks                        | Cyclic records ineffective                      |
| Remote Trust feedback loop                   | Remote observations excluded from V1 Fusion and explicitly labeled | Observation audit-only                          |
| Replay refreshes score                       | Admission time retained on duplicate                               | Weight unchanged                                |
| Stale positive profile                       | Freshness, decay and uncertainty requirements                      | Eligibility unavailable/restricted              |
| Uncertainty treated as negative fact         | Separate unavailable and quarantine criteria                       | No negative score/quarantine from absence alone |
| Quarantine from one malicious report         | Supported violated Claim plus group/weight/score thresholds        | No activation                                   |
| Cross-tenant quarantine                      | Exact quarantine key and identity checks                           | Scope mismatch rejected                         |
| Automatic recovery by time                   | Review-required state and explicit review                          | Restriction remains                             |
| Self/same-group recovery                     | Post-activation groups disjoint from activation groups             | Recovery rejected                               |
| Snapshot score forgery                       | Protector verification plus projection rederivation                | Restore rejected                                |
| Snapshot omits contradiction                 | Protector, input-set digest and decision rederivation              | Restore rejected                                |
| Coherently recomputed forged snapshot        | Cryptographic protector over snapshot/state/generation tuple       | Integrity verification fails                    |
| Authentic snapshot rollback                  | Exact external durable generation/digest/time anchor               | Restore rejected                                |
| Fabricated verified-Mesh origin              | Envelope proof plus linked historical ingress/verifier bindings    | Restore rejected                                |
| Policy downgrade/rebind                      | Exact policy lineage/digest and dependency binding                 | Evaluation unavailable; restore rejected        |
| Cross-policy profile/head collision          | Policy digest in profile and quarantine keys                       | Exact-key miss or rejection                     |
| Capacity eviction of security state          | Separate ceilings and backpressure                                 | New input rejected                              |
| Profile becomes admission/lease/grant        | Type/package separation and explicit negative-only adapters        | No authority transition exists                  |
| Policy-oracle diagnostics                    | Coarse public codes, redaction and bounded cardinality             | Sensitive reason stays local                    |

## Source compromise

An admitted source with a valid key can create validly signed false Evidence.
The protocol cannot distinguish that condition cryptographically. Controls are:

- local allowlisting and role restriction;
- criterion-specific source-to-subject authority and typed basis rules;
- independent dependency-group thresholds;
- exact causal references to immutable historical Work state where applicable;
- supported contradiction and negative criteria;
- uncertainty and profile freshness;
- scoped quarantine after policy-qualified negative Evidence;
- key revocation for new ingress;
- append-only attribution for historical investigation.

Revocation does not retroactively rewrite signed history. Whether a historical
record remains eligible is an explicit local policy decision bound to the
evaluation time and key-state assumptions.

## Identity multiplication and collusion

The system never equates a distinct `peerId` with an independent source.
Effective sources must map to a local dependency group. Group weight and group
count, not identity count, drive thresholds.

All unclassified sources share zero effective weight. A deployment may assign
several peers to one group or exclude them entirely. The package does not infer
independence from network address, key, tenant metadata, model provider or
behavioral similarity.

If an attacker controls enough groups that local policy treats as independent,
Fusion may be deceived. This is a documented residual risk. Policies should use
conservative thresholds, narrow criteria, independent verification and human
review for high-impact restrictions.

## Contradiction and Evidence laundering

Derived or repeated statements can otherwise amplify one observation. V1
prevents this by:

- retaining root basis digests;
- requiring every basis to carry its exact ID and digest;
- counting one root basis once per profile;
- excluding cyclic relationships;
- capping each Claim-source dependency group across every root, Claim and
  identity in a dimension/criterion;
- excluding remote Trust observations from Fusion;
- never converting a contradicted Claim into an inverse Claim;
- exposing every excluded input in the input-set digest and decision record.

## Quarantine safety

Quarantine is a denial-capable feature and therefore receives stricter rules
than an informational profile:

- activation requires supported negative Evidence, not mere uncertainty;
- negative Evidence must satisfy local independence and weight thresholds;
- the key includes tenant, subject, scope, dimension and policy digest;
- state becomes review-required rather than auto-recovered on time;
- recovery requires new post-activation positive Evidence from mutually
  distinct groups disjoint from every activation group;
- every effective recovery Claim, supporting Attestation and content
  resolution must be accepted after activation;
- unresolved negative Evidence, Challenge or equivocation blocks recovery;
- quarantine cannot revoke identity, mutate history or cross scopes;
- applications must explicitly construct a restrict-mode adapter.

## Snapshot, restart and rollback

An attacker may submit a syntactically valid snapshot that omits negative
Evidence, changes policy, lowers uncertainty, advances recovery or rolls time
back. Recomputed hashes alone cannot stop a coherent rewrite. Strict restore
first verifies the exact cryptographic protector proof and compares generation,
snapshot digest and logical-time high-water with a trusted anchor stored outside
the blob. It also resolves every verified Mesh origin from authenticated
composite Mesh state. Only then does it recompute:

- every content-bound ID and digest;
- policy and binding lineage;
- Evidence relationships and effective status;
- content resolutions, invalidations and the historical resolver binding valid
  at each recorded time;
- Fusion input sets and decisions;
- profiles and uncertainty at snapshot logical time;
- quarantine activation and recovery chains;
- state and trace digests;
- encoded bytes and collection counts.

Any protector, anchor, origin-proof or recomputation mismatch rejects the entire
snapshot. Tests let the attacker recalculate all unkeyed digests after deleting
quarantine/contradiction, advancing effective time, inserting a normalized
`verified_mesh` Claim and selecting an older authentic generation; each fails
at the corresponding external boundary. The implementation does not merge a
partially valid snapshot with live authority.

## Inference and action integration safety

Trust integration cannot weaken Alpha 3:

- only already accepted controlled outcomes become Claim candidates;
- conversion uses digests and excludes raw sensitive content;
- candidate creation does not automatically admit Evidence;
- state-backed wrappers bind the exact Trust policy, profile resolver, subject
  mapping, eligibility template, current-source identity and base boundary
  configuration;
- raw state, structural clones, replaced snapshot generations, clock rewind and
  stale dependency heads are unavailable;
- the model gate captures a digest-bound model boundary and passes it the exact
  immutable per-invocation target that was evaluated;
- action/message wrappers revalidate synchronously immediately before their
  underlying dispatcher call;
- stale/unavailable state refuses delegation only in explicit restrict mode;
- existing Action Grant, current assessment, authority, idempotency and fencing
  checks still execute;
- a Trust Profile cannot mint a grant or promote Context;
- direct unwrapped calls remain possible and explicitly outside the boundary.

There is no claim of atomic cancellation or revocation after an external effect
has begun. A stronger guarantee requires a downstream transactional fence.

## Availability and resource exhaustion

Attackers may attempt to fill pending relationships, Challenges or Evidence
graphs, or trigger expensive repeated Fusion. Controls include:

- strict record and aggregate byte limits;
- per-family, pending, basis-reference and graph-depth limits;
- per-source and per-scope Challenge limits;
- maximum records considered per Fusion;
- bounded profile, decision, quarantine and diagnostic histories;
- checked integer arithmetic;
- deterministic ordering without unbounded backtracking;
- backpressure instead of eviction of live security state;
- coarse diagnostics without attacker-controlled payload echo.

Availability after a configured hard limit is not guaranteed. Safety requires
refusing additional input rather than silently forgetting records required by a
current decision.

## Privacy and telemetry

Normal telemetry may include:

- record, policy, decision and profile digests;
- coarse outcome and reason code;
- logical time and size bucket;
- counts of included/excluded records and dependency groups.

It must not include raw content, content references, prompts, output, action
arguments, message bodies, signatures, keys, dependency topology, credentials
or full snapshots. Public errors do not distinguish unknown from disallowed
sources when that distinction would expose policy.

## Deterministic security scenarios

The release suite must cover:

- malformed and one-over-limit input;
- duplicate and same-ID conflict;
- out-of-order target relationships;
- relationship-digest equivocation retained after Retraction;
- cross-scope and stale-authority replay;
- unrelated third-party Claim citing an otherwise valid Work checkpoint;
- revoked keys and compromised valid keys;
- zero-threshold policy and Claim-source Attestation policy variants;
- self-Attestation and identity multiplication;
- unresolved/irrelevant Challenge basis and same-group Challenge identities;
- opposite arrival orders for the same two group Challenges;
- same-group and cross-group collusion under documented thresholds;
- cycles and repeated root basis;
- 1,024 Claims and distinct roots from one dependency group under one aggregate
  dimension/criterion cap;
- missing and changed referenced content;
- forged, stale and invalidated content-resolution records;
- resolver rotation with historical-resolution restore and new current
  resolution;
- clock rollback, large time advance and replay freshness;
- contested Fusion and uncertainty;
- unresolved, sustained, contested and dismissed Challenge projections;
- exact-scope quarantine and failed cross-scope propagation;
- failed time-only/self-only recovery and successful new-evidence recovery;
- forged or truncated snapshots;
- coherent all-digest snapshot rewrite, authentic rollback and fabricated
  verified-Mesh origin;
- wrong origin-verifier kind/upstream link and missing verifier history;
- capacity pressure;
- partition, loss, duplicate, reorder and convergence;
- remote observation feedback attempts;
- bypass of optional wrappers without any new authority.

Each scenario has fixed version, seed, maximum events, queue bound, logical
time bound, configuration digest, fault-plan digest, trace digest and first
divergence output.

## Release blockers

The following are P0 release blockers:

- treating signed Evidence, profile score or remote observation as authority;
- missing content/scope/digest binding;
- missing Claim source-to-subject/basis authorization;
- identity-count-based independence;
- cross-tenant or cross-scope profile/quarantine effect;
- restoring a profile without complete Evidence and policy rederivation;
- automatic recovery by time, replay or self-Evidence;
- granting admission, lease, epoch, fence, permission or Action Grant from
  Trust state;
- silent wire downgrade or permissive generic Evidence payload;
- unbounded attacker-controlled storage or graph work before limits.

The following are P1 release blockers:

- ambiguous dimension or criterion semantics;
- missing uncertainty, freshness or decay;
- unexplained record inclusion/exclusion;
- challenge-driven negative score or global quarantine;
- recursive remote Trust observation weighting;
- diagnostics that leak Evidence or policy internals;
- missing legacy compatibility and direct-bypass tests;
- missing tarball or exact registry consumer coverage.

Alpha 4 cannot ship with an open P0 or P1 finding.
