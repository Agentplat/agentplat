# Autonomy, delegation and evolution continuity

Objective 8 implements a bounded composition in source. Existing instruction
agents remain supported; purpose agents retain the qualified mission profile.
This is local software evidence, not validation of semantic judgment or AGI.

## Permanent origin and consent

An owner can create a governed agent with an optional immutable origin:

```ts
origin: {
  parentAgentId: "marketing",
  continuityId: "marketing-retention",
  kind: "genesis", // or "delegation" for an operational Handoff receiver
}
```

Use `AgentContinuityServiceV1.propose`, then `accept`. Both operations authenticate
through a host port: the source and receiver owners, or their expiring `delegate`
delegations, must consent separately. A shared owner can perform both operations.
The evidence port loads an authoritative source record and assesses compatibility;
a JSON certificate supplied by a caller is not authentication. Acceptance alone
never activates the child. Its owner still prepares and activates a qualified
execution profile.

The current profile supports one permanent parent per agent, a maximum ancestry
of eight, and no cycles. An operational delegation receiver cannot create further
descendants. Genesis descendants can form the bounded tree. There is no detach,
reparent or merge operation. Independent legacy roots retain their existing API.

Every descendant intersects its own limits with every ancestor's limits and
admitted platform rules. A charge reserves each applicable ancestor budget in
the same transaction. Unknown effects retain all reservations; verified
`not_applied` reconciliation refunds each recorded account once, including after
revocation. Tool lists from the source task further narrow operational delegation.
Semantic assessors receive `policyAgentId` to resolve the policy's issuer.

Parent suspension, configuration/model changes, expired consent and revocation
fence descendant work. Renewing the link creates a new revision and does not
rebind old tasks or grants. Migration 018 persists current links and immutable
operation receipts; rollback refuses while any governed origin exists.

## Instruction and purpose Handoffs

Use the existing `AgentRoomHandoffCoordinator` with
`createGovernedHandoffRevisionResolverV1(definitions, governance)`. This selects
published configured revisions for intake; it grants no work. Use
`createRoomHandoffContinuityEvidenceV1` as the continuity verifier. Its reference
is `JSON.stringify([roomId, handoffId])`; it reads the native Handoff, a running
source run, the immutable governed source-task binding, participants and authority
ceiling. Supply the source execution controller and the trusted alignment assessor.

The operational sequence is:

1. Create the dedicated receiver with a `delegation` origin. Propose the native
   Handoff while the source run is running.
2. Propose and accept continuity with authenticated owner/delegate consent.
   Activate the receiver with its qualified controller. Accept the native Handoff.
3. An instruction receiver runs the exact Handoff instruction through existing
   coordination execution. Task admission rejects unrelated instructions.
4. For a purpose receiver, wrap `createPurposeRoomInputPortV1` with
   `withPurposeHandoffIntakeV1(base, { rooms, handoffs })` and pass it to
   `DefaultAgentRoomCoordinationExecutionPort`. Delivery stores one deterministic
   source message and submits an inception, with no implicit task or run.
5. The receiver may reject or reformulate the inception. To execute, its current
   mission decision must adopt that exact inception message and content. This
   initial delegated purpose profile permits a single agent-task step. Use
   `PurposeMissionServiceV1.runOne`'s `owner.runOptions.onStarted` callback to bind
   that task/run through native `handoffs.bindRun`; reconcile the native Handoff
   after the run. Acceptance means receipt, not agreement with its contents.

An accepted Handoff can be rejected before a run is bound. Rejection, completion
or failure blocks new effect admission. Effects must reference the exact running
target run. A technically completed Handoff is not proof of purpose contribution:
mission outcome review still requires criteria, artifact evidence and assessed
causal support. Parent outcome evidence includes child effects; pending Handoffs
prevent completion, and unknown child effects prevent declaring settlement.
Failed or rejected delegation permits reassessment but cannot prove success.

For memory, wire the same native Handoff store as the fourth argument of
`InMemoryAgentExecutionStoreV1(governance, missions, continuity, handoffs)`.
PostgreSQL reads and locks the canonical Handoff row within task/effect admission.
Use one execution store for source and receiver so outcome and budget evidence
remain visible. Missing Handoff storage fails operational child admission closed.
Hosts own scheduling, native Handoff reconciliation and recovery after crashes.

## Progressive autonomy

`createGovernanceAutonomySupervisionV1` composes the existing Autonomy Controller
with governed execution. Register its `supervisionId` in the execution profile
and provide the port as the controller's final constructor argument. Combine
multiple required policies using `combineGovernanceSupervisionV1`; missing or
ambiguous policies deny. Ancestor supervision policies also apply to descendants.

Evidence is segmented by tenant, agent, policy issuer, configuration, definition,
profile, continuity and action type. A replacement model or newly created child
cannot inherit another segment's promotion. The existing controller determines
promotion, sampled approval and degradation. Optional Room approval must bind the
exact decision. Supervision eligibility only narrows the Action Gateway and
budget admission; it does not issue an action grant. The host supplies trusted
outcome evidence and persistent Autonomy storage when durability is required.

## Genesis, Morphogenesis and replacement

`createGenesisGovernanceCommandV1` produces an inert governance creation command
that retains the parent's owner and purpose and installs the permanent origin.
Owner authentication, Membership, Work and Action owners remain separate.

`createEvolutionContinuityEvidenceV1` accepts canonical Agent Genesis V6 activation
handoffs or organizational V7 handoffs for the `morphogenesis` owner. Its registered
loader must authenticate the owner record and map it to the exact tenant, parent,
child and configuration digests. The adapter verifies the receipt digest, owner,
expiry and false work/action authority flags. The trusted alignment assessor
then assesses purpose compatibility. Consent expiry cannot exceed receipt expiry.
The adapter does not apply topology changes or perform membership enrollment.

To replace a model on an existing agent, publish its new definition, then use the
owner's existing `mode` command with `definitionRevisionId`. This suspends execution
and preserves purpose, origin and accumulated budgets. Install the new profile,
renew affected lineage consent, prepare and activate; reevaluate stale work with
a new qualified plan. New profile/evidence scope requires autonomy assessment
again. Publishing a more capable model never expands authority.

## Local evidence

- `tests/rooms-agent-continuity.test.mjs`: inherited budgets, concurrent siblings,
  owner consent, suspension, model replacement, revocation and supervision.
- `tests/rooms-governed-handoff.test.mjs`: native source/target Room runs, source
  instruction and tool constraints, inception intake, child effects and refunds.
- Shared purpose mission scenarios verify adopted source identity and content.
- PostgreSQL continuity and Handoff tests run the same scenarios against real
  storage; receipt history, reopen and safe rollback are checked.
- Workflows-Rooms tests cover evidence segmentation/promotion/degradation and
  canonical Genesis/organizational receipt validation, including forged,
  mismatched and expired records.

Arbitrary federated agents, multi-parent budgets, recursive operational delegation,
semantic assessor quality and production-scale behavior are outside this profile.
