# `@agentplat/collective-runtime`

Application-level runtime for building capability-routed AgentPlat collectives.
It composes the public `AgentRuntime` provider registry with an explicit work
plan, bounded policies, observable execution state and revision-checked
persistence.

```ts
import { createCollective } from "@agentplat/collective-runtime";
import { DefaultAgentRuntime } from "@agentplat/runtime";

const runtime = new DefaultAgentRuntime();
runtime.registerProvider("local", provider);

const collective = createCollective({
  collectiveId: "launch-team",
  tenant: { tenantId: "acme" },
  runtime,
  objective: {
    objectiveId: "launch-brief",
    summary: "Produce a checked launch brief.",
  },
  plan: {
    workItems: [
      {
        workItemId: "research",
        summary: "Collect the relevant facts.",
        requiredCapabilityKeys: ["research"],
      },
      {
        workItemId: "review",
        summary: "Review the facts and produce the final brief.",
        requiredCapabilityKeys: ["writing"],
        dependsOn: ["research"],
      },
    ],
  },
});

collective
  .register({
    agent: researcher,
    capabilityKeys: ["research"],
    roleKeys: ["analyst"],
  })
  .register({
    agent: writer,
    capabilityKeys: ["writing"],
    roleKeys: ["reviewer"],
  });

collective.subscribe((event) => console.log(event.type, event.payload));
const execution = await collective.run({ executionId: "launch-run-1" });
```

Every underlying `AgentRuntime.run` receives a stable attempt ID as `runId`.
Providers that can perform external effects should use that value as their
idempotency key. If a process stops after dispatch but before the result is
persisted, `resume(executionId)` replays the same running attempt with the same
`runId`.

## Planning and team formation

Pass either a static `plan` or a `planner` callback. A planner receives the
objective and safe descriptors for the currently registered agents; its plan
is validated, normalized and persisted before execution starts. Dependencies
must form an acyclic graph.

For every ready work item, the runtime selects agents that provide every
required capability and the optional role. It balances current assignment
load, then applies priority and a stable agent-ID tie break. A failed attempt is
replanned to another eligible agent while the configured attempt ceiling
allows it.

## Policy boundary

`authorizeAssignment` and `authorizeResult` are fail-closed callbacks. An
exception, malformed response or explicit denial prevents that decision from
being accepted. Limits bound work count, attempts, concurrency and persisted
result bytes.

```ts
policies: {
  policyId: 'approved-agents-v1',
  maximumConcurrentWorkItems: 4,
  maximumAttemptsPerWorkItem: 3,
  authorizeAssignment: ({ agent, workItem }) => ({
    allow: agent.capabilityKeys.includes('approved'),
    reason: `policy:${workItem.workItemId}`,
  }),
}
```

`policyId` is required whenever a callback is installed. It is persisted and
must match when an execution resumes, preventing a restart from silently
changing the policy implementation.

## Persistence and recovery

`InMemoryCollectiveStateStore` is suitable for local applications and tests.
Production adapters implement `CollectiveStateStore.save` as an atomic
compare-and-swap over `expectedRevision`. State adapters must integrity-protect
snapshots and allow only one active coordinator for an execution.

Abort a run with its `AbortSignal` to persist a `paused` execution. Construct a
new collective with the same configuration, agents and state store, then call
`resume`. Completed dependency results and event history are retained.
Calling `cancel(executionId)` on active local work first signals the provider,
waits for the paused checkpoint, and then persists a terminal cancellation.

This package is a high-level application coordinator. It does not replace the
signed decentralized peer, lease, fencing and certified-recovery protocols in
`@agentplat/mesh`, nor does a collective assignment grant authority for an
external side effect. Applications that need those boundaries compose them in
their provider or transport adapter.

## Productive peer loop

Import `@agentplat/collective-runtime/peer` to connect peer-local planning and
current Mesh assignments to `@agentplat/runtime/adapter`. This opt-in subpath
does not change the high-level coordinator above.

`CollectivePeerRuntimeV1.plan()` supplies one agent only the accepted mission
intent, its bounded local plan view and its local observations. The agent may
abstain or return a draft. The runtime owns proposer identity and all binding
digests, rejects references outside that local context and constructs a normal
`PlanFragmentProposalV1`. The result remains proposal data until the existing
planning reducer accepts it.

