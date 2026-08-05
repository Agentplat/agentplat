# @agentplat/inference-control

Opt-in, provider-neutral control boundaries for inference, released output,
external actions and outbound messages. Alpha 4 is a developer preview.

```sh
pnpm add @agentplat/inference-control@next
```

## Entry points

- `@agentplat/inference-control` — browser-safe canonicalization, validation,
  context provenance, policy/capability/assessment contracts, strict snapshots
  and the pure reducer.
- `@agentplat/inference-control/model` — controlled `@agentplat/model`
  rendering and execution.
- `@agentplat/inference-control/runtime` — controlled `@agentplat/runtime`
  execution and validated SSE events.
- `@agentplat/inference-control/tools` — explicit single-use Action Grant
  ledger and gateway.
- `@agentplat/inference-control/messages` — explicit outbound-message attempt
  ledger and gateway.
- `@agentplat/inference-control/trust` — content-free outcome-to-Claim
  conversion plus opt-in legacy and authenticated state-backed Trust gates.
- `@agentplat/inference-control/portable-agent` — fail-closed bridge from a
  portable-agent session control point to a bound inference-control policy and
  assessor. It maps `pre_step`, `post_output`, and `pre_action` to `pre_run`,
  `post_run`, and `pre_tool`; it does not invoke a provider or grant actions.
- `@agentplat/inference-control/role-alignment` — deterministic longitudinal
  role anchors, coherence signals, recovery hysteresis and bounded local
  interventions.
- `@agentplat/inference-control/role-alignment/portable-agent` — stateful
  Portable Agent controller plus checkpoint-handoff continuity.
- `@agentplat/inference-control/role-realignment` — content-free discovery,
  trusted-catalog admission, deterministic selection, certificates and the
  pure realignment reducer.
- `@agentplat/inference-control/role-realignment/portable-agent` — restart-safe
  discovery-to-activation orchestration with Trust eligibility, exact Runtime
  role updates and checkpoint-handoff continuity.

The root entry point has no Node runtime dependency and imports only
`@agentplat/core`. Adapter subpaths depend only on public AgentPlat contracts
and never import a vendor SDK.

## Minimal controlled model

Create a `CapabilityRegistryV1`, register the exact wrapper descriptor and
resolve an immutable policy from local configuration. Then pass the resulting
boundary to `ControlledModelExecutorV1`:

```js
import {
  CapabilityRegistryV1,
  createContextEntryV1,
} from "@agentplat/inference-control";
import { ControlledModelExecutorV1 } from "@agentplat/inference-control/model";

const registry = new CapabilityRegistryV1();
const capability = registry.register({
  descriptor: localDescriptor,
  wrapperInstanceId: "instance:primary",
});

const executor = new ControlledModelExecutorV1({
  adapter,
  contextEntries: (ids) => ids.map((id) => contextById.get(id)),
  controlBoundary: {
    capabilityRegistry: registry,
    resolvePolicy: (id, version) => localPolicies.get(`${id}:${version}`),
  },
  mode: "buffered",
  outputRisk: "high",
  assessor: localAssessor,
});

const result = await executor.generate(
  {
    schemaVersion: 1,
    runId: "run:example",
    tenantId: "tenant:example",
    policyId: "policy:example",
    policyVersion: 1,
    capabilityHandleId: capability.capabilityHandleId,
    contextEntryIds: ["context:policy", "context:user"],
    model: null,
    tools: [],
    options: null,
    scope: null,
  },
  { tenant: { tenantId: "tenant:example" } },
);
```

Context entries are immutable and digest-bound. Only `policy`, `objective` and
configured `local_trusted` entries may supply instructions; user, peer, tool,
retrieval, provider and assessor content remains ordinary untrusted data.

## Continuous role alignment

The role-alignment controller turns exact checkpoint assessments into bounded
session history. It can allow a healthy step, reinforce the current role,
abstain on contradictory context, pause, request a successor role or deny. A
single healthy assessment does not erase accumulated degradation: recovery
requires the policy's consecutive healthy-signal threshold.

```js
import { createRoleAlignmentPortableAgentControlV1 } from "@agentplat/inference-control/role-alignment/portable-agent";

const control = createRoleAlignmentPortableAgentControlV1({
  controlId: "alignment:local",
  controlVersion: 1,
  implementationId: "alignment:local:v1",
  policy: localRoleAlignmentPolicy,
  assessorBinding: localAssessorBinding,
  assessor: localAssessor,
  assessmentTtlMs: 5_000,
});
```

