# Evidence and Trust `0.3.0-alpha.4` implementation plan

Status: design frozen. The normative contracts at commit
`e08e43beecf913e6e0a650c29625371ea1a29a4b` completed independent
architecture, security and release-compatibility review with zero open P0, P1
or P2 findings. Production implementation begins only after the design PR is
merged.

## Objective

Alpha 4 adds a provider-neutral, local and deterministic evidence-processing
boundary to AgentPlat. It lets an application retain bounded claims, evaluate
independent attestations, derive explainable multidimensional Trust Profiles and
apply temporary scoped restrictions without treating a signature, a score or a
remote observation as truth or authority.

Release identity:

- coordinated package version: `0.3.0-alpha.4`;
- npm distribution tag: `next`;
- Git tag: `v0.3.0-alpha.4`;
- new package: `@agentplat/trust`;
- coordinated public package count: 30;
- Trust state, policy and snapshot schema version: `1`;
- Mesh wire version: `0`;
- compatibility baseline: `v0.3.0-alpha.3`.

The milestone is complete only after the reviewed commit is installed from
packed tarballs and from the public registry, its adversarial scenarios are
reproducible, all 30 package artifacts are integrity-verified, and every item
in the Alpha 4 acceptance checklist is closed.

## Product boundary

Alpha 4 provides:

- immutable, content-bound Claim, Attestation, Challenge and Retraction records;
- explicit local source admission and dependency-group policy;
- deterministic evidence fusion with integer-only arithmetic;
- local capability-scoped Trust Profiles with independent dimensions;
- uncertainty, freshness and linear step decay driven by trusted logical time;
- contradiction and equivocation handling without rewriting history;
- scoped quarantine, review and evidence-backed recovery;
- redacted, non-restorable decision and audit projections;
- an authenticated Mesh evidence ingress exposed only through an explicit
  subpath;
- opt-in Mesh eligibility and Inference Control bindings that can restrict but
  never create authority;
- deterministic adversarial scenarios for replay, reorder, partition, source
  compromise, identity multiplication, dependency concentration and collusion.

Alpha 4 does not provide:

- global truth, global reputation or a universal score;
- identity enrollment, admission, key distribution or key revocation;
- proof that two peers are organizationally or operationally independent;
- automatic capability authority, work assignment, lease renewal or recovery;
- an Action Grant, fencing token, permission or authorization bypass;
- automatic promotion of untrusted content into a trusted context zone;
- durable multi-process evidence storage or a distributed transaction log;
- network discovery, remote content fetching or payload confidentiality;
- tolerance of a colluding majority across dependency groups configured as
  independent;
- exactly-once delivery or external effects;
- self-healing from quarantine based only on time, self-claims or a restored
  score;
- a claim that model-produced assessments are facts;
- changes to existing Runtime, Model, Sessions, Rooms, Framework, Mesh root or
  Inference Control root defaults.

## Design principles

1. **Evidence is not truth.** A signature proves key possession and record
   integrity. It does not prove correctness, independence or quality.
2. **Profiles are local projections.** Different peers may produce different
   profiles from different policies and accepted evidence without a protocol
   violation.
3. **Trust never grants authority.** Trust may restrict an explicitly bound
   operation. It cannot admit a peer, create a lease, advance an epoch, issue a
   grant or bypass a downstream fence.
4. **Every decision is reproducible.** State, normalized input, trusted logical
   time and frozen policy determine the next state and ordered effects.
5. **Every contribution is explainable.** A Fusion Decision names its exact
   policy digest, input-set digest, effective records, excluded records,
   dependency groups, integer weights and reason codes.
6. **Dependency diversity is configured, not inferred.** Counting identities
   is never used as evidence of independence.
7. **Uncertainty is first-class.** Missing, stale, challenged, unresolved or
   concentrated evidence cannot silently become a positive decision.
8. **History is append-only.** Retractions, challenges, profile updates,
   quarantine and recovery append records; they do not edit prior evidence.
9. **Restriction is scoped.** A profile or quarantine is bound to one tenant,
   subject, capability or other exact scope. There is no implicit global ban.
10. **Defaults remain inert.** Importing a package performs no I/O, migration,
    registration, telemetry or enforcement.

## Public package architecture

### `@agentplat/trust`

The new package is the browser-safe, provider-neutral core. Its root depends
only on `@agentplat/core` at runtime and exports:

- closed V1 contracts and stable reason codes;
- strict JSON validation and canonicalization;
- domain-separated SHA-256 digests;
- Trust policies and immutable policy heads;
- Evidence Trust state, reducer, snapshot and strict restore;
- deterministic fusion, profile, eligibility, quarantine and recovery
  evaluation;
- redacted support projections.

The package performs no signing, key lookup, network access, wall-clock reads,
randomness, persistence or external dispatch.

Its root and pure `./mesh-records` normalizer are declared browser-safe. The
`@agentplat/mesh/trust` and `@agentplat/inference-control/trust` integration
subpaths are server-only in Alpha 4 and are exercised by Node tarball smoke
tests. A future release may add browser declarations only after an explicit
dependency-closure review.

### `@agentplat/mesh-protocol`

The existing protocol package implements the previously reserved closed wire
payloads:

- `evidence.claim`;
- `evidence.attest`;
- `evidence.challenge`;
- `evidence.retract`;
- `trust.observation`.

Each receives strict payload validation, canonical fixtures and the existing
wire-v0 signing rules. Unknown fields fail. A generic JSON or extension
fallback is prohibited.

The protocol package uses the pure browser-safe
`@agentplat/trust/mesh-records` normalizers for content-bound record IDs. It does
not duplicate the digest material or import the state/Fusion engine.

### `@agentplat/mesh/trust`

This new explicit subpath composes the existing Mesh crypto, admission,
Objective/Work, allocation and replay boundaries with `@agentplat/trust`. It
exports:

- the authenticated evidence inbound processor;
- the separate composite runtime state used by that processor;
- pure conversion from verified Mesh evidence payloads to local records;
- a local peer/capability eligibility filter;
- a redacted Trust observation encoder.

Existing Mesh root, loopback and coordination entrypoints do not begin handling
evidence messages. A caller must construct the Alpha 4 processor explicitly.

### `@agentplat/inference-control/trust`

This new explicit subpath integrates current Trust state with Alpha 3 without
changing `InferenceControlPolicyV1`, `ControlScopeV1`, Action Grants or existing
gateways. It exports:

- deterministic conversion of accepted controlled outcomes into local claim
  candidates;
- exact Trust evidence references for assessor requests;
- synchronous, construction-bound eligibility resolvers;
- restrictive model, action-dispatcher and message-dispatcher wrappers.

The wrappers include their Trust policy, profile and resolver binding digests
in the dependency binding. They revalidate immediately before delegating to the
wrapped boundary. The resulting claim is point-in-time local restriction, not
an atomic transaction with mutable remote state.

### Existing observability packages

`@agentplat/audit` and `@agentplat/events` may consume redacted effects. They
are not the Evidence ledger and cannot restore authoritative Trust state.
Framework does not re-export Trust in Alpha 4.

The runtime dependency graph is acyclic:

```text
@agentplat/trust -> @agentplat/core
@agentplat/mesh-protocol -> @agentplat/trust/mesh-records
@agentplat/mesh -> @agentplat/mesh-protocol + @agentplat/mesh-crypto + @agentplat/trust
@agentplat/inference-control -> @agentplat/trust
```

Mesh and Inference Control import Trust only from their new integration source
files. Their existing root entrypoints do not re-export or execute those files.

## Vocabulary

| Term                 | Normative meaning                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| Claim                | An immutable statement by one source about one subject, criterion and outcome.                                  |
| Attestation          | An immutable independent evaluation that supports, contradicts or cannot resolve one exact Claim.               |
| Challenge            | An immutable request to contest one exact Claim or Attestation using bounded basis references.                  |
| Retraction           | An append-only withdrawal by the original author of one Claim or Attestation.                                   |
| Evidence Record      | One accepted Claim, Attestation, Challenge or Retraction plus its local admission metadata.                     |
| Source Binding       | Local policy mapping a source to allowed roles, a dependency group and weight caps.                             |
| Dependency Group     | A locally configured shared-failure or shared-control group used to cap correlated contributions.               |
| Fusion Decision      | A deterministic local evaluation of one Claim from its active attestations, challenges and policy.              |
| Trust Profile        | A local subject-and-scope projection containing independent dimension scores and uncertainty.                   |
| Eligibility Decision | A local result that reports whether explicit dimension requirements are met.                                    |
| Quarantine           | A scoped local restriction activated by policy-qualified negative evidence.                                     |
| Recovery             | An explicit append-only transition that lifts one quarantine after new independent evidence satisfies policy.   |
| Trust Observation    | A redacted statement about a local profile decision; it grants no authority and is not recursively fused in V1. |

Public documentation must avoid language implying global consensus, global
truth, universal safety or automatically trustworthy agents.

## Canonical data model

All public Trust records use strict JSON values:

- plain objects only;
- no unknown keys;
- no symbol keys, accessors or custom prototypes;
- no sparse arrays, cycles, `undefined`, `bigint`, functions or non-finite
  numbers;
- strings must be well-formed Unicode;
- integers must be safe integers;
- arrays with set semantics must already be unique and sorted by Unicode code
  unit order;
- object keys are canonicalized by Unicode code unit order;
- sizes are measured from canonical UTF-8 bytes before cloning or mutation.

Canonicalization is compatible in behavior with the Alpha 3 strict JSON
boundary but is implemented and domain-separated in the Trust package. Importing
Inference Control is not required by the root package.

Digest input is:

```text
UTF8("agentplat.trust/" + domain + "/v1\0") || canonical_json_bytes
```

Closed V1 digest domains are:

```text
scope
subject
claim
claim-relation
attestation
attestation-relation
challenge
challenge-relation
challenge-resolution
retraction
retraction-relation
assertion
root-basis
content-resolution
content-resolution-invalidation
policy
source-binding
fusion-input
fusion-decision
profile-key
profile
eligibility-request
eligibility-decision
quarantine-key
quarantine-evidence-set
quarantine-record
recovery-evidence-set
recovery-decision
dependency-binding
origin-proof
state
snapshot
snapshot-integrity
trace
observation
```

