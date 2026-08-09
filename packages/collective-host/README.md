# `@agentplat/collective-host`

Peer-local composition for decentralized collectives. The host connects local
policy, scoped credibility, adversarial context resolution, distributed mission
decomposition, strategic allocation, semantic guarantees, certified finality,
and cognitive execution without introducing a network-wide orchestrator.

The host is intentionally certificate-driven. Planning and cognitive effects
remain local, while shared state must cross the configured finality boundary.
It fails closed when context is contested, tasks remain unallocated, sequential
semantic bounds are outside policy, or finality cannot be independently verified.

Before a cognitive operation is released, the host resolves the active governed
role and active agent lineage record. The request must carry the same authority,
role-binding and finality certificate digests, and the agent must belong to the
same membership configuration and epoch as the certificate. Safe actions are
reported as a separate terminal outcome; they are never treated as permission to
continue the ordinary planning path.

## Distributed runtime surfaces

- `./distributed-protocol` provides authenticated, causal message streams over
  a bounded sparse peer plane, with content-addressed artifacts and a durable
  at-least-once outbox. Its constructor captures scalar bindings and bound
  methods for the plane, artifact store, authenticity, membership, durable
  store and digest capability exactly once. The public options view and runtime
  entrypoints are immutable wrappers, so later option mutation, method
  replacement or prototype patching cannot substitute those authorities.
- `./distributed-planning` runs decomposition reconciliation, sealed bid
  commitment/reveal, deterministic allocation, and outcome settlement from a
  peer's admitted message view.
- `./assurance-coupled-execution` verifies the exact plan and award, computes
  without external effects, measures the real output, certifies the resulting
  guarantee and exact proposed effect, then crosses an idempotent effect port.
  Its execution store serializes active reservations and preserves terminal
  receipts so retries and fresh processes replay the same result.
- `./autonomous-adaptation` observes mission signals and coordinates bounded
  mission, strategy, role, and team changes with diversity thresholds,
  cooldown, safety review, finality, and rollback.
- `./autonomous-node` is the executable peer-local composition. It accepts a
  governed high-level mission intent, derives decomposition evidence from
  locally admitted messages, creates only local bids from a capability port,
  reconciles and allocates through the distributed planning runtime, executes
  locally awarded tasks through the assurance boundary, settles their outcomes,
  and feeds execution evidence into autonomous adaptation. Callers provide no
  peer graph, candidate list, collective-wide score, or semantic sample on a
  mission tick.
- `./reference-integrated-stack` is the open-core reference assembly for that
  lifecycle. It constructs the authenticated sparse protocol, distributed
  decomposition and sealed allocation, independently verified sparse-BFT
  finality, assurance-coupled protected execution, and bounded adaptation as
  one stack. A single finality gateway serves planning, execution and
  adaptation; shard and reconciliation certificates are always verified
  locally with `@agentplat/collective-quorum` before authority is released.
  Verified shard material is kept in a bounded local cache (4,096 certificates
  by default); eviction only forces a fresh fetch and verification through the
  configured gateway.
  The planning proposal digest is recomputed from the cycle, graph, plan,
  admitted-message view and decision time rather than trusted from a caller.
  Its default adaptation admission is bound to the protocol membership view
  and requires that authority to resolve the peer/instance/key independence
  group; a signal's self-declared group cannot increase quorum diversity.
  Processed-signal watermarks retain the exact signal digests at their causal
  high-water coordinate, so one consumed signal cannot hide a distinct signal
  observed at the same logical time. Its local invariant gate enforces
  configured domain, risk and authority ceilings before adaptation can reach
  finality. The stack also requires an
  `AutonomousCompromiseRecoveryRuntimeV1` bound to the exact lifecycle tenant,
  mesh and mission. Lifecycle, governed-role, recovery and cognitive-control
  dependencies must be genuine branded runtimes; structurally similar objects
  and prototype-only instances are rejected before any subsystem is constructed.
  Closed reference paths invoke their lifecycle, role-currentness, recovery and
  cognitive operations through module-owned invokers, so monkey-patching a
  branded instance, rebinding public properties or overriding methods in a
  subclass cannot replace the construction-time implementation. The factory
  captures each lifecycle, role catalog, recovery supervisor, assignment
  authority, cognitive controller and semantic horizon exactly once before
  validation and injection, closing accessor/Proxy time-of-check/time-of-use
  substitution. Protocol and finality are built from the same captured
  construction capsule. The stack verifies their nominal bindings to the exact
  plane, artifact, authenticity, protocol-membership, sparse-membership,
  signature, policy, gateway and cryptographic identities. Finality uses
  immutable membership/policy snapshots, captured gateway/signature methods and
  frozen planning, execution and adaptation ports; all digest-producing
  components receive one captured cryptographic capability. The supervisor must
  use the same nominal `BoundedLifecycleCompromiseRecoveryRuntimeRegistryV1`
  instance for scope admission and saga resolution; the stack verifies that
  closed-registry pair and, by object identity, that it uses the same governed
  lifecycle and durable `ReferenceRecoveryAssignmentAuthorityV1` supplied to
  effect execution. This is a fail-closed capability-authenticity check, not a
  structural port check. It reconciles certified recovery before `initialize()`,
  `submitMission()`, `receive()` and `advance()`; `load()` does not advance node
  or recovery state, but may drain already-committed causal telemetry. Recovery
  is checked again at the protected-effect currentness and
  atomic-commit boundaries.
