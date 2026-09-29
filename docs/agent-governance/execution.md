# Governed limits and suspension at execution (source preview)

Objective 6 introduced the opt-in instruction execution profile. Objective 7
extends these controls to [qualified purpose missions](missions.md). It composes with the existing Action Gateway, Room policy/approval checks and
Runtime checkpoints. Direct/unqualified purpose execution remains blocked. Existing unbound instruction applications retain their behavior.

## Ownership and construction

`AgentExecutionLimitServiceV1` publishes immutable limit candidates after verified
host authorization and owner or current `limits` delegation checks. Select their
IDs using the existing governance `limits` command. Publication alone changes no
permission. Rules currently support:

- tool and operation allowlists;
- destination allowlists over host-normalized destination identities;
- cumulative integer-unit budgets with stable budget IDs and explicit units; and
- semantic restrictions with an assessor ID, policy reference and maximum evidence age.

`AgentExecutionControllerV1` consumes the execution store, governance store,
Agent Definition Registry, a construction-bound adapter profile, platform limits,
an optional semantic assessment port and clock. Platform rules intersect agent
rules; agent configuration cannot remove or widen them. Multiple caps on the same
budget use the smallest cap and require consistent units.

The host attests a profile identifying adapter, Runtime platform and exact published
definition revision, with pre-action checkpoints, cooperative abort, gateway-only
effects and idempotent external effects. All capabilities are required for admission.
The profile plus platform limits is digested and retained in the active head.
An adapter declaration is an integration contract, not proof against a malicious
adapter or compromised host. Restrict credentials and route actual effects through
the supplied gateway composition; setting booleans alone cannot enforce an external
payment or tool API.

## Controlled activation and suspension

Pass the controller as the fifth `AgentGovernanceServiceV1` constructor argument,
after the optional clock. Creation remains suspended. Activation uses two separate
owner-authenticated, idempotent CAS commands:

1. `prepare_activation` advances the epoch and persists `transitioning`. New work
   and effects are fenced immediately.
2. `activate` verifies the published definition, required adapter support, all
   selected limit records, required tool/operation allowlists and any required
   semantic port. It records the admission/profile digest and advances to `active`.

An interrupted preparation remains fenced. A fresh service instance can retry the
activation command against the same stored revision. A failed admission does not
advance the head; the owner may fix host configuration and retry or issue `suspend`.
There is no implicit fallback. Purpose-mode activation additionally requires the
qualified mission composition and backend; adapter capability claims alone are insufficient.

Every other successful governance mutation returns the head to suspended, clears
admission and advances its epoch. This includes purpose, mode, references, limits,
delegation and ownership changes. Pending task/assessment bindings become stale.
Suspension does not ask the model for consent. Reactivation does not reset budgets,
rebind old tasks or make old Action Grants current.

## Room execution path and pending work

```ts
const rooms = new RoomService({
  repository, runtime,
  executionGovernance: executionController,
  requireGovernedExecution: true,
});
```

Construction fails if required governance has no port. In this profile, task
creation resolves and pins its agent participant, exact task-content digest and
current governance binding in a separate immutable record. Binding is persisted
before the ordinary Room transaction, avoiding nested cross-store transactions.
A crash between the two may leave an inert orphan binding; a task cannot execute
without both records. Retry with the same task ID/content and unchanged governance
is safe; a changed epoch requires a new reviewed task identity.

Unbound historical/imported tasks are not silently enrolled. A task cannot be
retried under a new epoch or assigned to another agent by reusing its identity.
Task status/timestamps may progress, but changing its operative content invalidates
the binding. The runtime instructions and profile must match the published definition.
Different adapter/model profiles require new admission. Default coordination uses
the admitted definition, so publishing a newer candidate cannot change its selection. For several registered
agents, hosts can route the governance port to their admitted controllers; the
required profile must not silently fall back when a controller is missing.

Before provider execution, RoomService checks pre-action capability and opens the
persisted task binding. It rechecks governance after caller hooks at `pre_step`,
`pre_action` and `post_output`. Denial aborts the cooperative signal and fails the
run. The bound scope is available in `RuntimeContext.metadata.agentGovernance` for
host tool wiring. Direct legacy/custom execution paths remain outside this profile;
applications adopting it must consistently route governed work through it.

## Existing Action Gateway integration

`@agentplat/workflows-rooms` exports:

- `agentGovernanceActionTargetDigestV1(governance, scope, binding, input)`; and
- `createAgentGovernanceActionGatewayV1(options)`.