`CollectivePeerRuntimeV1.execute()` requires an exact `WorkContractV1` and
`AdaptiveRoleBindingV1`. A construction-bound currentness port runs before and
after the portable agent step. If authority changes while the agent is working,
the result is withheld and the session is closed so that result cannot be
released by an idempotent retry. A released action remains an inert action
proposal; action grants, governed permits and downstream fencing still belong
to their existing gateways.

Peer sessions persist the exact Work Contract, adaptive role, adapter and
currentness implementation bindings. Credentials and the current tenant actor
context remain ephemeral. This gives applications a production composition
path for model, policy, symbolic or hybrid agents without treating an agent's
output as assignment or effect authority.

## Adaptive peer node

Import `@agentplat/collective-runtime/node` for the long-lived, provider-neutral
peer composition. `CollectivePeerNodeRuntimeV1` owns one concrete peer
incarnation and connects the existing Mesh, planning reducer, portable-agent
runtime, authority continuity, action gateway, durable repository and signed
transport boundaries.

The caller supplies only ephemeral step input and observations. The node never
accepts a caller-created plan view, Work Contract, adaptive role or assignment
authority. It instead:

1. restores its strict peer snapshot and durable inbox/outbox;
2. creates local proposals from the accepted mission view and publishes signed
   planning Work offers only while its `work_owner` continuity head is current;
3. bids, awards and accepts Work using the retained Mesh evidence;
4. reconstructs the Work Contract from the current signed offer, accepted
   award, assignment fence, stored planning fragment and delegation mandate;
5. requires the configured portable-agent control binding before inference;
6. sends every action proposal through the injected action port and withholds
   the result unless every resolution is durable and dispatched; and
7. rechecks assignment and owner continuity before atomically committing the
   completed planning state, signed checkpoint/result records, release record,
   journal and causal outbox effects.

`runOnce()` processes one durable transport batch and one local allocation
reconciliation. Reconciliation consumes the earliest due generation-fenced
Mesh timer before issuing new bids, awards or acceptances, so bid windows,
acceptance windows, Work deadlines and assignment leases advance without a
global scheduler. Ready Work is reoffered from its retained planning fragment
and current discovery view after a bid or acceptance attempt expires, bounded
by the Mesh offer-attempt ceiling. `start()` repeats that cycle until its signal
is aborted.

Authenticated messages that arrive before required award, acceptance, renewal,
checkpoint or recovery evidence are durably deferred instead of being
permanently rejected. Authentication and admission happen before deferral, and
the signed envelope remains retryable only until its own bounded expiry.

An active assignee renews a lease during its final third, within the immutable
Objective policy, Work deadline and renewal ceiling. Execution re-derives the
same stable assignment authority before every action and commit, so a confirmed
renewal may extend a long-running step without changing its action retry keys.

Assignment evidence is copied in parallel to every eligible Objective recovery
witness; independent witnesses are not chained as transport dependencies. A
candidate that is itself a configured witness does not bid, and an assignment
fails closed if excluding owner/assignee leaves fewer witnesses than the policy
threshold. After a lease and its recovery grace expire, eligible peers can
propose the next assignment epoch. Witnesses vote only for the exact
threshold-certified decision returned by the required recovery-election port;
the decision is carried in the signed vote and certificate envelopes. The port
may implement peer-to-peer rounds or another quorum protocol, but a
first-arrival or process-local quiet-window choice is not valid certification.
The Work owner counts only votes bound to the same live decision, then issues a
newly fenced recovery award. Certificate-to-award causality is fenced per
recipient, without serializing unrelated recipients. The replacement accepts
and executes through the same Work Contract, inference-control, action and
commit boundaries as an initial assignee. When a checkpoint exists and
`executionCheckpoints` is configured, acceptance waits for a membership-bound
replication certificate and exact artifact resolution; the portable session
imports and restores that state before its first step. If the election port
cannot certify a round or the certified state is unavailable, recovery fails
closed.

## Capability-state fusion

Import `@agentplat/collective-runtime/capability-state` to combine local Trust,
role coherence, capacity, sparse reachability and recovery projections before
the peer node considers a candidate for productive work.

