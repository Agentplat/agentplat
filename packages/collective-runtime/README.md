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