A Trust domain digest is lowercase 64-character SHA-256 hexadecimal. It is
invalid in a different domain even if the JSON bytes happen to match. Existing
foreign-contract digests retained inside a typed reference keep their
contract's canonical representation and are never accepted as a Trust domain
digest.

### Closed reason codes

Every reducer result, Fusion exclusion and eligibility/quarantine decision uses
only the following stable V1 reason-code union:

```text
accepted
duplicate
pending_target
invalid_json
structural_limit_exceeded
state_capacity_exceeded
invalid_record
invalid_identifier
invalid_digest
digest_mismatch
unsupported_schema
scope_mismatch
subject_mismatch
relationship_conflict
relationship_target_missing
evidence_cycle
evidence_depth_exceeded
evidence_unavailable
evidence_stale
content_unavailable
content_digest_mismatch
content_resolution_stale
claim_subject_authority_invalid
challenge_authority_invalid
challenge_basis_unavailable
source_not_effective
source_role_invalid
dependency_binding_missing
dependency_binding_invalid
dependency_group_conflict
dependency_group_cap_exhausted
support_threshold_missing
contradiction_threshold_met
fusion_contested
root_basis_conflict
challenge_unresolved
challenge_dismissed
challenge_sustained
challenge_contested
policy_missing
policy_mismatch
policy_lineage_invalid
profile_unavailable
profile_stale
eligibility_restricted
quarantine_activated
quarantine_review_required
quarantine_recovery_unavailable
quarantine_recovery_insufficient
quarantine_recovered
logical_time_rollback
state_conflict
snapshot_invalid
snapshot_integrity_invalid
snapshot_rollback
origin_proof_invalid
remote_observation_unverified
```

Unknown reason strings are invalid on restore. Public protocol adapters map
these internal reasons to their existing coarse rejection classes and never
echo attacker-controlled text or reveal source/dependency topology.

### Content-bound record identifiers

Evidence IDs bind exact content:

```text
claim:<claim digest>
attestation:<attestation digest>
challenge:<challenge digest>
retraction:<retraction digest>
observation:<observation digest>
content-resolution:<content-resolution digest>
content-resolution-invalidation:<content-resolution-invalidation digest>
```

The digest document excludes only the identifier being derived. A supplied ID
that differs from the recomputed value is rejected. Exact duplicate ID and
content is idempotent.

Each family also carries a derived relationship digest:

- Claim: source, subject, scope, criterion and root-basis digest;
- Attestation: source plus exact Claim ID and digest;
- Challenge: source plus exact target kind, ID and digest;
- Retraction: source plus exact target kind, ID and digest.

Reuse of one relationship digest with conflicting record content is permanent
bounded equivocation for V1. Every conflicting variant remains attributable and
ineffective; retracting one variant does not erase the equivocation or make
another variant effective. A new observation requires a distinct typed root
basis and therefore a distinct Claim relationship.

### Canonical Mesh-to-local normalization

There is one shared pure normalization path, exported from the browser-safe
`@agentplat/trust/mesh-records` subpath. Its signed-envelope material is exactly:

```text
schemaVersion: 1
tenantId
meshId
objectiveId: string | null
senderPeerId
causationId: string | null
```

For each family,
`normalizeMeshEvidence*V1(envelopeMaterial, wirePayload)` injects
`schemaVersion: 1`, `sourceId: senderPeerId`, `sourceKind: "peer"` and an
expanded scope derived only from signed envelope fields plus the closed wire
scope. It never reads mutable Mesh state. Absence is represented by explicit
`null`, not omission.

The normalizer derives assertion, root-basis and relationship digests, then the
record ID and record digest using the same root contracts used for local
records. `@agentplat/mesh-protocol` calls this helper and requires the supplied
wire ID to equal the derived local ID. Current or historical authority is
checked later by `@agentplat/mesh/trust`; it cannot change normalization bytes.

Message ID, audience, sequence, timestamps, instance ID and signature do not
enter the semantic Evidence record digest. Tenant, Mesh, Objective, source peer
and causation do. Cross-package fixtures prove that wire normalization, root
validation and snapshot restore preserve the same IDs and digests for every
family.

Every root record therefore carries `causationId: string | null`. Mesh
normalization injects the signed envelope value. A local constructor must
provide explicit `null` or a locally meaningful immutable causal ID; omission
is invalid. Mutation of causation changes the record digest and, under the same
relationship digest, creates permanent equivocation rather than aliasing.

## Scopes and subjects

`EvidenceScopeV1` is a closed tagged union.

### Standalone scope

```text
schemaVersion: 1
kind: "standalone"
tenantId
namespace
scopeId
```

### Mesh scope

```text
schemaVersion: 1
kind: "mesh"
tenantId
meshId
```

### Objective scope

```text
schemaVersion: 1
kind: "objective"
tenantId
meshId
objectiveId
objectiveRevision
```

### Work scope

```text
schemaVersion: 1
kind: "work"
tenantId
meshId
objectiveId
objectiveRevision
workItemId
workItemRevision
assignmentEpoch
assignmentAuthorityId
fencingToken
```

### Controlled-run scope

```text
schemaVersion: 1
kind: "controlled_run"
tenantId
runId
agentId
controlPolicyId
controlPolicyVersion
coordinatedScopeDigest: digest | null
```

The Mesh adapter validates every Mesh field against accepted local state. The
root Trust package validates only the closed shape and digest; it never claims
that caller-supplied coordination state is authentic.

`TrustSubjectV1` is one of:

```text
{ schemaVersion: 1, kind: "peer", peerId }
{
  schemaVersion: 1,
  kind: "peer_capability",
  peerId,
  capabilityKey,
  capabilityVersion,
  capabilityRevision
}
```

A Trust Profile key is exactly
`digest(profile-key, { tenantId, scopeDigest, subjectDigest, policyDigest })`.
A Quarantine key is exactly
`digest(quarantine-key, { tenantId, scopeDigest, subjectDigest, dimensionId,
policyDigest })`. A peer-level profile does not substitute for a capability
profile, a policy cannot overwrite another policy's head, and a profile from one
scope cannot be reused in another.

## Evidence references

Every causal or basis reference is a closed `EvidenceReferenceV1`:

```text
schemaVersion: 1
kind: "evidence" | "mesh_record" | "control_record" | "external"
referenceType
referenceId
referenceDigest
```

`referenceDigest` has one exact grammar selected by `kind`:

- `evidence`: the referenced local record's lowercase 64-character Trust
  record digest;
- `mesh_record`: the existing Mesh envelope payload hash,
  `sha256:<43-character canonical base64url>`;
- `control_record`: the existing Inference Control digest,
  `sha256:<64 lowercase hexadecimal characters>`;
- `external`: lowercase 64-character SHA-256 hexadecimal over the immutable
  referenced bytes.

The validator does not normalize one encoding into another. Kind, type, ID and
the exact canonical digest string all enter the relationship and root-basis
preimages, so a digest from one contract cannot be substituted into another.

References are sorted by `(kind, referenceType, referenceId, referenceDigest)`
using Unicode code-unit order and are unique by that complete tuple. An ID
without its exact digest is not a causal reference. The receiving boundary
resolves `mesh_record` and `control_record` references from accepted local
state. An `external` reference is usable only through the construction-bound
content resolver. An unresolved or mismatched reference cannot contribute.

Only `evidence` references are traversed when checking cycles. The terminal
roots are the sorted unique `mesh_record`, `control_record` and `external`
references reached by that bounded traversal. `rootBasisDigest` is the
`root-basis` domain digest of that exact terminal-reference array. Empty roots,
cycles, missing records or depth overflow make the Claim ineffective. The same
root basis can contribute at most once to one dimension evaluation.

## Evidence content

Every Claim contains a public criterion and outcome, plus a digest of the
underlying assertion. Optional `EvidenceContentV1` uses exactly one of:

```text
{ kind: "inline_summary", mediaType, summary, contentDigest, encodedBytes }
{
  kind: "reference",
  mediaType,
  reference: EvidenceReferenceV1,
  contentDigest,
  encodedBytes
}
```

An inline summary is bounded descriptive data, not an instruction. Its
`encodedBytes` must equal the UTF-8 byte length of `summary`, and
`contentDigest` must equal lowercase SHA-256 of those exact bytes. A reference
is opaque and is never fetched by the reducer. Its `encodedBytes` is the exact
expected resolved byte count, not an estimate. An application content resolver
must construction-bind authorization, immutable version, maximum bytes, media
type, exact byte count and digest verification. Unavailable or mismatched
required content produces `content_unavailable` or `content_digest_mismatch`;
it cannot contribute positively.

A content `reference` must have kind `mesh_record`, `control_record` or
`external`; an `evidence` reference cannot stand in for content bytes. In a
content-resolution record, `referenceId` and `referenceDigest` equal
`claim.content.reference.referenceId` and
`claim.content.reference.referenceDigest` byte-for-byte. `scopeDigest`, media
type, expected byte count and content digest likewise equal the exact Claim
descriptor. No derivation from an opaque string or encoding conversion is
permitted.

`assertionDigest` is not an opaque sender-selected digest. It is the `assertion`
domain digest of the canonical object containing subject, scope, criterion ID,
outcome, content digest or `null`, and the sorted exact basis references. Every
validator recomputes it.

## Claim contract

`EvidenceClaimV1` contains exactly:

```text
schemaVersion: 1
claimId
claimRelationDigest
rootBasisDigest
sourceId
sourceKind: "local" | "peer"
causationId: string | null
subject: TrustSubjectV1
scope: EvidenceScopeV1
criterionId
outcome: "satisfied" | "violated" | "inconclusive"
assertionDigest
content: EvidenceContentV1 | null
basisReferences: sorted unique EvidenceReferenceV1[]
observedAt: RFC 3339 string | null
```