```ts
import {
  CapabilityStateFusionRuntimeV1,
  InMemoryCapabilityStateStoreV1,
  createCapabilityStatePolicyV1,
  createCapabilityStateResolutionPortV1,
} from "@agentplat/collective-runtime/capability-state";

const policy = createCapabilityStatePolicyV1({
  schemaVersion: 1,
  policyId: "local-candidate-policy",
  policyVersion: 1,
  parentPolicyDigest: null,
  requiredDimensions: {
    offer_recipient: ["trust", "reachability"],
    bid: ["capacity", "role", "trust"],
    award: ["capacity", "reachability", "trust"],
    assignment_acceptance: ["capacity", "role", "trust"],
    recovery: ["capacity", "reachability", "recovery", "trust"],
  },
  maximumCandidates: 64,
  maximumReasonCodesPerSignal: 8,
  maximumStateHeads: 4096,
  maximumDecisionTtlMs: 30_000,
  maximumCommitAttempts: 4,
});

const capabilityState = new CapabilityStateFusionRuntimeV1({
  stateKey: "peer-a.capability-state",
  fusionId: "local-capability-state",
  fusionVersion: 1,
  implementationId: "local-capability-state.default",
  policy,
  resolver: createCapabilityStateResolutionPortV1({
    sources: [trustProjection, capacityProjection, reachabilityProjection],
  }),
  store: new InMemoryCapabilityStateStoreV1(policy),
});
```

Pass `capabilityState` as the optional port when constructing
`CollectivePeerNodeRuntimeV1`. The node uses exact `eligible` decisions only to
narrow offer recipients, bid and award candidates, assignment acceptance,
execution and recovery. The fusion boundary cannot grant assignment, action or
recovery authority, and the existing selectors still run after filtering.

Signals are content-free projections bound to candidate, operation, policy,
source revision and logical time. Missing, expired, future, conflicting or
rolled-back inputs fail closed. Applications should use a durable
compare-and-swap state store in production; the in-memory store is intended for
local composition and tests.

## Bounded local strategy adaptation

Import `@agentplat/collective-runtime/strategy-adaptation` to select among an
immutable catalog of local coordination strategies using bounded online
feedback. The controller can be used at explicit plan decomposition, offer
routing, bid submission, award selection and recovery selection seams.

```ts
import {
  LocalStrategyAdaptationRuntimeV1,
  createLocalStrategyAdaptationPolicyV1,
  createLocalStrategyCatalogV1,
} from "@agentplat/collective-runtime/strategy-adaptation";

const catalog = createLocalStrategyCatalogV1({
  schemaVersion: 1,
  catalogId: "local-coordination-strategies",
  catalogVersion: 1,
  parentCatalogDigest: null,
  strategies: [safeBaseline, adaptiveAlternative],
  baselines: {
    plan_decomposition: safeBaseline.strategyId,
    offer_routing: safeBaseline.strategyId,
    bid_submission: safeBaseline.strategyId,
    award_selection: safeBaseline.strategyId,
    recovery_selection: safeBaseline.strategyId,
  },
});

const policy = createLocalStrategyAdaptationPolicyV1({
  // Bind safety dimensions, feedback sources, metric weights, learning,
  // exploration, baseline probability, quarantine and state limits here.
});

const adaptation = new LocalStrategyAdaptationRuntimeV1({
  stateKey: "peer-a.local-strategy-state",
  controllerId: "local-strategy-controller",
  controllerVersion: 1,
  implementationId: "local-strategy-controller.default",
  policy,
  catalog,
  safety: safetyResolver,
  entropy: productionEntropy,
  store: durableStrategyStateStore,
});
```

Every selection requires current policy-defined safety projections. Trust,
role, capability-state, context-integrity and authority adapters can only keep
or narrow their upstream disposition. The integer probability distribution
always totals 10,000 basis points, caps exploration and preserves the safe
baseline floor.

Feedback binds one pending decision and an implementation-bound independent
source cohort. The controller derives reward from policy-defined clipped
metrics using a deterministic median; it never accepts a caller-provided
scalar reward. Unsafe outcomes quarantine the selected alternative and roll
the operation back to baseline. Unsafe baseline outcomes pause that operation.

The dispatcher invokes only the selected catalog-bound implementation and
exposes one method per supported coordination seam. Its result remains subject
to existing planning acceptance, capability, assignment, recovery, action and
effect controls. The feature is opt-in and does not alter existing selectors.

Use a durable compare-and-swap store and unpredictable integrity-protected
entropy in production. The in-memory store and deterministic entropy helper
are intended for local composition, tests and reproducible simulation.

## Peer-to-peer strategy evidence exchange

