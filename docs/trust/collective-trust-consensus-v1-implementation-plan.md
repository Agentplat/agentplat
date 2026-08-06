# Collective Trust Consensus V1 implementation plan

## Outcome

Allow a Byzantine-resilient validator collective to certify one scoped Trust
decision and let existing Agentplat consumers use that certificate only as an
additional fail-closed eligibility restriction.

The complete path is:

```text
local Evidence state
  -> Trust profile
  -> local eligibility decision
  -> content-free collective candidate
  -> peer-local semantic validation
  -> Byzantine collective agreement
  -> certified collective decision
  -> local + collective eligibility filter
  -> existing Mesh / planning / role / inference consumer
```

## Public surfaces

### `@agentplat/collective-quorum/trust-consensus`

The new opt-in entry point contains:

- strict candidate and certified-decision contracts;
- canonical candidate and decision digests;
- candidate construction from validated Trust projections;
- agreement payload construction and parsing;
- a peer-local Collective Agreement semantic adapter;
- a certification service over the current membership;
- cryptographic commit-to-decision verification;
- a revision-checked repository contract and in-memory implementation;
- effective local-plus-collective disposition evaluation;
- an asynchronous eligibility filter for existing role-selection ports; and
- synchronous cached-gate adapters for Mesh and Inference Control.

The package root does not re-export this surface. Importing existing roots does
not install collective policy or change existing behavior.

## Contract model

### Candidate identity

Candidate identity is derived from every semantic field except its identifier
and digest. Construction validates and freezes:

- `tenantId`;
- `subjectDigest` and `scopeDigest`;
- `policyId`, `policyVersion` and `policyDigest`;
- `profileDigest`, `fusionDecisionDigest`, `eligibilityDecisionDigest` and
  `evidenceSetDigest`;
- `disposition`;
- `previousCertifiedDecisionDigest`;
- `observedAtLogicalMs` and `validUntilLogicalMs`.

The exact profile and eligibility projections must agree on subject, scope,
policy and profile. `evidenceSetDigest` binds the fusion input set, not a list
chosen by the proposer.

### Dispositions

The closed candidate dispositions are:

- `eligible`: the candidate's local Trust result is eligible;
- `restricted`: the candidate's local result is restricted or policy chooses a
  stricter collective restriction;
- `quarantined`: a current quarantine record applies;
- `recovery_candidate`: a local recovery decision is eligible for collective
  review but does not itself restore ordinary eligibility.

Collective consensus never emits action authority. Consumers apply the order
`quarantined > restricted > eligible`. `recovery_candidate` behaves as
restricted until a separately configured recovery boundary succeeds.

### Semantic resolver

Every voting peer receives the exact candidate payload and proposer identity.
The resolver must return one of:

- accepted with the same candidate digest;
- rejected with a stable content-free reason code; or
- unavailable.

The reference semantic adapter additionally checks:

- value kind, payload shape and candidate digest;
- policy-domain and slot bindings;
- current logical time inside the candidate window;
- exact predecessor supplied by the local head resolver;
- candidate availability through a trusted local resolver; and
- optional proposer eligibility.

Unavailable or invalid local state causes abstention, not a permissive vote.

### Agreement coordinates

The slot is deterministic from tenant, subject, scope and policy digests. Each
accepted successor advances the slot height and binds the prior commit digest.
The current membership port supplies the exact epoch and configuration.

The decision service does not invent a height from wall-clock state. An
injected coordinate port resolves the expected height, round and predecessor so
durable deployments can serialize concurrent proposals.

### Certificate projection

Certification requires:

- a commit verified against current or explicitly resolved membership;
- exact value, slot, epoch, configuration and candidate bindings;
- a valid precommit witness set;
- commit time within the candidate validity interval; and
- exact predecessor continuity.

The derived decision ID and digest are recomputed during validation. A later key
rotation does not erase a historically valid commit; new use still checks the
decision's logical expiry and local policy.

## Effective eligibility

The evaluator consumes:

- one validated local `TrustEligibilityDecisionV1`;
- zero or one validated certified collective decision;
- current logical time; and
- a small policy declaring whether a current certificate is required.

