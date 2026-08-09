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
- `@agentplat/inference-control/context-integrity` — content-free longitudinal
  context decisions, bounded CAS state, explainable reference analysis and
  conservative analyzer composition.
- `@agentplat/inference-control/context-integrity/model` — exact pre-provider
  filtering for immutable controlled-model context entries.
- `@agentplat/inference-control/context-integrity/portable-agent` — a
  manifest-bound filtering wrapper for heterogeneous agents plus state handoff.
- `@agentplat/inference-control/intervention` — capability-negotiated,
  content-free intervention gates for opaque APIs, token streams,
  representation sidecars, portable agents and multimodal action agents.
- `@agentplat/inference-control/cognitive-adapters` — concrete cognitive-agent
  adapters for black-box and representation-aware local inference, plus a
  bounded HTTP chat-completions port for locally operated endpoints.
- `@agentplat/inference-control/operational-control` — executable cognitive
  control loop for black-box and representation-aware inference, anytime
  observations, safe stopping and immediate pre-tool/pre-effect fencing.
- `@agentplat/inference-control/assessor-ensemble` — request-bound,
  independent-group assessment across heterogeneous surfaces and modalities.
- `@agentplat/inference-control/semantic-metrics` — provider-neutral vector
  metrics and fixed-horizon descriptive bounds.
- `@agentplat/inference-control/semantic-guarantees` — durable, anytime-valid
  confidence sequences with explicit error spending, missingness policies and
  horizon/replanning decisions.

The root entry point has no Node runtime dependency and imports only
`@agentplat/core`. Adapter subpaths depend only on public AgentPlat contracts
and never import a vendor SDK.

The cognitive adapters keep context, memory and tool use behind the reference
control boundary. Representation-aware execution applies the configured
representation intervention before the embedded engine runs. Both forms emit
content-bound receipts for the collective cognitive runtime; neither model
output nor a transport response grants action authority.

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

## Long-horizon context integrity

Context Integrity evaluates the complete original input set and returns an
item decision: `admit`, `restrict`, `isolate`, `require_corroboration` or
`deny`. An inference may continue with a reduced set only when the request and
policy contain the exact digest of the installed filtering implementation.

```js
import {
  ContextIntegrityRuntimeV1,
  createContextIntegrityReferenceAnalyzerV1,
} from "@agentplat/inference-control/context-integrity";
import { createContextIntegrityControlledModelGateV1 } from "@agentplat/inference-control/context-integrity/model";

const controller = new ContextIntegrityRuntimeV1({
  controllerId: "context-integrity:local",
  controllerVersion: 1,
  implementationId: "context-integrity:local:v1",
  policy: localContextIntegrityPolicy,
  analyzer: createContextIntegrityReferenceAnalyzerV1({
    analyzerId: "context-analyzer:local",
    analyzerVersion: 1,
    assessmentTtlMs: 5_000,
  }),
  store: durableContextIntegrityStore,
});

const contextGate = createContextIntegrityControlledModelGateV1({
  controller,
  filterId: "context-filter:model",
  filterVersion: 1,
  filterImplementationDigest,
  itemTtlMs: 60_000,
  logicalTimeMs: trustedLogicalClock,
});
```

The reference analyzer is a transparent baseline, not a universal injection
detector. Applications can compose model, classifier, semantic-entropy or
representation-probe analyzers. State and handoff envelopes retain only
digests, revisions, bounded scores and reason codes; raw content remains
ephemeral. See the [implementation plan](../../docs/inference-control/long-horizon-context-integrity-v1-implementation-plan.md),
[ADR](../../docs/adr/0020-long-horizon-context-integrity.md) and [threat
model](../../docs/security/long-horizon-context-integrity-threat-model.md).

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

## Heterogeneous inference intervention

The `./intervention` subpath provides one provider-neutral policy boundary for
pre-input and context assessment, trusted transformations, streamed token and
window checks, final-output release, tool/action gating and optional
representation-sidecar intervention. An adapter advertises a closed capability
set; construction fails when the policy requires a hook that the adapter cannot
enforce.

Durable state contains only identities, digests, counters, logical-time heads
and an invocation reservation. Raw inputs, context, multimodal payload handles,
tokens and model output remain volatile. A `modify` decision requires a trusted
transformation port and a verified receipt; otherwise the invocation is
blocked. Stable invocation IDs and CAS reservations make retries explicit and
prevent a conflicting request from reusing an invocation identity.

This boundary controls only calls routed through it. Provider cancellation,
distributed idempotency, monotonic storage anchors and downstream tool or
action fencing remain application responsibilities.

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

## Heterogeneous assessor ensemble

Import `@agentplat/inference-control/assessor-ensemble` to combine bounded,
request-bound votes from rule, model, classifier, representation and multimodal
assessors. Policy requires both vote count and independent-group coverage for
the requested surface and modalities. Missing, timed-out, conflicting,
same-group divergent or uncovered evidence produces `unresolved`; the supplied
operation gate dispatches only on an exact `allow` verdict.

