# Attested mission-control continuity threat model

## Security objective

Only a contiguous run of policy-required, verified, in-scope control decisions
may produce an advisory `continue`. No decision can directly execute a mission
effect or carry raw mission, observation, model-input, or result content.

## Trust boundaries

- The source-verification port authenticates the source decision. Its trust
  mechanism is application-defined.
- The CAS store durably serializes mission-control state.
- The monotonic anchor independently witnesses revision, state digest, and
  logical-time progress.
- The mission lifecycle remains responsible for authorization, proposal expiry
  revalidation, and effect execution.

The adapter does not trust source fields merely because they are well formed.
Verification and every contextual binding must both succeed.

## Protected bindings

Each accepted decision binds the mission scope, authority epoch, derived fence
digest, execution-observation digest, source ID and epoch, sequence, window,
times, proposed action, proposal ID, and decision digest. Durable state further
binds tenant, mission, policy, state key, and the same authority and source
coordinates.

## Threats and controls

### Replay and equivocation

Sequences at or below the durable high-water mark cannot increase healthy
continuity. A repeated sequence with a different digest is likewise treated as
a discontinuity. Both cases reset the counter and yield the configured safe
proposal.

### Missing, reordered, or delayed decisions

The next accepted sequence must be exact. A verified gap advances only the
high-water coordinate and resets continuity; missing sequence numbers are not
stored. Expired decisions and decisions evaluated outside their bounded window
fail closed.

### Cross-mission progress transfer

A state key is permanently bound on first use to tenant and mission. A request
from another mission receives a safe advisory without mutating the bound
state. Changes to scope, authority, fence, policy, or source epoch for the same
mission are committed as a fenced reset: the current decision remains safe and
no previous healthy progress is retained.

### Stale authority or fence reuse

The fence digest includes authority identity, epoch, token, and scope digest.
Changing any coordinate invalidates the decision and prevents reuse of the
healthy counter.

### Observation substitution

The verified decision must contain the exact digest passed by the execution
observation boundary for the current evaluation. A valid decision for another
observation resets continuity.

### State rollback

The monotonic anchor detects a store restored to an older revision, an equal
revision with another digest, or a lower logical-time high-water mark. Such a
state can emit only a safe advisory. The adapter updates durable state before
advancing the anchor so an interrupted anchor update can be caught up without
making a rolled-back state look current.

### Concurrent writers

Revision-and-digest CAS prevents lost updates. A decision is obtained once and
reused across bounded retries. If another writer commits first, the decision is
reclassified against the new high-water mark and cannot be counted twice.

### Resource exhaustion

Policy validation caps continuity and accepted sequence jumps at 10,000,
retained decision records at 256, commit retries at 64, and window duration at
one day. Runtime state stores only a bounded tail; gaps and conflicts are
represented by counters and high-water coordinates rather than attacker-sized
collections.

### Source outage or malformed evidence

Source exceptions, malformed records, failed verification, and unverifiable
identity fields reset continuity and emit the configured safe advisory. No
implicit allow path exists.

## Residual risks

- A compromised source verifier can authenticate fabricated decisions.
- Coordinated corruption of both the CAS store and monotonic anchor can hide a
  rollback.
- A source can deny service by emitting gaps or conflicts; the intentional
  result is continued pause or replanning.
- Policy owners must choose a continuity threshold and safe action appropriate
  to the deployment's hazard model.

## Verification expectations

Conformance tests cover a 10,000-step threshold, discontinuities at early,
middle, and late positions, process restart, CAS retry, cross-mission state-key
reuse, bounded memory, replay, sequence gaps, expiry, and rollback detection.
