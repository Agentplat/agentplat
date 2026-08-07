# ADR 0033: Governed autonomous mission lifecycle

## Status

Accepted.

## Context

Mission work crosses independently governed decision, allocation, team formation,
execution, and coordination-control components. These components must remain
provider-neutral and must not turn advisory coordination data into execution
authority.

## Decision

`GovernedMissionLifecycleRuntimeV1` is a durable saga that stores only stable
identifiers, digests, epoch/fencing coordinates, and bounded operation records.
It has a closed action set: plan certification, allocation activation, team
activation, execution observation, and four explicitly named reconfiguration
actions. A control proposal is advisory; each action, including each
reconfiguration action, is invoked only after an injected authorization port
returns a matching action-, scope-, epoch-, fencing-token-, operation-, and
intent-bound authorization that is current at the supplied logical time.

Each operation is first persisted as a deterministic outbox identity. Side-effect
ports must be idempotent on that identity. The state store uses revision and
digest compare-and-swap, a predecessor digest chain, and a logical-time
high-water mark. A restart replays a prepared operation with the same identity,
instead of synthesizing a new authority or a new plan.

The policy, first request ID, and plan-input digest are immutable bindings. Applied
outbox records retain both authorization and result digests; the injected
authorization resolver must verify every retained authorization before a loaded
state can proceed. Reconfiguration routes are explicit: pause remains paused;
role and work changes resume execution; team adaptation repeats formation; and
replanning or participation restriction restarts planning after downstream
references are cleared.

Every reconfiguration intent also includes the exact advisory proposal digest.
On restore, the proposal is revalidated against the state's scope and authority
epoch, and its expiry is checked against the current logical time before any
authorization request or enactment.

Budgets bound action units, reconfigurations, transition work per call, and CAS
retries. The lifecycle does not elect or expose a central planner: planning,
allocation, formation, execution, control, and reconfiguration are injected
ports owned by their existing subsystems.

## Consequences

Hosts must provide a durable rollback-resistant store and authorization service.
They must retain raw mission, model, and artifact payloads in their owning
systems; the lifecycle accepts references by digest only. State binding changes,
logical-time rollback, authorization denial/expiry/conflict, unsupported control
actions, CAS contention beyond budget, and budget exhaustion fail closed.