Invocations are prepared durably before assessor calls. An exact retry of an
active reservation never masquerades as a blocked verdict: it requires an
authenticated reconciliation. A `confirmed_not_applied` receipt durably
authorizes only that same invocation digest to reclaim the reservation and
retry; any competing or changed invocation still fails closed. Completed
verdicts are idempotent, and an external monotonic anchor detects rollback.
Independence labels and assessor quality remain deployment attestations rather
than facts inferred by the runtime.

Governed role catalogs are nominal runtimes. Closed host currentness paths use
the catalog's module-owned resolver and its construction-time mission identity;
plain structural adapters, prototype-only objects, instance method replacement,
subclass overrides and later option rebinding cannot create an active role
binding.

## Anytime semantic guarantees

Import `@agentplat/inference-control/semantic-guarantees` when a control loop
will inspect semantic or coherence evidence repeatedly. The engine allocates a
separate absolute error budget to every metric and an inverse-quadratic budget
to every observation count. Its intervals therefore remain simultaneous over
all configured metrics and all emitted observation counts, subject to the
digested bounded-martingale and pre-observation selection assumptions.

State contains integer accumulators, counters and evidence digests only. A CAS
store plus a monotonically anchored state digest makes restart, exact retry,
equivocation and rollback behavior explicit. `createSemanticHorizonControlV1`
binds to the exact guarantee-policy and assumption digests, then emits
`continue`, `shorten_horizon`, `replan` or `safe_stop` with a bounded horizon.
The concrete engine and horizon control are nominal, construction-time-bound
runtimes. Their module-owned invokers and ECMAScript-private state transitions
ignore instance replacement and subclass overrides. Exhaustive output
validation rejects unknown directives, malformed bounds, inconsistent error
budgets and mismatched state/policy/assumption bindings before control can
authorize a tool or effect.

Null metrics are never silently discarded. `fail_closed` permanently stops
the bound from authorizing continued operation after a missing observation;
`worst_case_imputation` inserts zero for benefit metrics and 10,000 for risk
metrics; `predictable_skip` requires an assumption-evidence digest and is valid
only when the skip decision is fixed before the unavailable value could be
observed. These confidence sequences target the average conditional mean, not
a stationary population mean, causal effect, future outcome or proof that an
assessor is calibrated. See the [statistical contract and limits](../../docs/inference-control/anytime-semantic-guarantees-v1.md).

## Operational cognitive control

`OperationalCognitiveControllerV1` closes the provider-neutral control loop by
composing the existing black-box controller, optional representation controller,
heterogeneous intervention runtime and anytime guarantee engine. Four explicit
observer ports report role coherence, objective alignment, context conflict and
uncertainty at `pre_turn`, `post_turn`, `pre_tool` and `pre_effect` checkpoints.
Their content-free metric sample is committed to the configured confidence
sequence before the associated operation can continue.

`runTurn` applies memory, context and tool constraints before the inference port
is called. In representation-aware mode it also verifies and controls the
activation before execution. Output remains withheld when the horizon controller
requires `replan` or `safe_stop`, or when the output intervention gate blocks it.
`runPreTool` and `runPreEffect` accept callbacks and invoke them only after the
final gate, keeping the check adjacent to dispatch instead of returning a
detached authorization boolean.

The controller snapshots both intervention gate functions at construction, so
later mutation or rebinding cannot replace them with allow-all callbacks. A
`shorten_horizon` decision installs a non-refilling operational budget. Actual
inference, tool dispatch and effect commit each consume one step; repeated
shortening decisions can reduce but never refill it. Exhaustion blocks the
callback and returns `replan_required` or `semantic_horizon_exhausted` while
preserving immediate `replan` and `safe_stop` behavior.

The budget is a hash-chained CAS ledger bound to the guarantee state, control
policy, assumptions and directive. Supplying `horizonBudgetStore`,
`horizonBudgetMonotonicAnchor` and `horizonBudgetStateKey` preserves the exact
remaining count across process reconstruction and detects rollback. The
in-memory implementations support local composition and restart tests; closed
reference stacks require explicit durable state and anchor repositories.
Consumption tombstones are retained as an exact retry window. When a newer
guarantee creates a new consumption epoch and that window reaches its bound,
older epochs are folded into a hash-chained count/digest accumulator. Exact
retries remain idempotent while present in the window and fail closed after
compaction; new current-epoch work can continue without refilling a finite
horizon.

Pre-effect consumption IDs include the checkpoint kind, preventing an earlier
tool debit from authorizing an effect with the same operation ID. A durable
effect saga can reconcile an exact retained pre-effect debit and resume only
its callback after a crash, even if the guarantee sequence has since advanced.
If the required tombstone has already been compacted, replay is ambiguous and
fails closed instead of re-observing an old sequence.

