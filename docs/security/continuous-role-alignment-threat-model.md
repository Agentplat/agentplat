# Continuous Role Alignment threat model

Status: V1 implementation baseline.

This model covers longitudinal, local role-alignment state and its Portable
Agent integration. It complements the Inference Control, Trust and execution
checkpoint boundaries; it does not replace them.

## Protected assets

- the exact role revision and objective bound to a session;
- policy thresholds, hysteresis, intervention budgets and hard ceilings;
- accumulated degraded, breach and recovery state;
- action refusal while accumulated alignment is degraded;
- causal event history and its checkpoint-transfer binding;
- tenant, session, agent, role and assessor isolation;
- prompts, outputs, actions, credentials and hidden reasoning, which must not
  enter ordinary controller state or diagnostics.

## Trust boundaries

### Application boundary

The application selects the policy, assessor binding and state repository. A
generic metadata value, model output or peer message cannot install a policy,
replace a role or resume a paused controller.

### Assessor boundary

The assessor sees the Portable Agent control target as data and returns bounded
scores and content-free evidence references. The result must bind the exact
request, target digest, assessor identity and validity interval. An assessment
does not authorize an action or change a role.

### Runtime boundary

Protection applies only when Portable Agent Runtime invokes the constructed
controller at `pre_step`, `post_output` and `pre_action`. Calling an adapter or
provider directly bypasses this boundary.

### Persistence boundary

The repository must provide atomic expected-revision saves. The in-memory
reference is process-local. Cross-process correctness requires an adapter with
the same compare-and-swap contract.

### Handoff boundary

The controller envelope is accepted only with the exact checkpoint transfer it
commits to. The imported state remains content-free and is rebound to the target
session and role. The digest detects accidental or stale mutation; it is not a
signature or proof of origin.

## Adversaries and failures

- contradictory or incomplete peer, environment, tool or retrieval context;
- gradual role drift across individually acceptable interactions;
- a compromised model proposing an unsafe action after benign outputs;
- an assessor returning substituted, stale, oversized or malformed results;
- concurrent controller evaluations racing the same state revision;
- role replacement that skips a revision or names the wrong predecessor;
- logical-time rollback intended to revive an expired assessment;
- checkpoint transfer substitution or state reset during handoff;
- state exhaustion through unbounded signals or evidence references;
- telemetry failure or attempted content exfiltration through diagnostics.

## Required mitigations

| Threat                            | Mitigation                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| Gradual drift                     | Rolling coherence window, consecutive breach count and recovery hysteresis                       |
| One healthy sample clears history | Degraded state remains until the configured recovery streak completes                            |
| Unsafe effect during degradation  | Optional fail-closed `pre_action` denial while degraded                                          |
| Context contradiction             | Bounded context-challenge intervention that abstains rather than releasing output                |
| Intervention loop                 | Explicit reinforcement, challenge and pause budgets plus realignment escalation                  |
| Assessment substitution           | Exact request, target, assessor identity/version/digest and logical-time binding                 |
| Concurrent mutation               | Atomic expected-revision store contract; conflicts fail closed                                   |
| Role rollback or fork             | Exact revision increment and predecessor role binding                                            |
| Handoff reset                     | Envelope binds source state and exact checkpoint-transfer digest; history is preserved           |
| Resource exhaustion               | Policy ceilings on total signals, retained events, rolling window, references, TTL and state bytes |
| Sensitive-state leak              | Controller events contain scores, reason codes, references and digests, never raw target content |

## Security invariants

- No signal for another tenant, session, agent, role revision or target advances
  controller state.
- No stale or concurrent revision overwrites a newer state.
- No role change unlocks a sticky state unless it is the exact next revision and
  names the current role as predecessor.
- No high-risk action is released while degraded when the policy requires
  degraded-action denial.
- No pause becomes active without an explicit revision-checked resume.
- No checkpoint handoff discards the rolling window, counters, retained event
  tail or causal head.
- No controller state stores raw observations, outputs, action inputs,
  credentials or hidden reasoning.
- No observer failure changes an enforcement decision.

## Claims and limitations

Role alignment signals are policy inputs, not mathematical proof that a model is
aligned. The open source provides deterministic handling, binding, history and
intervention semantics around those signals. Assessment quality, independent
measurement, provider-internal representation access and domain-specific role
definitions remain outside the V1 guarantee.

The state and handoff digests provide canonical integrity checks, not
authentication against an attacker who can rewrite both content and digest.
Deployments that cross a trust boundary must protect storage and authenticate
the surrounding transfer.
