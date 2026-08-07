# Autonomous Team Execution V1 threat model

## Protected properties

- Execution starts only from an exact activated team and joint contract.
- Dependency order cannot be bypassed by a command or remote result.
- A dispatch is persisted before external execution and has one exact result.
- A result is accepted only from the configured executor for its exact current
  member binding and epoch.
- Raw model output, credentials and hidden reasoning never enter team state.
- Progress and completion cannot bypass local artifact or control policy.
- Recovery invalidates the failed causal closure and cannot reuse stale member
  authority.
- Persisted state cannot roll time, policy, revision or predecessor history.

## Trust boundaries

The application owns portable-session creation, authenticated peer intake,
artifact storage, result-reference integrity, provider behavior, durable
compare-and-swap storage and action enforcement. The runtime validates
content, bindings and transitions; it does not establish the truth of remote
work, execute tools, issue Work Contracts or grant effect authority.

## Threats and controls

### Duplicate execution and replay

The command and prepared dispatch are content-addressed. The dispatch is
committed before the executor is called and its digest is the required
idempotency boundary. Identical settlement is idempotent; a conflicting result
for the same dispatch is rejected. Executor implementations must make retries
idempotent by dispatch digest.

### Dependency or artifact substitution

Every dispatch contains the exact sorted artifact digests of completed
predecessors. Artifacts bind execution, team epoch, producer position, member,
member binding, source dispatch and their own dependency set. A successor runs
only when every referenced artifact is locally available.

### Provider-output injection and sensitive retention

The portable-agent runtime evaluates its configured controls. The adapter
converts output only to application-supplied durable artifact references and a
digest of the portable step record. Team state has no field for prompts, raw
observations, output content, credentials or hidden reasoning.

### Control bypass

Policy can require an allow disposition for progress and completion. Portable
refusal maps to an unsafe result and exact recovery signal; pause maps to
escalation without unlocking successors.

### Result or member impersonation

Settlement checks executor identity and version, dispatch digest, execution
and team epochs, selected member, member binding, position and joint contract.
The portable adapter independently binds tenant, Objective, agent, session,
role validity and selected member.

### Resource exhaustion

Positions, steps, artifacts, artifact dependencies, artifact bytes, peer
messages, recovery epochs, history, execution duration, step TTL and commit
attempts are locally bounded. Remote data cannot widen policy limits.

### Stale recovery and causal laundering

The recovery signal names the failed position, member binding, exact result and
current joint contract. Reconfiguration names that predecessor. Rebind requires
the exact current state and signal digest, a newer team epoch and a newly
activated joint contract. Only a dependency-closed unaffected completed
subgraph survives.

### Persistence rollback and conflicting writers

Commits use revision compare-and-swap, predecessor state digests and a logical
time high-water mark. Handoff binds runtime, implementation, policy, source and
target keys and exact source state.

## Residual risks

- An executor that ignores dispatch-digest idempotency can repeat external
  effects after a crash.
- A compromised artifact store can withhold data; content verification at the
  consumer remains an application responsibility.
- A compromised portable control or provider can misclassify unsafe output.
- Incorrect dependency declarations can omit necessary causal invalidation.
- An application that accepts a joint contract or dispatch as effect authority
  violates the integration contract.