`observedAt` is sender Evidence only. A work-derived Mesh Claim must carry one
`mesh_record` reference whose `referenceType` is `work.result` or
`work.checkpoint`; `referenceId` is the accepted envelope message ID,
`referenceDigest` is its payload hash, and the Claim envelope `causationId`
equals that message ID.

Ingress resolves the immutable historical execution record and verifies the
same Objective, Work revision, assignment epoch, authority, fence, assignee and
subject relation. It does not require that authority to remain the current
head when delayed Evidence arrives. This preserves deterministic causal
admission after completion, release or reassignment. Local policy may later
exclude old Evidence by age.

`effectiveAtLogicalMs` is the trusted local acceptance time of the producing
result/checkpoint for work-derived Claims and the Claim admission time for other
Claims. Freshness and decay use this retained effective time, never `observedAt`
or a delayed delivery time that could rejuvenate the underlying event.

### Claim authority rules

Every criterion contains one closed `ClaimAuthorityRuleV1`:

```text
allowedSourceRelations: sorted subset of
  subject_self | work_assignee | work_owner | objective_observer |
  recovery_witness | local_system
allowedBasisReferences: sorted {
  kind,
  referenceType,
  minimumCount,
  maximumCount
}[]
```

The generic source role `claim` is necessary but insufficient. Before Trust
mutation, `authorizeClaimV1` binds source, subject, criterion, expanded scope,
resolved bases, accepted capability/Objective/Work history and policy.

The default peer and peer-capability relation is `subject_self`, requiring
`sourceId === subject.peerId`; a capability subject additionally requires its
exact accepted owner, key, version and revision. A third-party work-derived
Claim is valid only when its criterion explicitly allows the sender's accepted
historical role and the resolved execution record binds the permitted subject.
An unrelated admitted peer cannot make a Claim effective merely by citing a
valid checkpoint. Failure returns `claim_subject_authority_invalid` before
state mutation.

## Attestation contract

`EvidenceAttestationV1` contains exactly:

```text
schemaVersion: 1
attestationId
attestationRelationDigest
sourceId
sourceKind: "local" | "peer"
causationId: string | null
scope: EvidenceScopeV1
claimId
claimDigest
disposition: "support" | "contradict" | "inconclusive"
confidenceBasisPoints: integer 0..10000
basisReferences: sorted unique EvidenceReferenceV1[]
observedAt: RFC 3339 string | null
```

It targets one exact Claim and exact digest. Self-attestation may be retained
but is ineffective unless a local criterion rule explicitly permits it; even
then it cannot satisfy independent dependency-group requirements.

One source may have one active Attestation per Claim. A second exact duplicate
is idempotent. Conflicting dispositions from the same source are permanent V1
equivocation for that relationship and all variants remain ineffective even if
one is later retracted.

## Challenge contract

`EvidenceChallengeV1` contains exactly:

```text
schemaVersion: 1
challengeId
challengeRelationDigest
sourceId
sourceKind: "local" | "peer"
causationId: string | null
scope: EvidenceScopeV1
targetKind: "claim" | "attestation"
targetId
targetDigest
reasonCode
basisReferences: sorted unique non-empty EvidenceReferenceV1[]
observedAt: RFC 3339 string | null
```

A Challenge becomes active only when it targets an inspectable exact record in
the same scope. If the target has not arrived, the authenticated record remains
bounded pending. It does not create a negative Trust contribution or quarantine
by itself. While an authorized Challenge remains unresolved, the exact target
is unavailable for positive fusion and increases uncertainty. Resolution is
derived from later independent evidence under policy; no record is rewritten.

Every criterion also contains one closed `ChallengeAuthorityRuleV1`:

```text
allowedSourceRelations: sorted subset of
  target_author | subject_self | work_assignee | work_owner |
  objective_observer | recovery_witness | local_system
allowedBasisReferences: sorted {
  kind,
  referenceType,
  minimumCount,
  maximumCount
}[]
requireResolvedBasis: true
```

The generic source role `challenge` is necessary but insufficient. Before a
Challenge can block a target, `authorizeChallengeV1` resolves the exact target,
its subject and criterion, the challenger's historical accepted relation and
every typed basis. Evidence, Mesh and Control bases must resolve to immutable
same-scope local records; external content must pass the exact scope-bound
resolver. Every basis kind/type and count must satisfy the criterion rule. An
unresolved, mismatched, unrelated or unauthorized Challenge is `unavailable`
and never changes target qualification.

For the causal cutoff, an `evidence` basis uses its retained
`effectiveAtLogicalMs`; a Mesh or Control record uses the trusted effective time
of that accepted immutable record; and an external basis uses its verified
content resolution's `resolvedAtLogicalMs`. Sender timestamps never participate.
Missing or invalidated time-bearing resolution makes the Challenge unavailable.

All valid Challenges for
`(targetKind, targetId, targetDigest, challengerDependencyGroupId)` form one
derived group Challenge. Every record remains attributable, but the group
counts as exactly one blocker and one uncertainty input. For each Challenge,
`basisCutoffLogicalMs` is the maximum trusted effective time of its resolved
basis records or content resolutions. The group cutoff is the minimum of those
per-Challenge cutoffs, breaking no tie by arrival metadata. Adding another
identity to the group therefore cannot move the cutoff forward, restart the
resolution window or create another blocker. Projection is recomputed from the
sorted Challenge ID/digest set, so reorder converges. Per-source/scope and
pending quotas apply before adding any record to state.

### Deterministic Challenge resolution

Challenge resolution is a derived projection, not a new wire message. Each
criterion declares exactly:

```text
challengeResolution:
  minimumCorroboratingGroups
  minimumCorroboratingWeightBasisPoints
  minimumOpposingGroups
  minimumOpposingWeightBasisPoints
```

`ChallengeResolutionV1` is group-scoped and contains exactly:

```text
schemaVersion: 1
challengeResolutionId
challenges: sorted unique {
  challengeId,
  challengeDigest,
  basisCutoffLogicalMs
}[]
targetId
targetDigest
challengerDependencyGroupId
basisCutoffLogicalMs
policyDigest
evaluatedAtLogicalMs
result: "unresolved" | "dismissed" | "sustained" | "contested"
corroboratingGroupIds
corroboratingWeightBasisPoints
opposingGroupIds
opposingWeightBasisPoints
consideredAttestationIds
reasonCodes
```

Challenge tuples are sorted by `(challengeId, challengeDigest)` in Unicode
code-unit order; each tuple's cutoff is recomputed from its exact bases and the
top-level cutoff must equal their minimum. The ID is
`challenge-resolution:<digest>` where the digest uses the
`challenge-resolution` domain over all remaining fields. Resolution uses only
active Attestations accepted strictly after `basisCutoffLogicalMs`, with exact
Claim ID/digest and scope. It excludes the challenged Attestation, the
challenger dependency group, the target author's dependency group,
self-Attestation, unavailable content and every otherwise ineffective record.
Weights and group allocation use the exact Stage 3 source/group caps and order.

For a Claim target, support is corroborating and contradiction is opposing. For
an Attestation target, sibling Attestations on the same Claim are corroborating
when their disposition equals the target's `support` or `contradict`
disposition, and opposing when it is the opposite disposition. An
`inconclusive` Attestation has no corroborating or opposing disposition and
therefore cannot be dismissed by sibling votes.

The result is determined in this order:

1. a target retracted, conflicted or independently unavailable for a reason
   other than the Challenge is `sustained`;
2. meeting both corroborating and opposing group-and-weight thresholds is
   `contested`;
3. meeting only the opposing thresholds is `sustained`;
4. meeting only the corroborating thresholds is `dismissed`;
5. otherwise it is `unresolved`.

A target contributes only when every active group Challenge against it is
`dismissed` and it passes all other qualification checks. `unresolved`,
`sustained` and `contested` keep only that target unavailable and increase
contested uncertainty once per target, not once per record or group. A dismissed
group Challenge grants no weight. Challenge basis references authorize,
establish the causal cutoff and explain the contest but never act as votes.
Every evaluation recomputes grouped resolution from retained Evidence at the
supplied logical time, so no arrival order or mutable status rewrite determines
the outcome.

When active Challenges target Evidence used as another Challenge's basis, V1
uses a well-founded alternating projection over the complete structurally valid
Challenge set. The lower fixed point contains definitely active Challenges; a
Challenge left only in the upper set by an odd or mutually recursive blocker
cycle is `unavailable` with `challenge_basis_unavailable`. This permits an
acyclic dependent Challenge to become active again when its blocker is itself
defeated, while cycles never select a winner by arrival or digest order.
The blocker closure follows explicit `evidence` basis edges. A direct
Attestation-to-Claim target relationship remains inspectable when only the
Claim is challenged; it is attribution, not an implicit basis edge. The
Attestation still cannot qualify that challenged Claim for Fusion.

## Retraction contract

`EvidenceRetractionV1` contains exactly:

```text
schemaVersion: 1
retractionId
retractionRelationDigest
sourceId
sourceKind: "local" | "peer"
causationId: string | null
scope: EvidenceScopeV1
targetKind: "claim" | "attestation"
targetId
targetDigest
reasonCode
observedAt: RFC 3339 string | null
```

Only the original author may activate a Retraction of its Claim or Attestation.
If the target has not arrived, the authenticated source and exact target binding
remain bounded pending until authorship and scope can be resolved. Retraction is
append-only, does not delete the target, does not erase a Challenge and cannot
restore authority. Retraction removes the target only from future effective
fusion.

Retraction authorization uses the historical target author plus the live
signature/admission checks for the Retraction message. Expiry of the author's
current Fusion source weight or `claim`/`attest` role does not prevent that
author from retracting its own retained record; it still cannot retract another
author's record.

## Local admission metadata

Accepted records are wrapped in `EvidenceRecordStateV1`:

```text
schemaVersion: 1
recordKind
recordId
recordDigest
record
origin: "local" | "verified_mesh"
originBindingDigest
originVerifierBindingDigest: digest | null
originProofDigest: digest | null
acceptedAtLogicalMs
effectiveAtLogicalMs
status: "active" | "pending" | "retracted" | "challenged" |
        "conflicted" | "unavailable"
```