It returns a closed `CollectiveTrustGateDecisionV1` containing both source
digests, the effective disposition and stable reason code. It never modifies
the original local decision.

The eligibility-filter adapter resolves local Trust first. Only a locally
eligible result can pass. It then resolves the exact collective subject/scope
head and returns the original local decision only when the effective decision
is eligible. This guarantees that collective data cannot promote a locally
restricted, quarantined or unavailable subject.

## Repository and recovery

`CollectiveTrustDecisionRepositoryV1` provides:

- `save(decision, expectedHeadDigest)`;
- `get(decisionDigest)`;
- `head(subject, scope, policy)`; and
- bounded `list` for audit and recovery.

Save results are `stored`, `duplicate`, `conflict`, `stale_head` or
`chain_gap`. The in-memory implementation serializes operations and deep-freezes
stored values. Production implementations must use an atomic compare-and-swap
over the head key.

After restart, a caller reads the durable agreement commit, resolves its
candidate, verifies both and deterministically reconstructs the same decision.
No unsigned repository head can substitute for that reconstruction.

## Integration points

The generic asynchronous eligibility filter is shaped so it can be supplied to
existing role discovery, evaluation, realignment and refinement ports. It
returns `null` on collective denial or unavailability, matching their existing
fail-closed candidate filtering.

Mesh allocation and Inference Control deliberately perform their final lookup
synchronously. Their adapters consume only a locally refreshed
`CollectiveTrustGateDecisionV1` cache:

- the Mesh adapter composes the existing local resolver with the cached gate
  for bid, award, lease, recovery and Collective Planning assignee filtering;
- the Inference Control adapter owns a distinct resolver binding and applies
  the cached gate at model, protected-action and outbound-message checkpoints.

Neither synchronous adapter performs network, storage or cryptographic I/O in
the final decision step. Cache refresh verifies and materializes certificates
before they become visible to the resolver. Integration remains explicit and
does not rewrite Mesh messages, planning artifacts or role instructions.

## Threat boundaries

- Byzantine safety assumes at most `f` faulty validators in `3f + 1`.
- Membership identity, key resolution and durable vote locks remain Collective
  Agreement responsibilities.
- Trust content, policy and evidence authorization remain local Trust
  responsibilities.
- Consensus proves accepted equivalence under installed semantic policy; it does
  not prove factual truth.
- Correlated evidence is controlled by the underlying Trust dependency-group
  caps before a candidate is formed.
- Certificate consumers still enforce mandate, assignment, grant, budget, lease
  and fence boundaries independently.

## Compatibility

- The feature is additive and opt-in.
- Existing package roots, Mesh wire versions and Trust state schemas are
  unchanged.
- Existing agreement kinds remain valid; unsupported semantic peers abstain from
  `trust_decision`.
- The public implementation uses only provider-neutral industry terminology.
- Coordination artifacts contain identifiers, digests, integer logical times
  and closed dispositions only.

## Explicit non-goals

V1 does not provide:

- universal truth, a portable global reputation score or cross-tenant trust;
- weighted stake, economic incentives or public reputation markets;
- automatic validator admission or removal;
- raw evidence replication through agreement messages;
- permission, assignment, mandate, lease, action grant or fencing authority;
- automatic recovery from quarantine based solely on a collective certificate;
- protection when more than `f` validators are Byzantine;
- guaranteed liveness under partition or incompatible local evidence; or
- a mandatory hosted service or control plane.

## Delivery increments

1. Freeze this plan, ADR, threat model and acceptance checklist.
2. Add closed candidate, certificate, gate and repository contracts.
3. Add canonical construction, validation, digest and chain helpers.
4. Add `trust_decision` to the closed Collective Agreement value set.
5. Implement peer-local semantic validation and fallback composition.
6. Implement decision certification and verified reconstruction from commits.
7. Implement revision-checked repository and restart recovery path.
8. Implement effective eligibility and generic fail-closed consumer filter.
9. Add documentation, example, public type audit and adversarial fixtures.
10. Run focused and workspace verification, terminology audit and packed
    consumer smoke before publication.