- `./reference-local-ports` provides the concrete local capability catalog
  used by the reference stack. It derives role availability and deterministic
  sealed bids and rechecks every capability against
  `GovernedAgentLifecycleRuntimeV1` when used by the integrated stack; verifies
  its own content-bound local
  attestations and credibility projection; and materializes each certified
  award into a unique, tool-free cognitive planning request bound to the
  intent, graph, plan, task, catalog and planning certificate. The integrated
  stack encloses the model turn with `OperationalCognitiveControllerV1` and
  encloses the final protected-effect commit with its `pre_effect` gate. The
  request payload, metadata, authority, role, cognitive receipt and predecessor
  planning certificate are all committed by execution finality. The request
  schema and its execution/operation/session idempotency keys are closed and
  derived from the certified award. Lifecycle, catalog and governed-role
  currentness are resolved again inside the gated commit callback, so
  retirement cannot leave an already-computed effect implicitly eligible. The
  planning turn requests no tools, so a provider cannot introduce an implicit
  tool dispatch; embeddings that expose tools must dispatch them through the
  controller's `runPreTool()` boundary.
  The standalone catalog keeps lifecycle and the governed-role resolver
  optional for isolated tooling, but `createReferenceIntegratedCollectiveStackV1()`
  requires both and therefore cannot treat an ungoverned catalog entry or a
  caller-authored role binding as executable.
- `./in-process-sparse-bft-gateway` is a local/reference cluster gateway. It
  drives the real `SparseAgreementRoundRuntimeV1` prepare/commit rounds for
  every shard, drives a separate reconciliation round, and assembles finality
  with `SparseFinalityAssemblyRuntimeV1`. It requires the exact signer for
  every configured validator plus a proposal-admission decision from every
  signer before a round starts, and never fabricates certificates. Production
  multiprocess deployments replace this gateway with their round transport.
- `./semantic-horizon-coupling` turns time-uniform semantic bounds into an
  execution decision. The reference integrated stack requires this port and its
  state key; only the lower-level assurance runtime keeps it optional for
  isolated compatibility. Assurance snapshots the horizon requirement, state
  key and operational controller at construction and invokes the branded
  coupling through its module-owned evaluator rather than dynamically
  dispatching a replaced instance or subclass override. `replan` and
  `safe_stop` prevent protected effects. `shorten_horizon` installs a
  non-refilling protected-effect budget from `recommendedHorizonSteps`; each
  attempted protected effect consumes one unit and exhaustion returns a
  fail-closed semantic rejection that drives normal adaptation/replanning.