`originBindingDigest` binds the local producer or authenticated Mesh inbound
processor configuration. For `verified_mesh` it always names one historical
`mesh_ingress` dependency binding. `originVerifierBindingDigest` and
`originProofDigest` are null for local origin and mandatory for `verified_mesh`.
The verifier digest names one historical `verified_mesh_origin_verifier`
binding whose `upstreamBindingDigest` equals `originBindingDigest`; the proof
digest identifies the exact retained signed envelope and authenticated Mesh
journal entry. Direct use of the root reducer is an application trust boundary
and cannot manufacture a `verified_mesh` origin.

The composite Mesh boundary retains a closed `MeshEvidenceOriginProofV1` with
the exact envelope message ID and payload hash, SHA-256 digest of the complete
canonical signed-envelope bytes, sender/key IDs, admission-state digest,
sorted coordination-authority digests, replay-state digest, normalized record
ID and normalized record digest. `originProofDigest` is the `origin-proof`
domain digest of that descriptor. The Trust snapshot retains only this digest;
the authenticated composite Mesh snapshot or journal retains the descriptor and
signed envelope bytes needed for network-free restore verification.

Record `status: "challenged"` means that at least one authorized active
Challenge relationship exists; it is not a policy-independent resolution. Each
Fusion evaluation still derives dismissed, sustained, contested or unresolved
under its exact policy before deciding target availability.

References may arrive out of order. A bounded `pending` record does not
contribute until every required target is present and valid. New records trigger
deterministic resolution in record-digest order. Cycles, self-reference and
chains deeper than policy limits become `evidence_cycle` or
`evidence_depth_exceeded` and never contribute.

For authenticated Mesh ingress, a structurally valid Attestation, Challenge or
Retraction whose target is absent is accepted only into the pending index after
crypto, admission, envelope scope and replay checks. Sender, scope, target ID
and target digest are preserved exactly. Checks that require the target—same
scope, original authorship and relationship validity—are deferred. Target
arrival deterministically changes the pending record to active, conflicted or
unavailable; no pending record participates in Fusion, quarantine or recovery.
If its trusted pending age reaches `maximumPendingAgeMs`, logical-time advance
changes it permanently to `unavailable` in record-digest order and removes it
from the pending index. The immutable record, ID and replay/idempotency evidence
remain retained; later target arrival does not reactivate it in V1.

### Content resolution state

An external resolver runs outside the pure reducer. The reducer accepts the
closed inputs `content_resolution_recorded` and
`content_resolution_invalidated`. A recorded `EvidenceContentResolutionV1`
contains exactly:

```text
schemaVersion: 1
resolutionId
resolutionDigest
claimId
claimDigest
scopeDigest
referenceId
referenceDigest
contentDigest
mediaType
encodedBytes
result: "verified" | "unavailable" | "mismatched"
resolverBindingDigest
resolvedAtLogicalMs
```

`resolutionDigest` is computed with `resolutionId` and `resolutionDigest`
omitted, and `resolutionId` is exactly
`content-resolution:<resolutionDigest>`. Invalidation names
the exact resolution and is one closed
`EvidenceContentResolutionInvalidationV1`:

```text
schemaVersion: 1
invalidationId
resolutionId
resolutionDigest
resolverBindingDigest
invalidatedAtLogicalMs
reasonCode
```

`invalidationId` is exactly
`content-resolution-invalidation:<content-resolution-invalidation digest>`,
computed with `invalidationId` omitted. An
invalidation appends state and never deletes the earlier result. Neither input
carries raw bytes. `resolvedAtLogicalMs` and `invalidatedAtLogicalMs` must equal
the corresponding reducer transition's trusted logical time; senders and
resolvers cannot supply a different effective time.

The reducer accepts a positive resolution only when every field matches the
immutable Claim content descriptor and the resolver binding was current at
`resolvedAtLogicalMs`. Binding history is append-only. Restore validates each
historical resolution against the exact binding version that existed and was
valid at its recorded time; it does not require that old binding to remain the
head. Current Fusion additionally requires a non-invalidated positive
resolution under the current effective resolver binding. A later resolver or
content version therefore requires a new resolution input, while the older
resolution remains historically valid and ineffective. A failed or stale
resolution cannot reuse an earlier positive result. Direct root use treats the
resolver as an explicit local application trust boundary; Mesh input cannot
select or rebind it.

## Fusion policy

`EvidenceFusionPolicyV1` is local, closed, versioned and immutable. It contains:

```text
schemaVersion: 1
policyId
policyVersion
parentPolicyDigest: digest | null
mode: "observe" | "restrict"
dimensions: TrustDimensionPolicyV1[]
criteria: EvidenceCriterionPolicyV1[]
sourceBindings: EvidenceSourceBindingV1[]
dependencyGroups: DependencyGroupPolicyV1[]
eligibilityRules: TrustEligibilityRuleV1[]
quarantinePolicy: QuarantinePolicyV1
recoveryPolicy: RecoveryPolicyV1
limits: EvidenceTrustLimitsV1
diagnosticsPolicyId
redactionPolicyId
```

Policies are registered only through a local API. No wire message can install,
modify or select a Fusion policy. Policy versions increase by exactly one and
bind the immediately preceding digest. Historical decisions remain bound to
their original policy. A policy head affects only later evaluations.

`TrustEligibilityRuleV1` is one closed, named request template and contains
exactly:

```text
ruleId
maximumProfileAgeMs
requirements: sorted unique {
  dimensionId,
  minimumScoreBasisPoints,
  maximumUncertaintyBasisPoints
}[]
```

The requirement set is non-empty, every dimension is declared by the same
policy, and `maximumProfileAgeMs` is positive and within the state ceiling.
Rule IDs are unique within a policy. An eligibility request is policy-valid
only when its `maximumProfileAgeMs` and complete requirement set exactly equal
one registered rule; callers cannot omit a requirement or relax a threshold.
The request remains self-contained and does not select a rule by an untrusted
name.

### Dimension policy

Each dimension declares:

```text
dimensionId
priorScoreBasisPoints
priorWeightBasisPoints
minimumUncertaintyBasisPoints
coverageTargetBasisPoints
decayIntervalMs
decayBasisPointsPerInterval
uncertaintyGrowthBasisPointsPerInterval
minimumRetainedWeightBasisPoints
contradictionUncertaintyBasisPointsPerClaim
maximumContradictionUncertaintyBasisPoints
degradedScoreAtOrBelowBasisPoints
degradedUncertaintyAtOrAboveBasisPoints
```

There is no overall score. The initial public examples use `integrity`,
`competence`, `reliability` and `policy_compliance`, but dimension IDs are local
policy tokens and are never assigned universal meaning by the package.

### Criterion policy

Each criterion maps one Claim outcome to one dimension:

```text
criterionId
dimensionId
satisfiedValueBasisPoints
violatedValueBasisPoints
inconclusiveValueBasisPoints: integer | null
baseWeightBasisPoints
maximumClaimWeightBasisPoints
maximumSourceGroupContributionWeightBasisPoints
minimumSupportGroups
minimumSupportWeightBasisPoints
minimumContradictionGroups
minimumContradictionWeightBasisPoints
allowClaimSourceAttestation
contentRequired
quarantineEligible
recoveryEligible
maximumAgeMs
claimAuthority: ClaimAuthorityRuleV1
challengeAuthority: ChallengeAuthorityRuleV1
challengeResolution: ChallengeResolutionPolicyV1
```

The package does not execute formulas, scripts or remote policy expressions.
`allowClaimSourceAttestation` defaults to `false` in every public policy helper;
an application must set it explicitly per criterion to retain the capped but
non-independent weight described in Stage 3.

### Source and dependency-group policy

A source binding declares:

```text
sourceId
sourceKind
dependencyGroupId
roles: sorted subset of claim | attest | challenge | observe
maximumWeightBasisPoints
validFromLogicalMs
validUntilLogicalMs
```

Unknown sources may be retained for audit but are `record_only` and have zero
effective weight. Every effective source must map to one configured dependency
group. `DependencyGroupPolicyV1` contains exactly:

```text
dependencyGroupId
maximumAttestationWeightPerClaimBasisPoints
maximumProfileWeightPerDimensionCriterionBasisPoints
```

The first cap applies while qualifying one Claim. The second is an aggregate
cap across all roots, Claims, source IDs and identities in the same dimension
and criterion. The effective profile cap is the smaller of the group and
criterion caps. Multiple identities or roots cannot increase it.

All basis-point policy values are integers from 0 through 10,000. Prior weight,
coverage target and decay interval are strictly positive. Minimums cannot
exceed matching maximums. Logical validity ranges are increasing, maximum age
and review windows are positive and within state ceilings, and every checked
product must remain a safe integer. Policy validation rejects an invalid
denominator or arithmetic range before registration.

Every V1 criterion requires `minimumSupportGroups`,
`minimumSupportWeightBasisPoints`, `minimumContradictionGroups` and
`minimumContradictionWeightBasisPoints` to be at least one. All four Challenge
corroborating/opposing group and weight thresholds are likewise at least one.
There is no policy encoding in which an unattested Claim becomes `supported` or
an uncorroborated Challenge becomes automatically dismissed.

Every dimension requires
`contradictionUncertaintyBasisPointsPerClaim >= 1` and
`maximumContradictionUncertaintyBasisPoints >=
contradictionUncertaintyBasisPointsPerClaim`, so a contested Claim, root conflict
or unavailable challenged target always raises uncertainty by a positive,
policy-bounded amount.

Source binding is not peer admission. Mesh ingress first requires the existing
signature, key, admission, audience, replay and authority checks.

### Integration dependency bindings

Every resolver or restrictive adapter used by Trust is registered locally as
one immutable `EvidenceTrustDependencyBindingV1`:

