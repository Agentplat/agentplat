# ADR 0015: Continuous role alignment is a longitudinal local control

- Status: accepted
- Date: 2026-08-05

## Context

Inference Control can assess an input, output, action or message at a concrete
release boundary. Portable Agent Runtime also supplies a versioned role binding
to every step. Neither contract by itself answers whether an agent remains
coherent with that role across a long sequence of individually plausible
interactions.

Drift can be cumulative. Incomplete context, repeated low-confidence evidence,
conflicting peer observations or apparently harmless outputs can move an agent
away from its objective before a single checkpoint becomes an obvious hard
violation. A durable session handoff must preserve this history or the new
executor would regain an unjustified clean control state.

## Decision

Add two opt-in entry points to `@agentplat/inference-control`:

- `./role-alignment` contains browser-safe contracts, canonical digests, strict
  validation and pure state transitions;
- `./role-alignment/portable-agent` binds those transitions to Portable Agent
  Runtime control points and checkpoint transfers.

The controller consumes assessor-produced, basis-point signals for coherence,
uncertainty and context inconsistency. It maintains a bounded rolling window,
consecutive breach and recovery streaks, intervention budgets and a causal,
content-free event tail and global causal head. Its interventions are `continue`,
`reinforce_role`, `challenge_context`, `pause`, `request_realign` and `deny`.

`continue` and `reinforce_role` allow the current portable step. The runtime
already supplies the exact role binding again on every step. A context challenge
abstains so the caller can obtain different or stronger evidence. Pause,
realignment and denial remain sticky until an explicit resume or an exact
successor role revision permits progress.

High-risk action proposals may be denied while the session is degraded even if
the current action assessment is otherwise acceptable. This prevents a healthy
single observation from erasing accumulated uncertainty before the configured
recovery streak is complete.

Controller state uses revision-checked persistence. A handoff envelope binds the
full content-free controller state to the exact Portable Agent checkpoint
transfer digest. Import changes the session and agent binding while preserving
the rolling window and causal event head.

## Consequences

- Alignment becomes an explicit time-series state rather than a collection of
  independent allow/deny checks.
- Closed-model, open-weight, symbolic and hybrid agents can use the same public
  contract; the assessor remains an application-provided adapter.
- A compromised assessor can still provide misleading scores. Exact bindings,
  bounded outputs and fail-closed transitions prevent it from creating action
  authority, but independent or stronger assessors remain a deployment concern.
- State retains a policy-bounded causal tail while total counters and the event
  head continue across long sessions. A full-history journal and authenticated
  durable repositories are adapter concerns.
- Existing Runtime and Inference Control behavior is unchanged unless an
  application constructs the new controller.

## Alternatives considered

### Evaluate every interaction independently

Rejected because independent checks cannot represent gradual drift, recovery
hysteresis or intervention exhaustion.

### Store controller state inside provider prompts

Rejected because prompts are provider-specific, may be untrusted or truncated,
and are not a durable authority or audit boundary.

### Reset alignment after checkpoint transfer

Rejected because a handoff would become a way to erase adverse history and
regain action eligibility.