- `./collective-telemetry` is an opt-in adapter for a signed, content-free
  event stream. It records committed node transitions, terminal protected
  execution receipts, and semantic-horizon directives using only fixed
  operation names and digests. Generic compositions may explicitly select
  `best_effort` or `require_delivery`. The reference integrated stack instead
  requires one receipt-aware telemetry port plus stores implementing the
  `durable_outbox` capabilities. Node state and execution receipts are then
  committed atomically with bounded outbox envelopes; execution precedes its
  semantic-horizon event by causal ordinal. Drain uses a four-step durable
  handoff: audit atomically records event plus a bounded nominal receipt, the
  source marks its envelope `recorded`, audit releases the receipt, and the
  source ACKs/deletes the exact digest. Every crash frontier resumes without a
  duplicate, including after the signed event leaves audit retention. A full
  outbox or receipt ledger fails closed, and pending/recorded envelopes are
  never evicted. The closed stack accepts only the library-owned telemetry
  adapter/runtime WeakMap invokers; it exposes no low-level durable record or
  release method, and caller-authored lookalikes and method overrides do not
  satisfy or intercept durable delivery. Its only audit handoff bridge is
  claimed once by the adapter at construction; a retained runtime cannot mint a
  second bridge. Every envelope is exact-validated and
  its delivery digest recomputed before enqueue, load, drain, mark, or ACK.
  Memory and PostgreSQL share the total order source kind, source identifier,
  source sequence, causal ordinal, then delivery digest; per-source batch
  coordinates must be contiguous while ACK deletion may leave a suffix to
  resume independently.
- `./webcrypto-ports` supplies Ed25519 message authenticity and immutable
  membership-snapshot adapters for browser, edge, and server runtimes.

## Autonomous node lifecycle

`AutonomousCollectiveNodeRuntimeV1` owns one mission control cycle. After
`initialize()`, submit a validated `MissionIntentV1` once with
`submitMission()`. An embedding scheduler calls `advance()` at the
`nextWakeAtLogicalMs` values published in durable node state and forwards sparse
overlay updates through `receive()`. Those are scheduler/network events; no
operator has to construct intermediate plans or approve each stage.

The lifecycle is:

1. publish the mission intent and a local decomposition candidate;
2. reconcile only authenticated graph messages visible to this peer;
3. derive local sealed bids from the local planning port;
4. allocate from admitted commitment/reveal messages;
5. certify the exact graph and plan;
6. compute, assess, certify and commit protected effects for local awards;
7. publish settlements and feed outcome signals into bounded adaptation.

The local planning and task-materializer ports are peer-local policy/model
boundaries. They receive the authenticated partial message view but cannot
inject a prepared network-wide graph or ranking through `advance()`.
The node persists a mission-local semantic sequence high-water and allocates
one coordinate per local award. Replanning and later cycles therefore continue
the same statistical/control streams instead of restarting at sequence one.

Every mutating method on the integrated stack first runs one bounded certified
recovery tick. An unresolved verdict, unavailable recovery request, incomplete
or blocked saga, source failure, or certificate-budget exhaustion prevents the
underlying node method from being called. A completed recovery also withholds
the current call so that progress requires a subsequent empty clean tick.
`receive()` uses the same gate because authenticated transport admission still
mutates durable protocol state.

Governed lifecycle exclusion installs a successor membership configuration.
The protocol, finality verifier and local catalog are bound to their original
configuration, so that stack generation remains fail-closed after retirement;
the embedding rebuilds the stack against the certified successor before work
continues. The assignment authority resolves an exact fence bound to tenant,
mesh, mission, planning objective, work item, award, task, assignee, epoch,
token and membership generation. Its digest is included in execution finality.
Immediately before commit, recovery is drained again and the same authority
repository atomically compares that fence and membership generation while
deduplicating the effect by execution ID. A pre-commit boolean check alone is
not sufficient. For Work-Contract execution outside this stack,
also use `createCompromiseRecoveryCurrentnessPortV1()` from
`@agentplat/collective-runtime/compromise-aware-recovery` and a transactional,
fence-aware effect sink.

Assurance persists a certified `gate_pending` checkpoint before the operational
pre-effect gate can advance semantic state. Once that exact authorization is
durably debited it advances to `prepared` before crossing the idempotent commit
port, then to `effect_committed` after validating the external receipt. After a
process stop, lease takeover first reconciles the receipt without requiring the
old assignment fence to remain current. If no effect exists, it reconciles the
exact pre-effect debit and resumes only the callback, without appending an old
semantic sample after a newer sequence. A commit-start crash therefore remains
recoverable after a later assignment epoch, semantic sequence, or safe-stop,
without applying the effect or debiting either horizon budget twice.