Import `@agentplat/collective-runtime/strategy-evidence-exchange` when peers
should exchange authenticated, content-free outcome evidence for their
installed strategy catalogs. The exchange runtime validates signed identity,
current membership and Trust eligibility, feedback schema, causal sequence,
freshness and local retention policy before an attestation may participate in
aggregation.

```ts
import {
  PeerStrategyEvidenceExchangeRuntimeV1,
  createPeerStrategyEvidenceExchangePolicyV1,
} from "@agentplat/collective-runtime/strategy-evidence-exchange";

const policy = createPeerStrategyEvidenceExchangePolicyV1({
  schemaVersion: 1,
  policyId: "strategy-evidence.production",
  policyVersion: 1,
  parentPolicyDigest: null,
  feedbackSchemaDigest,
  minimumDistinctPeers: 3,
  minimumDistinctIndependenceGroups: 3,
  minimumConfidenceBps: 7_500,
  maximumPriorInfluenceBps: 2_000,
  limits: {
    maximumAttestations: 4_096,
    maximumAttestationsPerPeer: 32,
    maximumSourceHeads: 1_024,
    maximumCertificates: 256,
    maximumFeedbackSignalDigests: 16,
    maximumAttestationTtlMs: 86_400_000,
    maximumFutureSkewMs: 5_000,
    maximumReasonCodesPerDecision: 8,
    maximumCommitAttempts: 8,
    maximumGossipFanout: 8,
    maximumGossipHops: 12,
  },
});

const exchange = new PeerStrategyEvidenceExchangeRuntimeV1({
  stateKey: "peer-a.strategy-evidence",
  exchangerId: "peer-strategy-evidence",
  exchangerVersion: 1,
  implementationId: "peer-strategy-evidence.default",
  policy,
  eligibility: membershipSignatureAndTrustGate,
  independence: localIndependenceClassifier,
  store: durableEvidenceExchangeStore,
});
```

The runtime exchanges attestations, not strategy implementations, prompts,
model outputs or model weights. A collective prior is advisory input to local
strategy adaptation: it cannot directly select a strategy, increase an
alternative's safety disposition, grant planning or assignment authority, or
override the local baseline and control-plane vetoes. Missing, stale,
equivocating or insufficiently independent evidence fails closed.

Use a durable compare-and-swap store in production. The in-memory reference
store and deterministic routing helpers are intended for local composition,
tests and reproducible simulation. The optional CollectiveSync adapter maps
the same signed attestation stream into the existing authenticated causal
replication protocol; sparse-overlay gossip announces only content digests.

## Decentralized strategy convergence and stability

Import `@agentplat/collective-runtime/strategy-convergence` to turn locally
validated evidence certificates into stable, short-lived recommendations for
local strategy adaptation.

```ts
import {
  InMemoryStrategyConvergenceStoreV1,
  StrategyConvergenceRuntimeV1,
  createStrategyConvergencePolicyV1,
} from "@agentplat/collective-runtime/strategy-convergence";

const convergencePolicy = createStrategyConvergencePolicyV1({
  schemaVersion: 1,
  policyId: "strategy-convergence.production",
  policyVersion: 1,
  parentPolicyDigest: null,
  minimumConfidenceBps: 7_500,
  minimumDistinctPeers: 3,
  minimumDistinctIndependenceGroups: 3,
  minimumStableCycles: 3,
  recoveryStableCycles: 5,
  improvementMarginBps: 750,
  diversityPreservationMarginBps: 500,
  minimumCycleIntervalMs: 30_000,
  cooldownDurationMs: 300_000,
  oscillationWindowMs: 900_000,
  maximumTransitionsPerOscillationWindow: 3,
  maximumPriorInfluenceBps: 2_000,
  recommendationTtlMs: 60_000,
  limits: {
    maximumScopes: 256,
    maximumStrategiesPerScope: 16,
    maximumObservationsPerCycle: 128,
    maximumHistoryPerScope: 64,
    maximumSourceIdsPerObservation: 128,
    maximumReasonCodesPerDecision: 12,
    maximumObservationTtlMs: 86_400_000,
    maximumFutureSkewMs: 5_000,
    maximumCommitAttempts: 8,
  },
});

const convergence = new StrategyConvergenceRuntimeV1({
  stateKey: "peer-a.strategy-convergence",
  controllerId: "strategy-convergence",
  controllerVersion: 1,
  implementationId: "strategy-convergence.default",
  policy: convergencePolicy,
  store: new InMemoryStrategyConvergenceStoreV1(),
});
```

