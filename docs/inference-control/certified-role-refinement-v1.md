# Certified Role Refinement V1

Certified Role Refinement evolves an active role without accepting free-form
role content from a peer or allowing a generated patch to create authority. It
turns longitudinal alignment evidence into a structured local patch, validates
and evaluates the exact resulting definition, obtains collective certification,
publishes one governed catalog revision and activates it provisionally.

The feature is available through three opt-in entry points:

- `@agentplat/inference-control/role-refinement` provides browser-safe
  contracts, canonical digests, deterministic patch application and the pure
  reducer;
- `@agentplat/inference-control/role-refinement/portable-agent` coordinates
  local drafts, Trust gates, catalog publication, Runtime and Role Alignment,
  monitoring, rollback, quarantine, restart and handoff;
- `@agentplat/collective-quorum/role-refinement` maps publication and rollback
  decisions to Byzantine-resilient collective agreement.

No entry point is active until an application constructs it.

## End-to-end control flow

1. A request binds the current role definition, role anchor, authority ceiling,
   longitudinal alignment summary and refinement policy.
2. A strategy returns a structured patch against that exact predecessor. Every
   destructive edit carries a digest precondition.
3. The local runtime applies operations deterministically and rejects stale
   instruction or constraint targets.
4. The resulting definition must preserve the objective, keep constraints no
   weaker and narrow or preserve capabilities, resource classes, action budget
   and validity.
5. The exact patch, definition and semantic decision are staged in a local
   draft repository. Coordinated state contains only identifiers and digests.
6. Independent Trust-eligible evaluators score predicted coherence,
   contribution, uncertainty and transition risk. Integer aggregation and a
   code-unit digest tie-break select one candidate deterministically.
7. A publication certificate binds the request, selection, predecessor,
   patch, refined definition and authority ceiling. The governed catalog uses
   compare-and-swap to append exactly one successor revision.
8. Portable Agent Runtime and Continuous Role Alignment activate that exact
   revision. The activation remains provisional during a bounded observation
   window.
9. Healthy evidence confirms it. A hard violation, consecutive degradation or
   monitoring timeout requires a distinct rollback certificate.
10. Runtime and Role Alignment restore only the exact predecessor bound by the
    rollback certificate. The rejected revision is quarantined in the catalog.

## Structured patch model

V1 supports these closed operations:

- `instruction_insert` at an exact predecessor index;
- `instruction_replace` and `instruction_remove` with the expected instruction
  digest;
- `constraint_add` at an absent JSON-pointer path;
- `constraint_replace` with the expected current value digest.

There is deliberately no constraint-removal operation. Patch application uses
the exact predecessor, applies instruction edits in descending index order and
constraint edits in canonical path order. Replaying the same patch therefore
produces the same definition digest.

Every patch also carries a complete authority projection. It can remove
capabilities or resource classes, reduce action budget and shorten validity;
it cannot add or extend any of them. These checks are repeated against both the
predecessor and the current request ceiling.

## Integration skeleton

```ts
import { createRoleRefinementPortableAgentV1 } from "@agentplat/inference-control/role-refinement/portable-agent";
import { createCollectiveRoleRefinementCertificationPortV1 } from "@agentplat/collective-quorum/role-refinement";

const certification = createCollectiveRoleRefinementCertificationPortV1({
  policyDomainId,
  certifierId,
  certifierVersion: 1,
  certifierBindingDigest,
  realignmentPolicy,
  agreement,
  membership,
  resolver,
  clock,
  coordinates,
  witnessTrust,
});

const refinement = createRoleRefinementPortableAgentV1({
  controllerId,
  controllerVersion: 1,
  implementationId,
  policy: roleRefinementPolicy,
  realignmentPolicy,
  alignmentPolicy,
  alignment: roleAlignmentControl,
  runtime: portableAgentRuntime,
  strategies,
  semanticValidator,
  evaluators,
  monitor,
  trustEligibility,
  drafts: durableLocalDraftRepository,
  catalog: governedRoleRevisionCatalog,
  certification,
  requestTtlMs: 30_000,
  evaluationTtlMs: 10_000,
  semanticDecisionTtlMs: 10_000,
  certificationTtlMs: 10_000,
  observationTtlMs: 10_000,
  monitoringTtlMs: 60_000,
  maximumStateBytes: 16_777_216,
  stateStore: durableCasStateStore,
});

const state = await refinement.run({
  sessionId,
  requestId,
  selectionId,
  publicationId,
  activationId,
  rollbackId,
  predecessorCatalogId,
  predecessorDefinitionId,
  predecessorDefinitionRevision,
  predecessorDefinitionDigest,
  authorityCeiling,
  logicalTimeMs,
});
```

Strategies may use rules, a model or an ensemble, but they must return an exact
`RoleRefinementProposalV1` created from the public constructors. The semantic
validator is application-owned and must explicitly attest objective alignment
and non-weaker constraints. Neither component receives action authority.

## Collective certification

Agreement values use the `role_refinement` kind and an `action` of `publish` or
`rollback`. Their payload contains only digests, the state revision and the
selected action. Validators should compose
`createRoleRefinementAgreementSemanticPortV1` with their other semantic gates
and locally resolve the exact selection before voting.

The adapter verifies the commit certificate cryptographically and counts only
precommit signers that independently resolve to `eligible` in Trust. The
underlying agreement still requires `3f + 1` membership and `2f + 1` votes.
Trust filtering may reduce availability; it cannot weaken the quorum.

## Restart and handoff

Every phase is replayable against an exact state revision. The selection,
publication, activation and rollback identifiers are sealed into the request
digest, so a restarted caller cannot substitute the identity of an external
effect. Catalog publication, quarantine and role activation are idempotent for
the same bound inputs. A new process can resume a selected, certified,
published, monitoring or rollback state without generating another revision.
An expired publication certificate terminates before publication or activation.
An expired rollback certificate returns to `rollback_required` and must receive
a fresh collective commit before restoration; a commit older than that state
transition cannot renew it.

Handoff exports the content-free reducer state next to the exact Portable Agent
checkpoint. Import verifies the checkpoint digest, tenant, objective, source
session, active role revision and every locally resolvable draft or catalog
definition before one atomic state-store rebind. Missing or substituted local
content fails closed.

## Deployment boundaries

- Use durable CAS implementations for refinement state, local drafts and the
  governed catalog. The in-memory implementations are reference adapters.
- Catalog publication must atomically compare predecessor revision and digest.
- The Trust source must provide current authenticated eligibility decisions.
- Runtime role restoration and Role Alignment restoration require the exact
  predecessor plus the rollback certificate digest; ordinary role updates
  remain forward-only.
- A role remains alignment context. It is not an assignment, lease, fencing
  token, Action Grant or permission for an external effect.
- Collective certification proves agreement on exact digests under the stated
  fault model. It does not prove that a proposed role is universally correct.

See the [architecture decision](../adr/0017-certified-role-refinement.md),
[threat model](../security/certified-role-refinement-threat-model.md),
[implementation plan](./certified-role-refinement-v1-implementation-plan.md)
and [acceptance checklist](./certified-role-refinement-v1-acceptance-checklist.md).