Every execution also carries a required `cognitiveContextBindingDigest` over
canonical tenant, workspace, organization, actor identity/type/roles and the
cognitive authority digest. Abort signals, credential names and values, and
actor email are excluded; only the opaque digest enters durable inputs,
checkpoints and receipts. Receipt lookup requires the complete execution input
and performs the same nested evidence/finality validation as normal replay.
Protected effects always cross the atomic assignment authority's
fence-and-commit operation; a separate currentness check can reject early but
can never authorize a generic effect commit.

Production persistence for both the autonomous-node CAS state and the assurance
execution ledger is available from `@agentplat/collective-host-postgres`,
including the transactional causal telemetry outbox used by the closed
reference composition.
All shared decisions remain coordination evidence until an explicit authority
or protected-effect boundary verifies their current bindings.

## Remaining environment boundaries

The returned stack is nominally branded. Evaluation and transport integrations
can use `isReferenceIntegratedCollectiveStackV1()` and
`isReferenceIntegratedCollectiveStackBoundToV1()` to require a genuine stack
bound by identity to the expected sparse plane, artifact store, authenticity
port, protocol and finality membership authorities, cryptographic capability,
signature policy, finality gateway and recovery assignment authority.
Integrations that own only the transport edge can instead use
`isReferenceIntegratedCollectiveStackBoundToPlaneAndRecoveryV1()` to verify
exactly the sparse plane and recovery assignment authority without claiming a
complete authority audit.
`inspectReferenceIntegratedCollectiveStackV1()` and
`readReferenceIntegratedCollectiveArtifactV1()` expose immutable validated
snapshots and content-addressed artifacts without leaking mutable runtimes.
Reads reauthenticate membership and issuer signature through the same captured
protocol invokers used when the stack was constructed.
`storeReferenceIntegratedCollectiveArtifactV1()` accepts artifacts only through
a genuine stack, verifies their content digest, issuer signature, membership and
exact protocol/scope binding, then reads them back from the configured store and
revalidates the retained content before returning an immutable value.
`node.loadOptional()` distinguishes a clean first start from durable resumption;
it returns `null` only for absence and continues to reject corrupt persisted
state.

`createReferenceIntegratedCollectiveStackV1()` removes caller-authored graphs,
collective candidate lists, local bids, role lists, cognitive task payloads,
semantic samples, certificate-verification callbacks, signal-admission
callbacks, and adaptation-safety callbacks. The
following ports intentionally remain because the open-core cannot safely infer
them from collective messages:

- sparse overlay publication, content-addressed artifact persistence, message
  keys and the immutable membership source;
- optional remote capability-attestation and peer-projection evidence
  verification; local evidence is verified by the catalog runtime;
- operationally controlled model inference, semantic assessment, required
  time-uniform horizon evaluation, and protected external-effect
  preparation/commit;
- the sparse-BFT round gateway and aggregate-signature implementation. The
  gateway transports/advances real agreement rounds; each validator also owns
  proposal admission and it does not get a trusted certificate-verification
  hook;
- adaptation proposal planners and the certified actuator/rollback boundary;
- a durable, at-least-once certified-verdict source, authoritative recovery
  request planner, scope-admission source, monotonic coordinator store, bounded
  full-scope runtime configurations, and the verifier, lifecycle,
  assignment/effect authority, election and restoration providers used by each
  recovery saga;
- durable stores and telemetry sinks when in-memory reference stores are not
  appropriate for the deployment.

Host telemetry carries optional content-free causal correlation
(`missionId`, `cycleId`, `decisionId`, `effectId`) through node transitions and
assurance execution/semantic events, allowing `@agentplat/audit` replay without
serializing mission content, prompts, model output, or effect payloads.
Execution correlation is derived from the materialized planning request and
certificate, validated against the execution identifier and committed into the
terminal receipt; callers cannot relabel an effect into another mission stream.