The assessment target helper binds the existing assessment to the exact governance
epoch/profile, scope, handler/binding and action input. An authorized assessor must
review that target before an Action Grant is issued. Do not copy an old approval
onto a new target digest. The gateway factory consumes the existing ledger,
binding, downstream dispatcher, context/authority/assessment resolvers, controller,
that bound governance snapshot, and a trusted quote port. It creates no grant,
approval or new authority plane.

The quote port extracts an **upper bound** on cost, the actual normalized destination
and a stable logical `effectId` from the exact bound input and work identity. The
effect ID must survive grant/run retries; using a fresh ID for each retry defeats
cross-attempt duplicate detection. The reservation also retains the downstream
idempotency key. Costs must include every configured budget, with matching units;
missing, extra, incompatible or exhausted budget charges deny admission. Use minor
currency units or other safe integers, not floating-point money. Trusted adapters
must ensure actual consumption does not exceed their quote.

The wrapper retains existing grant checks, rechecks base authority/assessment after
quoting, verifies the governance-bound target, applies all limits, and atomically
reserves cumulative resources before calling the existing downstream dispatcher.
Semantic guards must return an allowed, current result for the exact action,
configuration and assessor; unavailable/uncertain, mismatched or stale results deny.
Evidence references are retained. These semantic checks are assessments, not a
proof that a free-text policy is universally obeyed. These semantic rules apply
to protected actions; general output/inference controls remain the responsibility
of existing Inference Control adapters and composed Room checkpoint hooks.

## Admission, uncertainty and reconciliation

The successful atomic reservation is the admission linearization point. PostgreSQL
serializes it with governance changes by locking the same head row, then updating
budget totals and inserting the effect receipt in one transaction. A suspension or
configuration change committed first denies the old binding. An effect admitted
first may finish after suspension; no universal cancellation or rollback is claimed.
The memory adapter implements the equivalent synchronous critical section.

Budget totals are per tenant/agent/budget ID, independent of governance epochs,
policy record versions or owners. All resources reserve together or none do.
A repeated logical effect ID with different bound bytes conflicts. A previously
admitted effect is never automatically dispatched again, even if its outcome is
unknown. The downstream adapter must also honor idempotency for its actual external
service; the framework does not claim external exactly-once effects.

Successful dispatch retains the reservation as spent. Exceptions, timeouts and
`ok: false` are conservatively indeterminate for accounting: none automatically
refund resources. `controller.reconcile` requires a trusted downstream receipt
bound to the exact request digest. A terminal `not_applied` proof refunds once;
`succeeded` retains cost. A lookup merely returning "not found yet" is insufficient:
proof must establish that the admitted attempt cannot later apply under that key.
Persisted known outcomes cannot be rewritten to obtain another refund.

For crashes after downstream acceptance or outcome-store failure, use the retained
effect/dispatch IDs to reconcile the effect ledger and, when necessary, the existing
Action Grant ledger through its established reconciliation API. Reconciliation is
allowed while suspended because it records facts; it never resumes or redispatches
work. There is no public HTTP endpoint accepting arbitrary success/refund claims.

## Persistence and API

Use `InMemoryAgentExecutionStoreV1(governanceMemoryStore)` for ephemeral work or
`PostgresAgentExecutionStoreV1(pool, { schema })` with the same governance schema.
Migration 016 adds immutable limit/task-binding records, cumulative budget totals,
effect receipts and expanded governance statuses. Its rollback is data-destructive
and requires normal confirmation; it additionally refuses any activation/transition
history that older suspended-only code could not interpret. Empty-state rollback
and reapply are tested. No existing migration bytes are rewritten.

`createRoomsApp({ service, executionLimits, agentGovernance })` optionally exposes
`POST /agents/:agentId/execution-limits` and
`GET /agents/:agentId/execution-limits/:limitId`. Activation uses the separate,
independently authenticated governance operation endpoint. Publishing a limit does
not attach it to an agent or approve execution.

## Verified evidence and remaining boundary

Shared memory/PostgreSQL scenarios cover failed/recovered activation, owner checks,
platform-limit narrowing, semantic denial/staleness, concurrent cumulative budgets,
all-resource atomicity, duplicate admission, suspension at commit, unknown outcomes,
verified refund and preservation across epochs/ownership changes. PostgreSQL adds
pool reopen, immutable task/limit records and migration rollback behavior.

Room tests cover capability refusal, checkpoint/hook suspension, cooperative abort,
successful governed execution and refusal to rebind old tasks. Action Gateway tests
cover exact input, base revocation, old grants under new epochs, stable logical
effect identity, budget holds and already-admitted effects finishing after suspension.
These are bounded local software checks. Purpose evaluation and mission/outcome control now use the qualified profile
in objective 7; organizational evolution uses the bounded [objective 8 composition](continuity.md).