```text
schemaVersion: 1
bindingName
bindingVersion
parentBindingDigest: digest | null
bindingKind: "content_resolver" | "mesh_ingress" |
             "mesh_eligibility" | "profile_resolver" |
             "snapshot_protector" | "verified_mesh_origin_verifier" |
             "model_boundary" | "action_dispatcher" |
             "message_dispatcher"
implementationId
implementationDigest
configurationDigest
policyDigest: digest | null
subjectMappingDigest: digest | null
upstreamBindingDigest: digest | null
validFromLogicalMs
validUntilLogicalMs: number | null
bindingDigest
```

`bindingDigest` is recomputed in the `dependency-binding` domain with that
field omitted. Heads are keyed by `(bindingKind, bindingName)`; versions advance
by exactly one and name the preceding digest. Registration is local-only and
contains no secret or executable policy. Content resolutions require the exact
current `content_resolver` digest. Mesh ingress and restrictive wrappers bind
their exact applicable kind plus upstream component. A missing, expired,
rebound or cross-policy binding makes the requested evaluation or delegation
`unavailable`; it never falls back to an unbound dependency.

Content, Mesh-ingress, eligibility, profile and restrictive-wrapper bindings
require the exact non-null applicable policy digest. State-level
`snapshot_protector` and `verified_mesh_origin_verifier` bindings require null;
their integrity material binds the complete state or record origin instead.

## Deterministic fusion algorithm

Fusion uses integer arithmetic only and applies these ordered stages.

### Stage 1: select exact scope and policy

1. Resolve one policy by exact ID, version and digest.
2. Reject logical time below the state's high-water mark.
3. Select one exact subject and scope digest.
4. Reject a missing, expired or invalid dependency binding.
5. Select Claims for configured criteria only.

### Stage 2: provisionally qualify each Claim

A Claim is unavailable when it is pending, retracted, conflicted, challenged,
outside scope, over maximum age, content-required but unresolved, from an
ineffective source, or causally invalid. Unavailable Claims remain explainable
but cannot contribute. A challenged target is provisional until Stage 3 derives
every active Challenge resolution; only an all-dismissed result can restore its
otherwise valid qualification.

### Stage 3: qualify Attestations

For each Claim:

1. select active Attestations naming the exact ID and digest;
2. exclude cross-scope, retracted, challenged, conflicted, stale,
   unknown-source or causally invalid records;
3. treat equal `(sourceKind, sourceId)` on Attestation and Claim as a
   Claim-source Attestation: exclude it unless `allowClaimSourceAttestation` is
   true; when enabled, its weight remains capped but its dependency group never
   counts toward either minimum distinct-group threshold;
4. map each source to its configured dependency group;
5. compute source weight as
   `floor(sourceMaximumWeight * confidence / 10000)`;
6. determine the group disposition before allocating its cap: any positive
   contradiction weight makes the group `contradict`; otherwise any positive
   support weight makes it `support`; otherwise it is `inconclusive`;
7. when support and contradiction coexist, exclude the support records with
   `dependency_group_conflict` and retain only contradiction candidates;
8. allocate
   `maximumAttestationWeightPerClaimBasisPoints` across candidates matching the
   group disposition in accepted-time-descending, digest-ascending order;
9. each record receives `min(recordWeight, remainingGroupCap)` and later records
   receive zero after cap exhaustion;
10. an inconclusive group contributes no support or contradiction weight.

Group processing is ordered by dependency-group ID. Records inside a group are
ordered by accepted logical time descending and then record digest ascending.
The cap consumes records in that order.

After candidate weights are known, derive every active Challenge resolution by
the closed algorithm above. Group projections are evaluated by
`(targetKind, targetId, targetDigest, challengerDependencyGroupId)` in Unicode
code-unit order and included in the Fusion Decision. The algorithm may inspect
an otherwise qualified challenged target solely to decide whether every group
Challenge is dismissed; that provisional inspection cannot itself produce
score, quarantine or recovery weight.

### Stage 4: classify the Claim

- `supported` requires both the minimum distinct support groups and minimum
  support weight;
- `contradicted` requires both the minimum distinct contradiction groups and
  minimum contradiction weight;
- if both thresholds are met, the result is `contested`;
- otherwise the result is `inconclusive`;
- missing required content or relationships produces `unavailable` rather
  than `inconclusive`.

Only `supported` Claims produce profile contributions. A contradicted Claim is
not inverted into a new fact. Negative profile evidence is a separately
supported Claim whose criterion outcome is `violated`.

### Stage 5: apply freshness and decay

For one supported Claim:

```text
intervals = floor((logicalTimeMs - effectiveAtLogicalMs) / decayIntervalMs)
retention = max(minimumRetainedWeight,
                10000 - intervals * decayBasisPointsPerInterval)
rawWeight = min(maximumClaimWeight, supportWeight, baseWeight)
effectiveWeight = floor(rawWeight * retention / 10000)
```

If subtraction or multiplication would exceed safe-integer bounds, evaluation
fails closed. Sender timestamps never affect this calculation. Replay and
delayed Claim delivery cannot refresh the retained effective time.

### Stage 6: cap repeated and correlated contributions

First group candidates by `(dimensionId, rootBasisDigest)`. If all supported
Claims in one root group map to the same Claim value, retain exactly one: highest
effective weight, then newest `effectiveAtLogicalMs`, then lowest Claim digest.
If values differ, exclude every Claim in that root group as
`root_basis_conflict` and count one contested input for uncertainty. Thus the
same root basis cannot be counted twice.

Next group retained candidates by
`(dimensionId, criterionId, claimSourceDependencyGroupId)`. The aggregate cap is
the smaller of the criterion's
`maximumSourceGroupContributionWeightBasisPoints` and the dependency group's
`maximumProfileWeightPerDimensionCriterionBasisPoints`. Allocate it across all
roots, Claims, source IDs and identities in newest-effective-time then
Claim-digest order. Each candidate receives the smaller of its effective weight
and the remaining cap. Cap exhaustion is recorded per excluded remainder.

The Claim source dependency group, not the number of supporting Attestation
groups, defines contribution diversity across Claims. Attestation groups qualify
one Claim; they do not manufacture multiple independent negative or recovery
Claim sources.

### Stage 7: derive each dimension independently

For one dimension:

```text
denominator = priorWeight + sum(effectiveWeight)
score = floor((priorScore * priorWeight +
               sum(claimValue * effectiveWeight)) / denominator)
coverage = min(10000,
               floor(sum(effectiveWeight) * 10000 / coverageTarget))
contributionAgeUncertainty =
  min(10000,
      intervals * uncertaintyGrowthBasisPointsPerInterval)
ageUncertainty = max(contributionAgeUncertainty), or 0 with no contributions
contestedCount = number of contested Claims plus root-basis conflicts plus
                 unavailable challenged targets
contradictionPressure =
  min(maximumContradictionUncertainty,
      contestedCount * contradictionUncertaintyBasisPointsPerClaim)
uncertainty = max(minimumUncertainty,
                  10000 - coverage,
                  ageUncertainty,
                  contradictionPressure)
```

Zero denominator is invalid policy. Every multiplication is checked before use.
Scores and uncertainty are integers from 0 through 10,000. `priorScore` and
`priorWeight` always come from the exact policy, never from the preceding
profile. Every evaluation recomputes dimensions from retained qualified
Evidence at the supplied logical time.

### Stage 8: emit one Fusion Decision

`EvidenceFusionDecisionV1` contains exactly:

```text
schemaVersion: 1
fusionDecisionId
fusionDecisionDigest
tenantId
subject
subjectDigest
scope
scopeDigest
policyId
policyVersion
policyDigest
evaluatedAtLogicalMs
inputSetDigest
consideredRecordIds
includedRecordIds
recordExclusions
claimClassifications
challengeResolutions
groupAllocations
dimensions: sorted TrustDimensionStateV1[]
previousProfileDigest: digest | null
reasonCodes
```

The digest is computed in the `fusion-decision` domain with both ID and digest
omitted; the ID is `fusion-decision:<fusionDecisionDigest>`. Every ID/code array
is sorted unique. The nested arrays are closed:

- a record exclusion contains record kind, ID, digest and sorted reason codes;
- a Claim classification contains Claim ID/digest, criterion/dimension,
  classification, nullable mapped value, support/contradiction group IDs and
  weights, raw/retained/effective weights, Claim-source dependency group and
  reason codes;
- a group allocation contains stage (`attestation`, `challenge_resolution` or
  `profile`), nullable dimension/criterion/Claim IDs, dependency-group ID,
  sorted candidate record IDs, cap and allocated weight;
- Challenge resolutions use the exact closed contract above.

The input-set digest covers every considered record, including excluded and
unavailable records, so a decision cannot hide contradictory input. Its exact
`fusion-input` preimage is subject digest, scope digest, policy digest,
evaluation logical time, sorted `(recordKind, recordId, recordDigest, status)`
tuples extended with origin/verifier/proof binding digests, accepted logical
time and effective logical time, sorted content-resolution/
invalidation ID-digest-time tuples and the sorted source/integration
dependency-binding digests consulted by the evaluation.

## Trust Profiles

`TrustProfileV1` contains exactly:

```text
schemaVersion: 1
profileId
profileDigest
revision
previousProfileId: string | null
previousProfileDigest: digest | null
tenantId
subject
subjectDigest
scope
scopeDigest
policyId
policyVersion
policyDigest
dimensions: sorted TrustDimensionStateV1[]
fusionDecisionId
fusionDecisionDigest
inputSetDigest
updatedAtLogicalMs
status: "unknown" | "supported" | "contested" | "degraded"
```

`profileDigest` is computed in the `profile` domain with ID/digest omitted, and
`profileId` is `profile:<profileDigest>`. `TrustDimensionStateV1` contains
exactly:

```text
dimensionId
scoreBasisPoints
uncertaintyBasisPoints
effectiveWeightBasisPoints
coverageBasisPoints
ageUncertaintyBasisPoints
contradictionPressureBasisPoints
includedClaimIds
excludedClaimIds
claimSourceDependencyGroupIds
latestQualifyingEffectiveAtLogicalMs: number | null
```

Arrays are sorted unique. Each dimension therefore carries its own score,
uncertainty, weight, evidence IDs/groups and latest qualifying evidence time.
Profiles are immutable projections; revision starts at one, advances by one and
binds the prior exact ID/digest. Reevaluation appends a new head and retains
bounded decision history.