Applications project certificates from the evidence exchange into a cycle and
provide only strategies already eligible under local catalog and safety
policy. Partitioned, divergent, oscillating, unsafe and insufficient views do
not emit a prior. A credible current strategy inside the diversity margin is
retained, and a different leader must survive the configured time, hysteresis
and recovery windows before it can be recommended.

The in-memory store is intended for composition, tests and deterministic
simulation. Use a durable compare-and-swap store and a trustworthy local
connectivity classifier in production.

## Dynamic team formation and joint work contracts

Import `@agentplat/collective-runtime/team-formation` when one unit of work
requires several complementary roles or capabilities. The runtime selects a
complete roster from bounded, locally eligible position bids without a global
candidate registry or a central scheduler.

```ts
import {
  InMemoryTeamFormationStoreV1,
  TeamFormationRuntimeV1,
  createTeamFormationPolicyV1,
} from "@agentplat/collective-runtime/team-formation";

const teamPolicy = createTeamFormationPolicyV1({
  schemaVersion: 1,
  policyId: "dynamic-teams.production",
  policyVersion: 1,
  parentPolicyDigest: null,
  minimumDistinctPeers: 2,
  minimumIndependenceGroups: 2,
  maximumTotalBudgetUnits: 1_000,
  requireDistinctPeerPerPosition: true,
  limits: {
    maximumPositions: 16,
    maximumBidsPerPosition: 32,
    maximumMembers: 16,
    maximumSearchNodes: 100_000,
    maximumReasonCodesPerDecision: 12,
    maximumHistoryEntries: 32,
    maximumRequestTtlMs: 300_000,
    maximumTeamDurationMs: 86_400_000,
    maximumCommitAttempts: 8,
  },
});

const teams = new TeamFormationRuntimeV1({
  stateKey: "peer-a.team-formation",
  formationId: "dynamic-team-formation",
  formationVersion: 1,
  implementationId: "dynamic-team-formation.default",
  policy: teamPolicy,
  store: new InMemoryTeamFormationStoreV1(),
});
```

Capability-state decisions can be projected into team candidates, and
authenticated Mesh bids can be projected into local position bids. Selection
is an exhaustive deterministic search inside a policy-defined node budget. It
optimizes the complete roster rather than independently choosing the highest
bid for every position; if the bounded search cannot prove a result it emits no
proposal.

A `TeamProposalV1` is inert coordination data. `activate()` succeeds only when
every selected position is backed by an exact, current individual
`WorkContractV1`. The resulting `JointWorkContractV1` composes those bindings
but never replaces them at an action boundary. Existing per-member assignment
epochs, leases, fencing tokens and action budgets remain authoritative.

Member failure is handled as a new team epoch. Unaffected members may retain
their current individual contracts, while the replacement must complete the
ordinary Mesh offer, award and acceptance flow. The new proposal names the
previous joint contract and cannot reuse a failed member's authority. Member
outcomes are content-free and result-bound; the team completes only when every
current member reports success and fails closed on a failed or unsafe result.

Use durable compare-and-swap storage in production. Formation requests, bids,
rosters, outcomes and epoch history are bounded and contain no prompts, model
outputs, credentials or hidden reasoning.

## Autonomous team execution and causal replanning

Import `@agentplat/collective-runtime/team-execution` to execute an activated
team's position dependency graph without a central scheduler.

```ts
import {
  InMemoryTeamExecutionArtifactPortV1,
  InMemoryTeamExecutionStoreV1,
  TeamExecutionRuntimeV1,
  createTeamExecutionPolicyV1,
} from "@agentplat/collective-runtime/team-execution";

const executionPolicy = createTeamExecutionPolicyV1({
  schemaVersion: 1,
  policyId: "team-execution.production",
  policyVersion: 1,
  parentPolicyDigest: null,
  requireReferencedCompletionArtifact: true,
  requireAllowedControlForProgress: true,
  limits: {
    maximumPositions: 16,
    maximumStepsPerPosition: 64,
    maximumArtifactsPerStep: 8,
    maximumArtifactsPerPosition: 64,
    maximumArtifactDependencies: 64,
    maximumArtifactBytes: 16_777_216,
    maximumPeerMessagesPerStep: 64,
    maximumTotalPeerMessages: 4_096,
    maximumRecoveryCount: 8,
    maximumHistoryEntries: 16,
    maximumExecutionDurationMs: 86_400_000,
    maximumStepTtlMs: 300_000,
    maximumCommitAttempts: 8,
  },
});

const execution = new TeamExecutionRuntimeV1({
  stateKey: "peer-a.team-execution",
  runtimeId: "team-execution",
  runtimeVersion: 1,
  implementationId: "team-execution.default",
  policy: executionPolicy,
  executor: controlledPortableMemberExecutor,
  artifacts: new InMemoryTeamExecutionArtifactPortV1(),
  store: new InMemoryTeamExecutionStoreV1(),
});
```

