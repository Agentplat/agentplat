# Continuous Role Alignment V1 implementation plan

Status: implemented design baseline.

## Outcome

Continuous Role Alignment V1 adds a provider-neutral local controller that
tracks whether a portable agent remains coherent with its versioned role over a
long interaction history. It turns point-in-time inference assessments into a
bounded longitudinal state and can reinforce, challenge, pause, request a role
revision or deny before protected output and actions are released.

The feature is additive and opt-in. It does not change default Runtime, Model,
Mesh, Trust, Rooms or Framework behavior.

## Public surface

### `@agentplat/inference-control/role-alignment`

- policy, role-anchor, signal, decision, event and state contracts;
- domain-separated canonical digests;
- strict policy, anchor and state validation;
- pure create, observe, role-replace, resume, close and session-rebind
  transitions;
- sticky-state and retained-decision helpers.

### `@agentplat/inference-control/role-alignment/portable-agent`

- exact assessor request/response contracts;
- `PortableAgentControlPortV1` implementation;
- revision-checked state-store port and in-memory reference;
- state inspection, explicit resume and close operations;
- checkpoint-transfer-bound export and import.

## State model

Every state binds:

- controller identity, version and implementation;
- policy identity, version and digest;
- tenant, session, agent and objective;
- a content-free digest of the exact role revision;
- status, revision and total signal count;
- degraded, consecutive-breach and recovery-streak state;
- intervention counters and cooldown head;
- a bounded rolling signal window;
- a policy-bounded causal event tail, global event head and full-state digest.

Scores are integers from 0 through 10,000 basis points. Integer arithmetic
keeps transition results deterministic across hosts. The role anchor retains
only identifiers, role key and a digest of instructions, constraints and
validity; the original role content remains in Portable Agent Runtime.

## Intervention order

For an active state, the reducer evaluates one exact signal in this order:

1. hard violation or deny threshold;
2. protected action while accumulated state is degraded;
3. consecutive-breach realignment threshold;
4. severe coherence or uncertainty pause threshold;
5. context inconsistency challenge threshold;
6. accumulated-degradation role reinforcement;
7. continue.

Budgets can promote repeated reinforcement, challenge or pause to an explicit
realignment request. Recovery requires consecutive healthy signals; one high
score cannot immediately erase accumulated degraded state.

## Portable execution flow

1. Normalize the current role binding and derive its content-free anchor.
2. Create state for a new session or require an exact successor role revision.
3. Refuse immediately if the state is sticky and no valid role transition has
   unlocked it.
4. Digest the exact Portable Agent control target.
5. Reuse a retained decision for the same target digest.
6. Request a bounded assessment bound to controller, policy, role, state
   revision, checkpoint and logical lifetime.
7. Reduce the assessment into the longitudinal state.
8. Atomically save against the previous state revision.
9. Return only the ordinary Portable Agent allow, abstain, escalate or deny
   decision.
10. Notify an optional content-free observer without allowing observer failure
    to change enforcement.

Portable Agent Runtime supplies the exact role binding to the adapter on every
step. A reinforcement decision therefore allows a step only after the bound
role has been reintroduced. A context challenge abstains; it never rewrites or
promotes the contradictory context.

## Checkpoint and handoff continuity

Controller state is separate from provider application state. Export creates a
content-free envelope that commits to the exact
`PortableAgentCheckpointTransferV1` digest. Import requires the same transfer,
verifies source bindings, preserves rolling history and rebinds the state to the
target session, agent and role.

The state keeps only the configured number of recent events. Global revision,
signal totals, intervention counters and the causal head continue after older
events leave the retained tail, so per-step state work remains bounded. An
optional observer can persist the full event stream externally.

The application must complete both transfers as one operational workflow. V1
does not claim an atomic transaction across two independently configured
repositories.

## Explicit non-goals

V1 does not provide:

- a universal alignment or safety guarantee;
- a built-in semantic scorer or foundation-model dependency;
- direct activation steering or provider-internal representation access;
- automatic instruction promotion from peer or assessor content;
- a distributed durable repository implementation;
- authenticated state or checkpoint transport;
- atomic commit across adapter-state and controller-state repositories;
- a built-in durable full-history event journal;
- authority to allocate work, replace roles or execute external actions.

## Compatibility

- Existing package root exports and behavior remain unchanged.
- Both entry points are additive package exports.
- The pure entry point imports no vendor SDK and is browser-safe.
- The Portable Agent entry point depends only on public AgentPlat contracts.
- Existing session snapshots, checkpoint schemas and wire versions are
  unchanged.

## Delivery increments

1. Freeze ADR, policy and threat boundaries.
2. Implement canonical role anchors, signals and state digests.
3. Implement deterministic longitudinal transitions and sticky states.
4. Implement revision-checked persistence and Portable Agent control mapping.
5. Bind export/import to existing checkpoint transfers.
6. Add public contracts, end-to-end runtime examples and negative fixtures.
7. Run focused, workspace, public-audit and packed-consumer verification.

## Completion criteria

- A healthy portable session accumulates signals across pre-step, post-output
  and pre-action checkpoints.
- Gradual drift triggers reinforcement before becoming a hard violation.
- Contradictory context abstains and severe drift pauses.
- Accumulated degradation can deny an otherwise plausible action.
- Repeated breaches require an exact successor role revision.
- Resume is explicit and revision checked.
- Handoff preserves rolling state and rejects transfer substitution.
- Tampered state, assessor substitution, clock rollback, stale revisions and
  capacity overflow fail closed.
- Package exports compile and load from a packed consumer.
- Public terminology and dependency audits remain green.