Profiles never appear in `AuthContext`, Mesh admission state, lease state,
Action Grants or Context Zone promotion records.

Profile status is derived with this exact priority:

1. `contested` when any dimension has a positive contradiction pressure;
2. `unknown` when every dimension has zero post-prior Evidence weight;
3. `degraded` when any dimension score is at or below its policy degraded-score
   boundary or uncertainty is at or above its degraded-uncertainty boundary;
4. `supported` otherwise.

The previous profile digest supplies append-only lineage only. It is not an
input to score, weight or uncertainty.

## Eligibility

An explicit caller evaluates this closed `TrustEligibilityRequestV1` against an
exact profile and policy binding:

```text
schemaVersion: 1
tenantId
subject
subjectDigest
scope
scopeDigest
policyId
policyVersion
policyDigest
profileId
profileDigest
maximumProfileAgeMs
requirements: sorted unique {
  dimensionId,
  minimumScoreBasisPoints,
  maximumUncertaintyBasisPoints
}[]
```

The request digest is computed in the `eligibility-request` domain. Every score
and uncertainty threshold is an integer from 0 through 10,000 and every policy
dimension required by the request must exist exactly once. The result is one
closed `TrustEligibilityDecisionV1`:

```text
schemaVersion: 1
eligibilityDecisionId
requestDigest
subjectDigest
scopeDigest
policyDigest
profileId
profileDigest
quarantineRecordIds
evaluatedAtLogicalMs
disposition: "eligible" | "restricted" | "quarantined" | "unavailable"
requirementResults
reasonCodes
```

`requirementResults` repeats each sorted requested dimension with observed
score, uncertainty and `met: boolean`; it contains no dimensions the request
did not name. `eligibilityDecisionId` is the
`eligibility-decision:<digest>` content-bound ID. Quarantine IDs and reason
codes are sorted unique. The possible dispositions are:

```text
eligible
restricted
quarantined
unavailable
```

`unavailable` covers missing profile, stale policy, excessive uncertainty,
missing dimension, stale profile, binding mismatch or unresolved state. It is
not silently treated as eligible.

Lookup uses the exact profile key containing `policyDigest`; it never selects a
"latest" profile by subject/scope alone. Quarantine lookup likewise requires
the exact policy-bound quarantine key.

In `observe` mode, the result includes the disposition that enforcement would
apply but produces no restrictive adapter effect. In `restrict` mode, only a
constructed integration adapter may use `restricted`, `quarantined` or
`unavailable` to refuse delegation. Neither mode can create authority.

## Contradiction, equivocation and challenges

- A supported `violated` Claim is negative evidence under its criterion.
- A contradicted Claim is excluded; it does not automatically become a
  supported inverse Claim.
- Simultaneous support and contradiction thresholds produce `contested` and
  raise uncertainty.
- Conflicting content under one logical author/relationship produces
  `equivocation`; all conflicting records are excluded.
- A Challenge makes only its exact target unavailable for positive fusion.
- A Challenge alone does not lower another subject's score or activate
  quarantine.
- Retraction stops future contribution but preserves Claim, Attestation,
  Challenge and decision history.

## Quarantine

`QuarantinePolicyV1` contains exactly:

```text
enabled
rules: sorted unique {
  dimensionId,
  activationScoreAtOrBelowBasisPoints,
  minimumNegativeClaimSourceGroups,
  minimumNegativeWeightBasisPoints,
  reviewIntervalMs
}[]
maximumActiveRecords
```

`RecoveryPolicyV1` contains exactly:

```text
rules: sorted unique {
  dimensionId,
  recoveryScoreAtOrAboveBasisPoints,
  maximumRecoveryUncertaintyBasisPoints,
  minimumRecoveryClaimSourceGroups,
  minimumRecoveryWeightBasisPoints,
  maximumRecoveryEvidenceAgeMs
}[]
```

Every rule names a declared dimension exactly once. Score, uncertainty and
weight fields are integer basis points; counts are positive safe integers;
time windows are positive and within V1 ceilings. Peer quarantine is disabled
in the reference policy until an application opts in explicitly.

Activation requires:

1. a current profile under the exact policy;
2. at least one supported `violated` Claim from a quarantine-eligible
   criterion;
3. minimum configured independent Claim-source dependency groups and negative
   weight after Stage 6 aggregate caps;
4. the dimension score at or below its activation threshold;
5. no policy, scope, subject or dependency binding mismatch.

`QuarantineRecordV1` contains:

```text
schemaVersion: 1
quarantineId
quarantineKey
revision
previousRecordId: string | null
tenantId
subjectDigest
scopeDigest
dimensionId
policyDigest
fusionDecisionId
activationEvidenceIds
activationEvidenceSetDigest
activationDependencyGroupIds
reasonCodes
activatedAtLogicalMs
reviewAfterLogicalMs
status: "active" | "review_required" | "recovered"
recoveredAtLogicalMs: number | null
recoveryDecisionId: string | null
```

`activationDependencyGroupIds` are the sorted unique Claim-source groups of the
included supported `violated` Claims; supporting Attestation groups cannot
inflate this diversity count. `activationEvidenceIds` contains the sorted exact
Claim, effective supporting Attestation and required content-resolution IDs
used by activation. `activationEvidenceSetDigest` binds their sorted
`(kind, id, digest)` tuples in the `quarantine-evidence-set` domain.
`quarantineId` is `quarantine-record:<digest>` over every other record field.
Revision 1 has a null predecessor; every later revision increments by one and
binds the exact prior record ID.

Quarantine is local to the exact subject, dimension and scope. Reaching
`reviewAfterLogicalMs` changes `active` to `review_required`; it does not lift
the restriction. Other tenants, scopes, capabilities and dimensions are not
affected.

## Recovery

Recovery is evaluated only by an explicit review input after the review time.
It requires all of:

- new supported positive Claims accepted after quarantine activation;
- only recovery-eligible criteria;
- minimum independent post-activation Claim-source dependency groups;
- every recovery Claim-source dependency group is disjoint from
  `activationDependencyGroupIds`;
- each recovery Claim and effective supporting Attestation has
  `acceptedAtLogicalMs > activatedAtLogicalMs`, and each required content
  resolution has `resolvedAtLogicalMs > activatedAtLogicalMs`;
- minimum recovery weight;
- dimension score at or above the recovery threshold;
- uncertainty at or below the recovery maximum;
- no unresolved qualifying negative Claim, challenge or equivocation in the
  recovery window;
- exact current policy and dependency bindings.

Source-group disjunction is evaluated against the exact policy/source bindings
named by the quarantine. If those bindings cannot be revalidated, recovery is
`unavailable`. New identities assigned to an activation group remain
non-independent.

Self-claims, replayed pre-quarantine records, partially overlapping groups,
remote Trust observations and the passage of time cannot satisfy recovery.
Success appends a `recovered` revision; it never deletes the quarantine or
negative evidence.

A recovered head is not permanently immune to later evidence. New qualifying
negative Evidence accepted strictly after `recoveredAtLogicalMs` may append the
next `active` revision for the same exact quarantine key. Historical or replayed
activation Evidence cannot reactivate it. Each key retains at most
`maximumQuarantineRevisionsPerHead` revisions; exhaustion fails closed as
`unavailable` and never silently leaves a new negative condition eligible.

Every review emits one closed `QuarantineRecoveryDecisionV1`:

```text
schemaVersion: 1
recoveryDecisionId
recoveryDecisionDigest
quarantineId
quarantineKey
policyDigest
fusionDecisionId
evaluatedAtLogicalMs
recoveryEvidenceIds
recoveryEvidenceSetDigest
recoveryClaimSourceDependencyGroupIds
effectiveRecoveryWeightBasisPoints
scoreBasisPoints
uncertaintyBasisPoints
disposition: "unavailable" | "insufficient" | "recovered"
reasonCodes
```

Evidence and group IDs are sorted unique.
`recoveryEvidenceSetDigest` binds sorted `(kind, id, digest)` tuples in the
`recovery-evidence-set` domain. The decision digest omits its ID/digest and uses
the `recovery-decision` domain; its ID is
`recovery-decision:<recoveryDecisionDigest>`. Only a `recovered` decision can be
named by a recovered Quarantine revision.

## Trust observations

`TrustObservationV1` is a redacted, bounded projection containing the observer,
subject/scope digests, policy digest, profile/fusion digests, dimension result,
logical observation time, expiry and reason codes. It contains no raw evidence,
content reference, secret, prompt, action input or private policy detail.

The Mesh `trust.observation` payload carries this projection under a signature.
The receiver may retain it opaquely as `remote_unverified` under per-source and
global limits even when referenced Evidence is absent. It becomes
`locally_correlated` only when evidence IDs, policy, profile and Fusion digests
all equal locally inspectable records. Neither label makes it a local decision.
V1 never uses a remote Trust observation as a Fusion contribution, source
weight, admission signal or recovery input. This prevents recursive reputation
feedback.

Observation bands use fixed V1 boundaries: score `low` is 0–3,333, `medium` is
3,334–6,666 and `high` is 6,667–10,000; `unknown` is used only when no effective
score exists. Uncertainty uses `low`, `medium` and `high` at the same boundaries.
These bands are presentation metadata, not a receiving policy threshold.

## State and reducer

`EvidenceTrustStateV1` contains:

- immutable `stateId`, identity and limits;
- logical-time high-water mark;
- immutable policies and policy heads;
- source bindings plus complete bounded integration-dependency binding history
  and heads;
- accepted Evidence records;
- append-only content resolutions and invalidations;
- bounded pending relationship records;
- Fusion Decisions and profile heads;
- quarantine histories and heads;
- stable diagnostics;
- trace digest and encoded-byte count.

The reducer contract is:

```text
state + normalized input + trusted logical time
  -> next frozen state + ordered frozen effects
```

Inputs are closed unions for policy registration, Evidence admission, content
resolution recording/invalidation, logical time advance, profile evaluation,
eligibility evaluation and quarantine review. Evaluation never reads a host
clock or performs I/O. The caller owns ID material only where the ID is
content-derived and revalidated.