`start()` requires an exact active `TeamProposalV1` and
`JointWorkContractV1`. `runStep()` first commits a content-addressed dispatch,
checks every predecessor artifact locally, delegates to the configured member
executor, publishes only durable artifact references and then settles the
result. The portable-agent adapter composes existing provider-neutral sessions
and their pre-step, post-output and pre-action controls.

Failed, unsafe and expired steps produce a recovery signal that can be adapted
into the existing team-reconfiguration flow. After a replacement is selected
and activated, `rebind()` advances the execution epoch, retains the unaffected
completed dependency subgraph and resets the failed position and all causal
successors.

The runtime does not execute tools or grant effect authority. A dispatch and a
joint contract remain coordination data; action gateways must continue to
validate the member's individual Work Contract, lease, epoch and fence. Use a
durable compare-and-swap store and durable content-addressed artifact service
in production. The included in-memory ports are for composition, tests and
deterministic simulation.

## Distributed team execution exchange

Import `@agentplat/collective-runtime/team-execution-exchange` to carry team
dispatches, artifact availability, results and recovery signals across peers.
The exchange record is embedded in a signed Mesh envelope under the critical
extension `agentplat.team-execution-exchange.v1`. Inbound extraction accepts
only `VerifiedMeshEnvelope` values and then applies a separate local membership
decision; a transport signature alone never grants team membership.

Each sender owns an append-only causal stream. Out-of-order records remain in a
bounded pending set, exact replay is idempotent, forks fail closed and a narrow
recovery port can fetch missing authenticated predecessors after a partition.
The runtime persists `ready`/`handled` inbox and `pending`/`sent` outbox states
with compare-and-swap storage. Handlers and outbound publishers must use
`messageId` as their durable idempotency key because a crash can repeat either
external call before its local acknowledgement is committed.

The member adapter resolves dependency artifacts, executes through the existing
controlled member port and announces durable references before returning a
result. The coordinator adapter verifies reference availability before calling
`settleStep()`. Neither adapter grants tool or action authority: individual
Work Contracts, leases, epochs, fencing tokens and action controls remain
mandatory at the effect boundary. Use the in-memory store only for tests and
deterministic local simulations.

## Team execution ownership continuity

Import `@agentplat/collective-runtime/team-execution-continuity` when a team
execution must survive permanent coordinator loss. The runtime binds each
prepared execution checkpoint to the exact current `work_owner` holder,
instance, generation, authority head and fencing token. Publication requires an
availability certificate tied to the same membership configuration.

A successor resolves and validates the latest certified checkpoint before
import. Pending dispatches retain their existing identifiers, so a member or
effect gateway can return the same durable result instead of repeating work.
The injected execution and state ports must apply the supplied fence atomically
at every durable CAS and effect boundary. With those fence-aware ports,
ownership changes prevent a stale coordinator from committing new progress.
The runtime consumes authority but does not elect an owner, move credentials or
make an execution checkpoint an effect grant.

## Outcome-driven team structure adaptation

Import `@agentplat/collective-runtime/team-structure-adaptation` to choose the
shape of a future team from an immutable local catalog. Observations are derived
from validated execution state and contain bounded outcome metrics rather than
raw model output or an arbitrary caller-provided reward.

Deterministic integer updates, minimum evidence, exploration caps, cooldown,
hysteresis and quarantine prevent one result from causing an unbounded change.
The resulting selection is advisory for a future adaptation cycle. Its
positions still pass through a fresh formation runtime at team epoch 1, which
rechecks coverage, diversity, budget, eligibility and individual Work
Contracts. Active teams are never changed in place.

## Integrated collective peer host