The scorer is deliberately application-provided. It may use deterministic
rules, another model, representation probes exposed by an open-weight adapter
or an ensemble, but its result never creates role or action authority. State is
content-free and can be exported alongside an exact Portable Agent checkpoint
transfer so a handoff cannot silently reset adverse history.

## Adaptive role realignment

The realignment controller consumes an exact `realignment_required` state and
can close the loop without accepting role instructions from a peer. Discovery
strategies propose only trusted catalog references. Independent Trust-eligible
evaluators score the resolved definitions, the pure reducer selects one with
integer arithmetic and a certificate gates installation of the exact successor
role revision.

```js
import { createRoleRealignmentPortableAgentV1 } from "@agentplat/inference-control/role-realignment/portable-agent";
```

Definitions may narrow capabilities, resource classes, action budget or
validity, but cannot widen the request's authority ceiling. Runtime-first
activation is retryable: a process interruption after the role update does not
create a second revision. See the [integration guide](../../docs/inference-control/adaptive-role-realignment-v1.md).

## Certified role refinement

The `./role-refinement` reducer applies closed, preconditioned edits to the
exact active definition. The `./role-refinement/portable-agent` orchestrator
keeps exact patches and definitions in a local draft repository, evaluates only
Trust-eligible candidates, publishes with catalog compare-and-swap, activates
provisionally and either confirms or performs certified rollback plus
quarantine.

```js
import { createRoleRefinementPortableAgentV1 } from "@agentplat/inference-control/role-refinement/portable-agent";
```

Normal role updates remain forward-only. Rollback uses explicit Runtime and
Role Alignment restoration surfaces that accept only the exact predecessor and
bind the operation to a certificate digest. See the [integration
guide](../../docs/inference-control/certified-role-refinement-v1.md).

## Security boundary

Protection applies only to calls routed through the exact controlled executor
or gateway. A direct adapter, provider, handler or dispatcher call is outside
this opt-in boundary. Coordinated external effects require a downstream-atomic
fencing adapter; local ledgers provide at-most-one local dispatch attempt, not
durable distributed single use or exactly-once effects. Provider cancellation
stops future local release but does not guarantee immediate termination of
remote computation.

Construct `ActionGateway` and `OutboundMessageGateway` with the effective
policy's `maxActionInputBytes` and `maxOutboundMessageBytes`, respectively.
Both gateways apply those canonical UTF-8 limits before assessment or external
effects and reject deeply nested JSON. Omitting the options uses the fixed
65,536-byte hard ceiling; a larger configured value is rejected.

Assessment resolvers must make `consumeCurrent` idempotent for the same exact
grant or message attempt. The gateway calls it once to consume the assessment
and again at the final local pre-effect boundary; cancellation, generation
advance or revocation between those checks must make the second call return
`false`.

## State-backed Trust gates

The `./trust` subpath can restrict model, Action and outbound-message
delegation using the current local Trust Profile. This path accepts only an
opaque runtime token created by strict protected-snapshot restore. Its bound
runtime source must return that token together with the exact current external
rollback anchor on every synchronous check. Raw state, cloned tokens, replaced
generations, clock rewind and stale dependency heads are unavailable.

That current source is part of the application's trusted computing base. It
must atomically read the durable Trust high-water anchor on every check and
must not serve a cached head. A process cannot infer an unseen successor from a
valid older anchor; returning one as the first sample is a source-boundary
violation that must be prevented by the durable adapter.

The full eligibility configuration is bound to the current
`profile_resolver` and operation boundary, including policy, subject mapping,
runtime-source identity, request template and the real base implementation
digest. Model execution uses a captured model-boundary object that receives the
same immutable target evaluated by Trust; Action and Message targets are
derived from their real permits and inputs. `restrict` delegates only for
`eligible`; `observe` preserves the base call and emits a redacted diagnostic.

These gates remain opt-in and point-in-time. They do not issue assessments or
grants, replace idempotency/fencing, or claim atomic revocation after an
external effect has started. The legacy synchronous-resolver helpers remain
available unchanged for Alpha 3 compatibility.