The trace digest hashes the previous trace digest plus a canonical redacted
transition containing input kind, record/decision digests, logical time,
outcome and reason codes. Raw evidence content is excluded.

## Limits

`EvidenceTrustLimitsV1` is frozen into state. V1 reference defaults are also
hard release-test ceilings unless a lower application value is supplied.

| Limit                               |    Default |
| ----------------------------------- | ---------: |
| policies                            |         16 |
| dimensions per policy               |         16 |
| criteria per policy                 |         64 |
| source bindings per policy          |        256 |
| dependency groups per policy        |         64 |
| Claims                              |      4,096 |
| Attestations                        |     16,384 |
| Challenges                          |      4,096 |
| Challenges per source/scope         |         64 |
| pending Challenges per source/scope |         16 |
| Retractions                         |      4,096 |
| content resolutions                 |      4,096 |
| content invalidations               |      4,096 |
| dependency-binding versions         |        256 |
| pending records                     |      1,024 |
| maximum pending age                 |   24 hours |
| basis references per record         |         32 |
| relationship depth                  |         16 |
| considered records per fusion       |      1,024 |
| retained Fusion Decisions           |      4,096 |
| profile heads                       |      2,048 |
| profile revisions per head          |         32 |
| quarantine heads                    |      2,048 |
| quarantine revisions per head       |         32 |
| diagnostics                         |      1,024 |
| record canonical bytes              |     65,536 |
| content reference bytes             |      4,096 |
| inline summary bytes                |      4,096 |
| state canonical bytes               | 67,108,864 |
| maximum evidence age                |    30 days |
| maximum review interval             |     7 days |

The corresponding closed limit fields include
`maximumChallengesPerSourceScope`,
`maximumPendingChallengesPerSourceScope`, `maximumPendingAgeMs` and
`maximumQuarantineRevisionsPerHead`; the table uses readable labels only.
Active and pending per-source/scope counts are checked before global capacity
mutation, so one source/scope cannot consume the entire pending-Challenge
budget while capacity remains for others.

The implementation checks aggregate bytes, nesting depth, object nodes and
array items before cloning or state mutation. Capacity exhaustion returns
backpressure or a stable rejection. It never evicts replay, retraction,
equivocation, quarantine or idempotency state required for a live decision.

## Snapshot and restore

State and trace digests detect inconsistency; they are not authentication and
cannot by themselves prevent replacement with an older or coherently forged
snapshot. A restorable snapshot therefore requires both a construction-bound
cryptographic protector and a trusted rollback anchor stored outside the
snapshot blob.

`EvidenceTrustSnapshotV1` contains exactly:

```text
schemaVersion: 1
snapshotId
snapshotDigest
stateId
generation
previousSnapshotDigest: digest | null
createdAtLogicalMs
stateDigest
state: EvidenceTrustStateV1
integrityProof: {
  protectorBindingDigest,
  algorithmId,
  keyId,
  encoding: "base64url",
  proof
}
```

`snapshotDigest` is the `snapshot` domain digest of every field above except
`snapshotId`, `snapshotDigest` and `integrityProof`; `snapshotId` is exactly
`snapshot:<snapshotDigest>`. Generation starts at one, advances by exactly one
and binds the preceding committed snapshot digest. The protector signs or MACs
the canonical `snapshot-integrity` domain bytes of exactly
`{stateId, generation, previousSnapshotDigest, createdAtLogicalMs,
snapshotDigest, stateDigest}`. Algorithm, key and proof lengths are bounded by
local protector policy; no secret enters the snapshot.

`EvidenceTrustSnapshotProtectorV1` is a synchronous construction dependency
with an exact `bindingDigest`, `protect(materialBytes)` and
`verify(materialBytes, integrityProof)` contract. The package ships the
interface and deterministic fixtures, not a universal key store. The root
remains browser-safe because it performs no key discovery or I/O.

The separately trusted `EvidenceTrustRollbackAnchorV1` contains exactly:

```text
schemaVersion: 1
stateId
requiredGeneration
requiredSnapshotDigest
minimumLogicalHighWaterMs
protectorBindingDigest
```

It is supplied as trusted construction state, never read from the candidate
snapshot. The application commits the protected snapshot and updated anchor as
one durable operation or through an authenticated append-only journal. Restore
requires exact state, generation, snapshot and protector equality plus a state
logical-time high-water at or above the anchor. An older authentic snapshot and
an unanchored newer blob both fail.

For every `verified_mesh` record, strict restore also requires a
construction-bound `VerifiedMeshEvidenceOriginVerifierRegistryV1`. It resolves
the exact historical verifier named by `originVerifierBindingDigest`, validates
that binding's `upstreamBindingDigest === originBindingDigest`, and then resolves
`originProofDigest` only from the retained authenticated composite Mesh snapshot
or append-only Mesh journal. The selected verifier revalidates the original
signed envelope, historical key/admission/coordination authority and shared
normalizer output, and proves exact record ID/digest equality. It does no
network access. A standalone normalized record is insufficient proof of
verified Mesh origin.

Strict restore:

1. validates closed JSON and aggregate limits;
2. rejects unknown schema versions;
3. compares the external anchor and protector binding, then verifies the
   cryptographic integrity proof before trusting embedded state;
4. recomputes snapshot, state and every content-bound/domain digest;
5. rejects generation, predecessor or logical-time rollback against the
   external anchor;
6. validates policy lineage and every historical dependency binding;
7. validates every content resolution/invalidation against the resolver binding
   effective at its recorded logical time;
8. validates historical ingress/verifier binding kind and upstream linkage,
   then revalidates every verified Mesh origin from its exact external proof;
9. rebuilds relationship, pending, profile and quarantine indexes;
10. replays deterministic projection from retained Evidence and compares every
    serialized Fusion Decision and profile head;
11. validates logical-time high-water, trace digest and encoded-byte count;
12. rejects missing records, forged scores, removed contradictions, clock
    rollback, stale bindings and incomplete quarantine history.

A redacted projection is explicitly `restorable: false`. Restore has no network
fallback and never repairs missing authority by synthesis. Missing/invalid
protector, anchor or verified-origin proof returns a typed restore failure;
restrict-mode integrations treat the absent restored state as `unavailable`,
never eligible.

## Mesh wire contracts

Wire payloads carry the canonical semantic record plus their content-bound ID.
The existing envelope supplies tenant, Mesh, sender, audience, sequence,
timestamps, payload hash, key ID and signature.

The protocol applies these additional rules:

- Evidence topic fanout is bounded by the sender's current local peer view;
- Claim sender equals the Claim source peer;
- work-derived Claim causation resolves one accepted immutable historical
  result/checkpoint envelope and matches its Objective, Work revision, epoch,
  authority, fence, assignee and allowed subject relation;
- Attestation, Challenge and Retraction with a present target require its exact
  locally accepted digest and same scope;
- an absent target creates only a bounded pending relationship; target arrival
  resolves exact scope and, for Retraction, original authorship before the
  record can become active;
- Trust observation sender equals observer and direct audience is the default;
- envelope TTL remains at most five minutes for these families;
- record eligibility age remains a separate local-policy concept;
- older nodes explicitly reject the newly implemented discriminants; there is
  no downgrade or generic-extension fallback.

Protocol fixtures include one canonical fixture per family plus malformed,
unknown-field, wrong-ID, cross-scope and boundary-size vectors.

## Authenticated Mesh ingress

`createMeshEvidenceInboundProcessorV1` construction-binds:

- key resolver and crypto policy;
- protocol limits and supported critical extensions;
- local peer identity;
- admission and source-binding policy;
- accepted Objective/Work/allocation projections;
- shared non-evictable replay/message-ID state;
- Trust policy and Trust state identity.

Processing order is:

1. strict wire parse and structural limits;
2. tenant, Mesh, audience, Objective and freshness checks;
3. payload hash, key status and signature verification;
4. peer admission and exact sender-role authorization;
5. shared sequence and message-ID replay checks;
6. Objective/Work revision, epoch, authority, fence and causal checks;
7. content-bound Evidence ID and local source-binding checks;
8. pure Trust transition;
9. atomic return of the composite immutable state.

Failure before step 8 cannot mutate Trust. Failure at step 8 cannot consume the
inbound replay transition unless the entire composite transition is returned.
The processor exposes coarse public rejection codes and keeps exact local
diagnostics redacted.

## Mesh eligibility integration

The Mesh Trust subpath exposes a pure filter over already computed capability
matches. It may return only candidates whose current exact capability profile
meets configured requirements and has no active quarantine. It cannot:

- add a candidate absent from the existing peer view;
- treat a capability advertisement as verified truth;
- alter bid, award, lease, epoch, recovery certificate or fencing validation;
- create a Work assignment;
- silently change default selection.

The filter is used only when the application supplies an explicit Trust policy
binding. `observe` returns the original candidates plus diagnostics. `restrict`
returns a subset or an `unavailable` result; it never selects a replacement on
its own.

## Inference Control integration

Controlled outcomes may become local Claim candidates only after Alpha 3 has
accepted the exact assessment or terminal gateway outcome. Conversion binds:

- assessment/request IDs and target digest;
- Control Scope digest;
- assessor and dependency binding digest;
- outcome reason codes;
- Trust criterion and subject mapping configured locally.

The converter does not copy prompt, output, action arguments or message body.
Applications decide whether to admit the candidate to Trust state.

Restrictive integration wraps existing Alpha 3 dependencies instead of adding
fields to its closed policy:

- a model boundary may synchronously check eligibility before starting a run;
- a Trust-bound action dispatcher checks the exact current profile immediately
  before delegating to its underlying dispatcher;
- a Trust-bound message dispatcher does the same before sending;
- the wrapper binding digest includes Trust policy, resolver, subject mapping
  and base dispatcher binding digests;
- `unavailable`, stale, mismatched or quarantined state refuses delegation in
  restrict mode;
- observe mode delegates and emits a redacted decision.

