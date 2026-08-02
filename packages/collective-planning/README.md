# `@agentplat/collective-planning`

Portable, provider-neutral contracts and a deterministic reducer for forming
bounded local mission plans. The root entry point is browser safe, has no
import-time side effects and depends only on `@agentplat/core` types. The
opt-in `@agentplat/collective-planning/mesh` entry point composes those records
with the existing Mesh coordination and Collective Control contracts.

## What this increment contains

- closed immutable mission-intent, observation, proposal, selection, decision,
  fragment, plan-view, adaptive-role and snapshot records;
- canonical bounded JSON and synchronous browser-safe SHA-256;
- domain-separated digests and deterministic proposal/fragment identifiers;
- strict validators that reject unknown fields, malformed Unicode, unsafe
  integers, invalid time intervals, digest mismatches and inconsistent graphs;
- constructors that validate and deeply freeze their result;
- a pure, immutable planning reducer with trusted logical-time commands,
  atomic acceptance or rejection, deterministic candidate-batch selection and
  self-contained snapshot/replay state;
- an opt-in Mesh facade with an exact capability profile and critical
  extension, a bounded content-addressed fragment repository, local
  proposal-to-Work admission, replay-only inbound rejection, and
  assignment-derived Work Contract and adaptive-role composition.

It does not contain a transport, signer, assignment implementation, execution
authority, environment adapter, evaluator, monitor or model integration. A
proposal, fragment, plan view, capability advertisement or adaptive role
binding is evidence and coordination data; none of these records grants
execution authority.

## Reducer boundary

The reducer is a synchronous, deterministic state transition. It reads no host
clock, randomness, transport, storage, model, environment or Mesh state. The
caller supplies a closed command and a non-decreasing logical time. The result
is a deeply frozen next state or a rejection that retains the exact prior state.

Construction binds planning budget shards to the exact admitted subject set:
each subject is an ordered peer and instance pair. Discovery, remote proposals,
capability changes and Trust changes cannot add a subject, resize a shard or
transfer unused budget. The reducer retains accepted observations and
cursor-tombstone records, so a repeated cursor is idempotent and conflicting
reuse fails before any plan, budget or lifecycle mutation.

Commands are closed and deterministic: `observation.record`,
`proposal.record`, `slot.evaluate`, `fragment.transition`,
`fragment.project-to-work`, `fragment.assignment.observe`,
`fragment.execution.observe`, `fragment.terminal.observe`,
`work.revision.observe` and `logical-time.advance`. The five observed Work
lifecycle commands can only mirror an already accepted adapter decision; they
cannot select an assignee or create assignment authority. Every command has a
logical identifier, required
`expectedStateDigest`, and logical time. `expectedStateDigest: null` permits a
causality-only reordered command; a digest binds optimistic concurrency to that
exact state. Reuse of an identifier with the same canonical digest is
idempotent; reuse with different content is a conflict. Invalid shape, scope,
state digest, time, graph, budget or lifecycle input is rejected atomically.

`expectedStateDigest` is an optimistic-concurrency precondition for the first
application, not domain content. `transitionedAtLogicalMs` is likewise an
admission-time precondition for a fragment transition whose identity already
binds the fragment, predecessor and terminal status. Both are excluded from the
idempotency digest. After the domain command is accepted, retries with different
values for either precondition remain idempotent; changing domain payload is
still a conflict. `expectedStateDigest` is normalized in retained evidence.
Increment 3 lifecycle records additionally retain the first accepted
transition time and reducer logical-time witness so snapshot validation can
re-check the original bounded-time admission without changing command
identity. Logical-time advancement is a max-register: a value at or below the
retained high-water is idempotent and never lowers time.

Snapshot restore is a separate strict API, not a reducer command. It verifies
the complete self-contained snapshot before it returns a restored state.

Candidate batches are ordered by the frozen selection policy: constraints first,
then policy score, then the policy's declared digest tie-break. A batch produces
at most one current head for a semantic slot. Predecessor/dependency graphs,
depth, fanout, revisions, proposal bytes and concurrency are checked before
state change. Reservations are conserved across every accepted prefix; release
is available only through the safe lifecycle subset and cannot recreate a
terminal fragment, intent or role.

Reducer snapshots are self-contained: they retain identity, intent, policy,
admitted subjects and shards, observations and cursor tombstones, domain
high-waters, idempotency records, plan records, budget ledger and logical-time
high-water. Restoring or replaying the same accepted command sequence produces
the same state digest without consulting an external observation store.

## Minimal use