Import `@agentplat/collective-runtime/host` as the transport-neutral composition
root for an operational peer. The host verifies or accepts verified Mesh
envelopes, classifies them once and admits each message to exactly one durable
subsystem. Unknown or ambiguous critical semantics fail closed, and an inbound
message is acknowledged only after admission succeeds.

`restore()`, bounded `runOnce()`, `start()`, `drain()` and `status()` control the
host scheduler without taking ownership of subsystem lifecycle or CAS state.
Optional command ports expose formation, execution, continuity and structure
adaptation through one facade. Directory and topology freshness may pause
dispatch but never replace membership or Work authority. HTTP, databases,
provider SDKs and effect gateways remain outside this browser-safe package.

The host also accepts optional decision, mechanism-allocation and
coordination-control ports. Their facade methods preserve the authority of the
underlying subsystem: allocation and control remain advisory, while a certified
collective decision remains coordination authority rather than an action grant,
lease or fencing token. Facade methods are independent: the application must
explicitly route each advisory proposal through its applicable approval gate.

## Certified collective decisions

Import `@agentplat/collective-runtime/collective-decision` to prepare, certify
and durably accept content-free decisions for plan fragments, team rosters,
execution takeovers, team structures, role transitions and strategy changes.
Every candidate binds its scope, causal epoch, exact membership and external
payload digest. Policy selects local, trusted-evidence or Byzantine-agreement
certification independently for each decision kind.

The runtime revalidates certificate bindings before an append-only CAS commit,
requires the injected certification port to authenticate externally retained
proofs, rejects a conflicting value for an accepted slot and preserves a
logical-time high-water mark. Restore reauthenticates retained certificates;
expired full records become permanent digest-bound tombstones. Policy bounds
both active heads and tombstones and fails closed at either limit. Production
stores must add a durable rollback-resistant integrity anchor; archival or state
generation rotation must preserve replay protection for every compacted slot.
The in-memory store is only for local composition and tests. The concrete
signed-agreement adapter is exported by
`@agentplat/collective-quorum/collective-decision`.

## Mechanism-aware mission allocation

Import `@agentplat/collective-runtime/mechanism-allocation` for bounded,
non-monetary commit/reveal allocation over semantic work slots. The deterministic
clear enforces capability eligibility, dependency readiness, declared cost and
budget, resource limits, per-peer concentration and independence-group policy.
Every event must carry an admission from the required provider-neutral verifier,
binding actor peer, process instance, independence group, membership,
capabilities and logical validity. Exact admitted events are retained so restore
can reauthenticate them. Equivocating bidders are excluded, and a withdrawal
reopens only affected slots in the next causal round.

Production allocation stores must atomically compare the expected revision and
state digest and retain a monotonic rollback-resistant head outside the mutable
snapshot. The in-memory store is only for local composition and tests.

`createMechanismDecompositionFromPlanningStateV1()` projects one peer's accepted
planning view into an allocation proposal.
`createTeamFormationRequestFromMechanismAllocationV1()` projects a complete
allocation into the ordinary team-formation gate after rechecking the allocation
policy, formation policy and every persisted admission. Neither adapter creates
an assignment or effect authority; formation and individual Work Contracts
remain mandatory.

## Integrated coordination-control loop

Import `@agentplat/collective-runtime/coordination-control` to reduce fresh,
source-bound projections of role alignment, context integrity, uncertainty,
Trust, capability and execution outcomes into a bounded advisory proposal. The
closed action set can continue, pause dispatch, restrict participation, or
request role transition, work reassignment, team adaptation or replanning.

Missing, stale, rolled-back or equivocating evidence fails closed. Cooldown and
hysteresis reduce oscillation. Policy pins a source-registry digest and a
required resolution port authenticates every projection before use. The durable
outbox retains a live pending proposal until its injected delivery port
acknowledges it. An expired proposal becomes an explicit `expired` non-delivery
record and is never reported as delivered. The recipient still owns the
decision, assignment and effect-authority checks needed to enact the request.
Production control stores require the same revision-and-digest CAS plus an
external monotonic head; the in-memory store is not a rollback anchor.

## Governed autonomous mission lifecycle

Import `@agentplat/collective-runtime/mission-lifecycle` to compose planning,
allocation, formation, execution observation and coordination control as one
durable, bounded mission saga. The state is content-free: it retains exact
scope, policy, request, operation, authorization and result digests rather than
mission prompts or model output.

