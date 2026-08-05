# Adaptive Role Realignment V1

Adaptive Role Realignment closes the opt-in control loop that begins when
Continuous Role Alignment enters `realignment_required`. It discovers trusted
role definitions, evaluates them with independent eligible evaluators, selects
one deterministically, obtains a policy or distributed certificate and installs
the exact successor in Portable Agent Runtime.

The feature is split across three public entry points:

- `@agentplat/inference-control/role-realignment` contains browser-safe
  contracts, digests, validation and the pure state reducer;
- `@agentplat/inference-control/role-realignment/portable-agent` orchestrates
  discovery, Trust gating, certification, Runtime activation and checkpoint
  handoff;
- `@agentplat/collective-quorum/role-realignment` maps a selected digest to the
  existing Byzantine-resilient agreement protocol and converts its commit into
  a role certificate.

All entry points are opt-in. Existing role-alignment, Runtime and agreement
behavior is unchanged until an application constructs these adapters.

## Control flow

1. A request binds the exact alignment policy, alignment state revision,
   trigger event, current role anchor and current authority ceiling.
2. Discovery strategies return content-free proposals containing only a
   trusted catalog definition identifier, revision and digest.
3. The local catalog resolves the role instructions and constraints. Peer
   proposal content is never interpreted as a role definition.
4. Trust must return `eligible` for each proposer and evaluator. Its exact
   decision digest is committed into the candidate or evaluation.
5. The reducer admits only definitions whose capabilities, resource classes,
   action budget and validity are subsets of the request ceiling.
6. Independent evaluations are filtered by lifetime and policy thresholds.
   Integer scoring and code-unit tie breaks produce the same winner on every
   conforming runtime.
7. A certificate binds the request, full selection, candidate, definition and
   authority ceiling. Distributed certificates additionally bind membership
   epoch, configuration and the source agreement commit.
8. Activation extends the current role by exactly one revision and preserves
   its predecessor and objective. Runtime is updated first; alignment then
   observes or installs the same role anchor. A retry completes either partial
   state without creating a second role revision.

Candidate state retains only the catalog ID and proposal digests. The exact
locally resolved definition enters state only when certified activation starts.
A target session must resolve the same digest from its own trusted catalog
before importing an in-flight or completed handoff.

## Integration skeleton

```ts
import { createRoleRealignmentPortableAgentV1 } from "@agentplat/inference-control/role-realignment/portable-agent";
import { createCollectiveRoleRealignmentCertificationPortV1 } from "@agentplat/collective-quorum/role-realignment";

const certification = createCollectiveRoleRealignmentCertificationPortV1({
  policyDomainId,
  certifierId,
  certifierVersion: 1,
  certifierBindingDigest,
  agreement,
  membership,
  resolver,
  clock,
  coordinates,
  witnessTrust,
});

const realignment = createRoleRealignmentPortableAgentV1({
  controllerId,
  controllerVersion: 1,
  implementationId,
  policy: roleRealignmentPolicy,
  alignmentPolicy,
  alignment: roleAlignmentControl,
  runtime: portableAgentRuntime,
  discovery: discoveryStrategies,
  catalog: trustedRoleCatalog,
  evaluators,
  trustEligibility,
  certification,
  requestTtlMs: 30_000,
  evaluationTtlMs: 10_000,
  certificationTtlMs: 10_000,
  stateStore: durableCasStore,
});

const result = await realignment.run({
  sessionId,
  requestId,
  selectionId,
  activationId,
  authorityCeiling,
  logicalTimeMs,
});
```

The orchestrator is restart-safe. Repeating `run` on `selected`, `certified` or
`activating` state continues from that phase. If Runtime already contains the
target role after a process interruption, it is not updated again; the
alignment anchor and terminal record are completed instead.

## Distributed semantics

Agreement values use the `role_reconfiguration` kind. Their payload contains
only request, selection, candidate, definition and authority-ceiling digests
plus the selection state revision. Validators should compose
`createRoleRealignmentAgreementSemanticPortV1` with their other semantic
handlers. The adapter rejects unavailable selections and proposers without an
eligible Trust decision before voting.

The proposer-side adapter counts only precommit signers that independently
resolve to `eligible` in Trust. The underlying commit must still satisfy the
agreement membership and `2f + 1` certificate rules. Trust filtering can
reduce availability; it cannot weaken the agreement quorum.

## Handoff

Export the realignment envelope beside the exact Portable Agent checkpoint and
Continuous Role Alignment envelope. Import first verifies the unchanged
checkpoint transfer digest, source session, objective, policy and causal state.
The state store then moves the record to the target session with one atomic CAS
operation. Discovery, certification or activation therefore continues without
resetting adverse history or duplicating a terminal decision.

## Security and limits

- A role is alignment context, not an assignment, lease, fencing token, Action
  Grant or permission to cause an external effect.
- Authority ceilings are descriptive copies of already granted scope. This
  feature cannot create capabilities, resource access, budget or longer
  validity.
- Catalog integrity, evaluator correctness, Trust state freshness, membership
  resolution and durable CAS implementations remain deployment trust
  boundaries.
- Certificate agreement proves selection of an exact digest under a defined
  fault model; it does not prove that the role is universally correct.
- Bounded in-memory stores are reference implementations. Durable deployments
  should supply repositories with the same revision and atomic rebind
  semantics.

See the [architecture decision](../adr/0016-adaptive-role-realignment.md),
[threat model](../security/adaptive-role-realignment-threat-model.md),
[implementation plan](./adaptive-role-realignment-v1-implementation-plan.md)
and [acceptance checklist](./adaptive-role-realignment-v1-acceptance-checklist.md).