Generic operational compositions may still install provider ports, but every
guarantee and decision is exhaustively validated and malformed output fails
closed. `isOperationalCognitiveControllerBoundToSemanticGuaranteesV1` is true
only when the controller captured the concrete engine and horizon identities;
the closed reference host requires this stronger nominal binding.

```js
import { OperationalCognitiveControllerV1 } from "@agentplat/inference-control/operational-control";

const control = new OperationalCognitiveControllerV1({
  controlId: "cognitive-control:primary",
  mode: "black_box",
  guaranteeStateKey: "semantic-guarantees:session-42",
  blackBoxPolicy,
  observers: { coherence, objective, context, uncertainty },
  intervention,
  guarantee,
  horizonControl,
  inference,
  observationSink,
});

const turn = await control.runTurn(turnRequest);
const tool = await control.runPreTool(toolRequest, () =>
  toolDispatcher(toolRequest),
);
const effect = await control.runPreEffect(effectRequest, () =>
  effectSink(effectRequest),
);
```

Observation sequences are caller-supplied so durable deployments can preserve
ordering across restarts. A turn consumes its declared sequence at `pre_turn`
and the following sequence at `post_turn`; later tool and effect checkpoints
must use strictly later values. The in-memory guarantee store is development
support. Production use still requires a durable CAS store, external monotonic
anchor and downstream-atomic effect fencing.

## Collective capability closure

Semantic Alignment & Agility Control V1 and Heterogeneous Agent Composition V1
are control-plane inputs to the collective capability closure. They publish
bounded, provider-neutral assessment and intervention evidence; neither a
model result, assessor vote nor provider adapter can create assignment or
effect authority. Unresolved, stale, unsupported or conflicting results must
remain restrictive at the receiving control gate.

Semantic requests retain no provider material or action payload, but their
canonical digest includes `materialDigest` and the exact pre-action payload
digest. A replay with different material or payload is rejected before a
cached decision can be returned. Successful action dispatch receives a
`SemanticActionAuthorizationV1` receipt binding the allow decision, current
policy and assessor set, authority, effect consumer, exact `sinkId` and
`sinkKeyDigest`, full action target, material, payload, committed revision and
a bounded logical-time window. A raw
SHA is not authority: the runtime resolves and authenticates the receipt through
the configured `SemanticActionAuthorizationAuthorityV1` immediately before the
effect. Dispatch requires a `SemanticActionEffectSinkV1` that atomically keys
the external effect by `authorizationDigest`; an exact retry returns the
original authenticated `SemanticActionEffectReceiptV1` without repeating the
effect. A sink with a different ID or key digest is rejected. Replicas using
the authorized sink identity must share the same atomic idempotency store. The
included in-memory
authority is process-local development support; production deployments need a
durable signed or MAC-authenticated lookup.

Authorization windows are inclusive at `validUntilLogicalTimeMs`. Verification
rejects a caller clock below the semantic state's logical-time high-water and
requires the exact allow request/decision record to remain in bounded state.
Later decisions do not revoke a retained receipt by themselves; policy,
assessor-set, binding, consumer or sink-identity change, receipt eviction,
explicit authority revocation, or expiry does. Size
`maximumRetainedDecisions` for the maximum
delay and number of simultaneously dispatchable proposals.

Action payload bytes are bounded before hashing or assessor work. Exploration
requests with candidates or a selected course fail closed when diversity or
novelty lacks configured independent-group coverage, and course history
advances only for a pre-step course that may actually proceed.

Heterogeneous composition derives checkpoint ordering from the portable
session's bounded `stepSequence`, not its lifecycle revision. Construction
therefore rejects manifests whose maximum step count cannot fit both semantic
and intervention policy ceilings, and requires an explicit logical-time ceiling
that fits the semantic policy. Output/action item indexes are bounded and form
disjoint sequence ranges within each step. The composed portable control runs
role and intervention prerequisites before semantic authorization. Returned
action proposals remain inert; dispatch them only through
`composition.actionGateway`, which reauthenticates the stored receipt, checks
expiry/current revision, proves the portable step and proposal were durably
committed, and compares the canonically encoded full proposal (`actionId`,
class, input, risk and metadata) at the effect boundary. Both the explicit
`currentLogicalTimeMs` argument to `runtime.dispatchAction` and the gateway's
`currentLogicalTimeMs` must come from a trusted monotonic source, never from
`request.logicalTimeMs` or other caller-controlled request data. Exactly-once
external effects require the sink
to co-locate its authorization-digest compare-and-set with the effect; the
gateway does not claim atomicity across an arbitrary downstream service.

Production integrations own provider identity, input/output redaction,
durable idempotency, logical time, current policy binding and any model-specific
security properties. The package exposes no scheduler or global agent graph.
See [ADR 0042](../../docs/adr/0042-collective-capability-closure.md) and the
[architecture and threat model](../../docs/security/collective-capability-closure-v1.md).