Every external operation is prepared durably before invocation and carries a
stable operation ID plus exact authority epoch and fencing coordinates. Restore
reauthenticates applied authorizations and resumes pending operations through
application-provided idempotent ports. Control output remains advisory until a
separate reconfiguration port enacts the approved pause, restriction, role
transition, reassignment, team adaptation or replanning action.

The runtime enforces action, reconfiguration, transition and CAS budgets.
Replanning, formation and execution changes return to their corresponding
phase instead of being reported as completed. The optional peer-host facade
exposes `advanceMission()` and `recoverMission()` without taking ownership of
the underlying subsystem state or widening its authority.

## Replicated execution checkpoint handoff

Import `@agentplat/collective-runtime/checkpoints` for the provider-neutral
artifact, certificate, repository and HTTP boundaries. Producers publish a
portable adapter checkpoint only after the selected current members return the
configured storage and certificate-custody thresholds. Recovery peers discover
the certificate from current members, fetch only from its signed receipt
holders and verify every scope, membership, binding and digest before import.

Checkpoint state is application state, never process memory, credentials,
model prompts or hidden reasoning. The reference codec rejects common secret
and hidden-reasoning keys and applies strict byte limits. Use independent
durable repositories in production; the in-memory repositories are intended
for local composition and tests.

`execute()` remains explicit because observations, credentials and agent input
are intentionally not persisted in the node snapshot. Its successful
`committed` status means the checkpoint/result release and causal outbox are
durable locally; it does not claim that asynchronous remote delivery has
already completed.

The action port is part of the trusted application boundary. Its `execute()`
implementation must use the node-supplied `effectId` as its idempotency key,
persist the returned resolution before acknowledging `dispatched`, and return
that same resolution when a crash or compare-and-swap retry replays the key.
The key is bound to tenant, mesh, Objective, Work revision, step and action—not
to a mutable lease, continuity read or assignment epoch. A recovery assignee
therefore reuses the same effect key, and the action gateway must share durable
receipts across peers that can execute that Work. It
must also atomically revalidate the supplied Work Contract, assignment fence
continuity binding and assignment confirmation at the downstream effect
boundary. The assignment-confirmation port must return only after the owner and
at least the configured witness threshold have semantically accepted the exact
acceptance or latest renewal; local outbox enqueue/delivery alone is not
sufficient execution authority. The continuity port
must implement `resolveScope()` for local owner commands and `resolve()` for a
derived Work Contract, then check the exact current `work_owner` scope. Stale or
unavailable authority withholds Work creation, offer/award/certificate
publication, ingress, actions, commit and delivery. Owner envelopes carry the
exact continuity head in the signed
`agentplat.collective.owner-continuity.v1` extension, closing ABA delivery and
ingress races. The continuity port must explicitly declare
`ownerTransferMode: "stop_and_replan"`: a Work whose logical owner transfers
is stopped and must be replanned under the successor in this V1 profile.
Historical Objective policy
is used for already accepted Work revisions; a current Objective cancellation
remains terminal.

Planning fragment records are content-addressed. `put()` must be idempotent for
the same record, and `get()` must resolve authenticated records referenced by
received offers (for example through a shared or replicated content store).
Configure `planningArtifacts` with a `PlanningArtifactAvailabilityPortV1` when
peers do not share that store. After the normal inbound processor authenticates
an offer and reports `planning_repository_missing`, the node resolves the exact
referenced artifact and processes the original envelope again. Temporary
unavailability throws from inbox processing so the durable worker retries it;
without the port, the existing terminal rejection remains unchanged.

`CertifiedPlanningArtifactAvailabilityV2` from
`@agentplat/planning-artifacts` implements the same port and adds a
current-membership, threshold-certified replica fallback after the normal
source-first attempt. Pair it with
`CertifiedReplicatedPlanningFragmentRepositoryV2` on producers so work offers
are not published until the configured artifact and certificate-custody
thresholds succeed.

For joining, restarted, or partition-healed peers, configure the optional
`synchronization` port. Planning, reconciliation/bidding, execution,
assignment confirmation, and recovery-election participation then fail closed
until the port reports membership-bound causal readiness. When an otherwise
valid inbound envelope lacks a predecessor, the port may fetch and replay that
evidence and return the rehydrated runtime state; the node processes the
original envelope again through the normal inbound reducer. No synchronization
payload bypasses admission or authority checks. `@agentplat/collective-sync`
provides the reference operational adapter.
