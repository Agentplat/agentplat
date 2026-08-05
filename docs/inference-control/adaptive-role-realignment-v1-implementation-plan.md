# Adaptive Role Discovery and Certified Realignment V1 implementation plan

## Outcome

Close the recovery loop from a longitudinal `realignment_required` decision to
an exact certified successor role while preserving separation from assignment
and effect authority.

## Public surfaces

### `@agentplat/inference-control/role-realignment`

Browser-safe contracts and pure reducer:

- policy, limits and deterministic scoring weights;
- authority ceiling and trusted role definitions;
- bound request, proposal, evaluation, selection, certificate and activation;
- causal state with revision, global counters, bounded event tail and digest;
- validators and exact transition functions.

### `@agentplat/inference-control/role-realignment/portable-agent`

Provider-neutral orchestration ports and reference implementation:

- proposal, catalog, evaluator, eligibility, certification and state-store
  ports;
- in-memory CAS store;
- discover, evaluate, select, certify and activate workflow;
- Runtime-first recoverable activation;
- checkpoint-handoff continuity for in-flight state.

### `@agentplat/collective-quorum/role-realignment`

Server-side agreement adapter:

- canonical `role_reconfiguration` agreement value;
- semantic port for peer-local validation and eligibility;
- certification port over current membership and chained agreement height;
- verification and projection of commit certificates into the portable core
  certificate.

## Contract model

### Authority ceiling

The request binds sorted permitted capability keys and resource classes,
maximum action-budget units, mandate digest and maximum validity. A role
definition may narrow any dimension but cannot add entries, increase budget or
outlive the ceiling. This metadata remains descriptive and never replaces the
real authority objects enforced downstream.

### Trusted role definition

The catalog record owns `roleKey`, instructions and constraints. Its digest is
derived from the exact content and authority requirements. Proposals refer to
the definition ID, revision and digest only.

### Discovery request

The request is created only from a valid Continuous Role Alignment state whose
status is `realignment_required`. It binds the policy, alignment state digest,
trigger event, current role, authority ceiling, checkpoint context and bounded
lifetime.

### Proposal and evaluation

A proposal is content-free and tied to one request and proposer binding. An
evaluation binds the resolved definition and uses integer basis points for role
fit, expected mission contribution, uncertainty and transition risk. Reason and
evidence-reference arrays are sorted and bounded.

### Selection

Only candidates with the configured number of distinct eligible evaluators and
scores within policy thresholds participate. Aggregate score is:

`fit*wFit + contribution*wContribution - uncertainty*wUncertainty - risk*wRisk`

with integer weights summing to 10,000. Ties resolve by definition digest and
candidate ID. The selection commits to the complete ordered eligible set.

### Certification

The core certificate is an opaque, strict record that binds the exact selection
and witness identities. The Collective Quorum adapter derives it only from a
verified `2f + 1` precommit certificate under current `3f + 1` membership and a
peer-local semantic acceptance of the same value.

### Activation

Activation materializes a Portable Agent role binding from the selected trusted
definition using revision `current + 1` and the current role ID as predecessor.
The orchestrator writes Runtime first, then advances alignment state and finally
marks discovery state activated. Retry is exact and idempotent.

## State transitions

```text
requested
   -> collecting
   -> selected
   -> certified
   -> activating
   -> activated

Any non-terminal phase -> expired | failed
```

No terminal state can be reopened. A new attempt requires a new alignment
revision and request digest.

## Handoff

Export binds the full discovery state to the exact Portable Agent checkpoint
transfer digest. Import verifies the source session, agent, objective and role,
then rebinds the request/state to the destination session and agent without
changing candidate, evaluation, selection or certificate digests. Activation
must still use an exact successor role in the destination Runtime.

## Compatibility

- All new behavior is opt-in and additive.
- Existing package roots and wire versions remain unchanged.
- The pure entry point contains no Node built-ins or vendor SDKs.
- Existing role-alignment state remains valid.
- Agreement validators that do not install the semantic adapter reject the new
  value instead of voting for it.

## Explicit non-goals

- free-form synthesis of new trusted role definitions;
- granting assignment or external-action authority;
- replacing Collective Planning allocation;
- proving semantic safety of instruction text;
- global centralized role assignment;
- one atomic transaction across independent Runtime, alignment and discovery
  stores;
- a durable repository implementation in this increment;
- simulation or benchmark expansion beyond focused integration evidence.

## Delivery increments

1. Freeze ADR, threat model, policy and contract shapes.
2. Implement canonical validation and the pure reducer.
3. Implement trusted-catalog and authority-ceiling admission.
4. Implement deterministic selection and certification transitions.
5. Implement Portable Agent orchestration and recoverable activation.
6. Implement Trust eligibility and Collective Quorum adapters.
7. Add handoff continuity, example and public documentation.
8. Validate focused behavior, public contracts and packed consumption.