```ts
import {
  createPlanSelectionPolicyV1,
  createPlanningReducerCommandV1,
  createPlanningReducerStateV1,
  reducePlanningCommandV1,
  validateMissionIntentV1,
} from "@agentplat/collective-planning";

const policy = createPlanSelectionPolicyV1({
  schemaVersion: 1,
  selectionPolicyId: "balanced-v1",
  revision: 1,
  scoringDimensions: [
    {
      schemaVersion: 1,
      dimension: "outcome_coverage",
      weight: 100,
      direction: "maximize",
    },
  ],
  hardConstraintKeys: ["authority_bounds"],
  acceptanceScoreThreshold: 80,
  challengeScoreThreshold: 50,
  tieBreakOrder: [
    "score",
    "requested_budget_units",
    "work_deadline",
    "proposed_at_logical_ms",
    "proposal_digest",
  ],
});

const intent = validateMissionIntentV1(inputFromATrustedBoundary);

const initialState = createPlanningReducerStateV1({
  tenantId: intent.tenantId,
  policyDomainId: intent.policyDomainId,
  peerId: "planner-a",
  peerInstanceId: "planner-a-instance-1",
  missionIntent: intent,
  selectionPolicy: policy,
  admittedSubjects: [
    {
      schemaVersion: 1,
      peerId: "planner-a",
      peerInstanceId: "planner-a-instance-1",
    },
  ],
});

const result = reducePlanningCommandV1(
  initialState,
  createPlanningReducerCommandV1({
    schemaVersion: 1,
    kind: "logical-time.advance",
    expectedStateDigest: initialState.stateDigest,
    logicalTimeMs: 1,
  }),
);
```

All set-like arrays are encoded in ascending lexical order and contain no
duplicates. A validator returns a detached, deeply frozen value.

Fragment lifecycle is append-only. `fragmentRevision: 1` has a null
`previousStateDigest`; every later state revision retains the exact fragment ID
and proposal binding, names the preceding state digest and follows a permitted
status transition. A plan view retains that history, while selected heads,
budget reservations, Work mappings, roles and fragment high-waters bind only
the latest state revision.

Every latest fragment retains its exact planning reservation. Candidate budget
is reserved; active, projected, completed and failed work is committed;
cancelled or superseded work may be released only when no usage must be
retained. A Work mapping is valid only for a latest projected fragment whose
dependencies have latest state `completed`.

Observation values reject normalized authority, assignment, hidden-state and
future-schedule field aliases. This structural guard is defense in depth: only
an environment adapter and independent monitor can establish whether an
observation was genuinely visible and truthful. Records crossing a JavaScript
plugin boundary should be serialized data, not same-realm Proxy objects;
factories reject top-level accessor properties before reading their inputs.

`AdaptiveRoleBindingV1.planViewDigest` identifies the already-admitted plan
view from which the binding was derived. It is intentionally not the digest of
the later view that contains the binding, avoiding a circular content address.

## Opt-in Mesh facade

Import the facade explicitly; the browser-safe root never imports Mesh:

```ts
import {
  InMemoryPlanningFragmentRepositoryV1,
  PLANNING_MESH_CAPABILITY_PROFILE_V1,
  PLANNING_WORK_EXTENSION_KEY_V1,
  createPlanningLocalWorkProjectionV1,
  createPlanningMeshInboundProcessorV1,
  selectPlanningOfferRecipientsV1,
} from "@agentplat/collective-planning/mesh";
```

The sender advertises the exact planning profile through ordinary verified
Mesh discovery and also enables the same critical extension locally. A current
accepted fragment is first projected to an existing Mesh Work identity. The
offered fragment, its proposal and decision, and its complete source PlanView
are then stored as one immutable repository record. The signed Work offer
names that content reference and carries the exact critical extension. No
legacy or non-critical retry is generated when a peer lacks support.
Every envelope in one offer must carry identical critical semantics, and a
reoffer cannot remove or change previously critical evidence. The selected
peer IDs may be supplied to the Mesh allocation evaluator as its opt-in
eligible-recipient constraint, allowing the exact planning-capable subset in a
mixed-capability Peer View without changing the default allocation behavior.

On receipt, the ordinary Mesh inbound processor verifies and tentatively
evaluates the offer first. The planning gate then validates the extension,
repository evidence, sender identity, Objective and executable Work fields;
admits the proposal through the local reducer; and requires the locally
selected head to bind the same proposal and Work projection. Local and remote
fragment digests are intentionally allowed to differ because each PlanView is
peer-local. A rejection returns the original Mesh and planning projections
with only the inbound replay/message-ID high-water retained.

Capability advertisements remain self-claims used only for interoperability
and recipient filtering. A Work Contract and adaptive role can be derived only
from a current accepted Mesh assignment through Collective Control. The facade
does not construct an assignee, assignment epoch, fencing token, lease or
action grant.

Work revision is composed only while the Work is unassigned. Planning cannot
carry an existing role, Work Contract, epoch or fence across a revision; an
assigned or executing Work must first terminate or drain and later obtain a
fresh accepted Mesh assignment.