These checks do not replace Action Grant consumption, authority revalidation,
idempotency or downstream fencing. A concurrent Trust-state change after local
revalidation cannot be claimed as atomically enforced without a downstream
transaction contract.

## Observability and privacy

Effects expose IDs, digests, coarse size buckets, status and stable reason
codes. They exclude:

- inline content and external references;
- source-binding internals and dependency topology;
- raw score contributions when policy marks them private;
- prompts, outputs, tool arguments and message payloads;
- signatures, keys, credentials and snapshots.

Normal audit projections are non-restorable. Full snapshots and unredacted
Fusion Decisions follow application data retention, access and encryption
policy.

## Implementation increments

### Increment 0: design freeze

Deliver:

- this implementation plan;
- Alpha 4 acceptance checklist;
- Evidence and Trust threat model;
- glossary, release-plan and compatibility updates;
- architecture, security and release reviews with zero P0/P1.

Exit: no production source change, all normative contracts closed and all
review findings recorded.

### Increment 1: package and canonical foundation

Deliver:

- `@agentplat/trust` manifest, exports and README;
- strict JSON validator, canonicalizer and digest domains;
- scopes, subjects, limits and reason codes;
- empty immutable state, snapshot and strict restore;
- public type tests and exact/one-over limit tests.

Exit: importing root is side-effect free and packed root is browser-safe.

### Increment 2: Evidence lifecycle

Deliver:

- Claim, Attestation, Challenge and Retraction validation;
- content-bound IDs;
- admission reducer and ordered effects;
- append-only content resolution and invalidation inputs;
- duplicate, conflict, pending, retraction and challenge state;
- deterministic Challenge-resolution projections;
- bounded relationship resolution and cycle detection.

Exit: every Evidence record lifecycle is deterministic under duplicate,
reorder and restore.

### Increment 3: policy and Fusion Decisions

Deliver:

- policy registration and lineage;
- source/dependency-group bindings;
- typed immutable integration-dependency bindings;
- exact eight-stage fusion algorithm;
- full explainability and input-set digest;
- arithmetic overflow, cap and boundary tests.

Exit: dependency concentration and identity multiplication cannot exceed one
configured group cap.

### Increment 4: Profiles, decay and eligibility

Deliver:

- independent dimension projections;
- integer step decay and uncertainty growth;
- eligibility requests and decisions;
- profile history bounds and strict restore checks.

Exit: replay, clock rollback and stale profiles cannot improve eligibility.

### Increment 5: quarantine and recovery

Deliver:

- activation, review-required and recovery records;
- supported-negative-evidence activation;
- new-evidence-only recovery;
- exact scope isolation and recovery diagnostics.

Exit: time, self-claims or restored projections cannot lift quarantine.

### Increment 6: Mesh wire families

Deliver:

- all five protocol payload types;
- validation, canonicalization and fixtures;
- signing and verification tests;
- Alpha 1/2 fixture compatibility and legacy route rejection tests.

Exit: wire v0 remains explicit, bounded and without permissive fallback.

### Increment 7: authenticated Mesh boundary

Deliver:

- evidence inbound contracts, state and processor;
- exact sender/scope/role/causal checks;
- shared replay-security composition;
- Trust observation projection;
- eligibility filter in observe and restrict modes.

Exit: no direct payload or unverified envelope can enter as verified Mesh
evidence, and Trust cannot create coordination authority.

### Increment 8: Inference Control boundary

Deliver:

- accepted-outcome Claim conversion;
- Trust evidence references;
- model, action-dispatcher and message-dispatcher restrictive wrappers;
- exact dependency binding and final synchronous revalidation tests;
- bypass and stale-state documentation.

Exit: direct existing calls remain unchanged; opt-in wrappers fail closed and
cannot mint an Action Grant.

### Increment 9: adversarial scenarios and supportability

Deliver:

- deterministic scenario runner and versioned scenario catalog;
- redacted diagnostics and audit projections;
- packed consumer covering root, Mesh and Inference Control subpaths;
- usage examples and operational limitations.

Exit: every safety scenario reports seed, config digest, fault-plan digest,
trace digest and first divergence.

### Increment 10: coordinated release

Deliver:

- generalized Alpha 4 release-line sentinel;
- fixed Alpha 4 version in root and all 30 package manifests;
- catalog, lockfile, release guide and registry consumer updates;
- full gates, independent audits, dry-run, coordinated publication, integrity
  verification, `next` promotion, clean consumer, tag and evidence ledger.

Exit: the 30-package public release is reproducible and the acceptance
checklist has no open item.

## Adversarial scenario matrix

The deterministic suite includes at least:

1. supported Claim from independent dependency groups;
2. exact duplicate idempotency for every family;
3. conflicting content-bound relationship and equivocation;
4. relationship equivocation remains ineffective after Retraction;
5. Attestation, Challenge and Retraction arriving before target;
6. unrelated third-party Claim citing valid Work Evidence;
7. cross-tenant, Mesh, Objective, Work, revision, epoch and fence replay;
8. expired or revoked key at authenticated ingress;
9. compromised source followed by independent contradiction;
10. valid author Retraction versus third-party and cross-scope attempts;
11. multiple colluding identities in one dependency group;
12. 1,024 distinct Claims/roots from one group remain under one aggregate cap;
13. burst of unbound identities with zero effective weight;
14. self-attestation and cyclic evidence dependencies;
15. unresolved, dismissed, sustained and contested Challenge projections;
16. two same-group Challenges in opposite arrival orders produce identical
    grouped resolution, decision and profile digests;
17. decay, uncertainty growth and logical-clock rollback;
18. exact-policy and exact-scope quarantine isolation;
19. recovery with new disjoint-group Evidence versus replayed or partially
    overlapping Evidence;
20. missing, changed, unauthorized, forged or invalidated content resolution;
21. forged snapshot profile, removed contradiction and policy rebind mismatch;
22. capacity floods that cannot evict live security state;
23. partition, duplicate, delay and reorder convergence;
24. remote Trust observation recursion attempt;
25. direct Runtime, Mesh, provider, handler and dispatcher bypass remains
    outside the opt-in boundary without receiving authority;
26. legacy Alpha 1/2/3 scenario and fixture replay;
27. packed and registry-installed Trust flow.

Safety invariants are evaluated after every event. Liveness assertions are
separate and may be conditional on delivery, independent evidence and resource
availability.

## Compatibility and migration

- All existing package APIs retain their Alpha 3 shapes and defaults.
- Trust starts with its own state and snapshot schema `1`; it is not inserted
  into existing Mesh or Inference Control snapshots.
- Mesh wire version stays `0`; new payload discriminants are additive within
  the alpha protocol package and old nodes reject them explicitly.
- Alpha 4 reads all retained Alpha 1, 2 and 3 fixtures required by the public
  compatibility matrix.
- No import runs a migration. Future schema migration follows expand, migrate,
  validate, switch and later contract.
- Existing direct Runtime, Model, Tools, Streaming, Sessions, Rooms, Framework,
  Mesh and Inference Control behavior is byte-for-byte or semantically
  unchanged under existing tests.
- Framework does not enable or re-export Trust.
- Defaults remain `trust.enforcement: observe` and
  `peerQuarantine.enabled: false` until an application constructs an explicit
  adapter.

## Release engineering

The Alpha 3-specific release guard must be generalized into a versioned cohort
guard before adding the new manifest. It recognizes exactly two valid release
cohorts:

- historical Alpha 3: no `@agentplat/trust`, exactly 29 catalog entries and
  manifests, root and all manifests at `0.3.0-alpha.3`;
- Alpha 4: `@agentplat/trust` exactly once, exactly 30 catalog entries and
  manifests, root and all manifests at `0.3.0-alpha.4`.

It rejects every other state before build-output verification, pack, registry
read or publication. Alpha 4 additionally requires:

- `@agentplat/trust` present exactly once in the public catalog;
- exactly 30 catalog entries and 30 workspace manifests;
- root and every publishable package at `0.3.0-alpha.4`;
- manifest directories equal catalog directories in ASCII order;
- no transient publishable 29-package Alpha 4 or 30-package Alpha 3 state.

Unit fixtures cover both accepted historical/current cohorts plus 29/31 Alpha
4, 30 Alpha 3, missing/duplicate Trust, mixed versions, root mismatch and
catalog/manifests mismatch.

Release gates include:

- external terminology denylist and complete source/built/tarball audit;
- clean install, build and public type checks;
- all unit, adapter, compatibility and adversarial scenario tests;
- exact package catalog and browser dependency closure;
- isolated imports from every tarball;
- a functional Trust tarball consumer;
- a credential-free exact-version registry consumer;
- dry-run that records prior `next` targets without mutation;
- staging-tag publication and SHA-512 match for all 30 tarballs;
- atomic coordinated promotion or conditional rollback of `next`;
- staging-tag cleanup;
- annotated Git tag only after registry verification.

The new package may receive npm `latest` on first publication even when a
staging tag is requested. Documentation must preserve the coordinated `next`
installation instruction and record this registry behavior.

## Definition of done

Alpha 4 is done only when:

1. every Evidence family is strict, bounded, content-bound and append-only;
2. signatures and Trust observations are never described or used as truth;
3. Fusion is deterministic, integer-only, dependency-aware and explainable;
4. every Trust Profile is local, scoped and multidimensional;
5. uncertainty, decay, contradiction and equivocation are explicit;
6. quarantine is exact-scope and recovery requires new independent evidence;
7. Trust cannot create identity, admission, lease, epoch, fencing or Action
   Grant authority;
8. Mesh and Inference Control integration is explicit and defaults remain
   unchanged;
9. snapshots fail closed under omission, forgery, clock rollback and stale
   dependency bindings;
10. adversarial scenarios preserve every safety invariant;
11. legacy Alpha 1/2/3 fixtures, APIs, scenarios and consumers remain green;
12. all 30 public packages pass build, type, test, audit and pack gates;
13. the exact registry consumer executes Trust from published artifacts;
14. release commit, rollback targets, registry integrities, workflow and tag are
    recorded reproducibly;
15. no P0/P1 review finding or acceptance item remains open.
