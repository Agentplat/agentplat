# @agentplat/runtime

Provider-neutral agent runtime contracts and a small executable runtime.

`DefaultAgentRuntime` registers provider adapters by platform, dispatches runs and streams provider events. Model-provider adapters are separate packages so applications can choose their own providers and credential strategy.

`ChatAgentProvider` adapts the lower-level `@agentplat/model` contract to one
agent generation. It is appropriate for simple chat and generation. Providers
such as `@agentplat/provider-openai` remain available when an application needs
an SDK-managed agent loop and the provider-specific capabilities implemented by
that adapter.

`AgentStreamEvent` is a discriminated union. Completed events expose normalized
`usage`, `model`, `finishReason` and `latencyMs` when the provider reports them,
so higher-level orchestrators can preserve real accounting instead of
estimating tokens.

## Execution contract

Provider adapters must treat `RuntimeExecutionContext.signal` as a cooperative
cancellation request. Check it before starting work, pass it to downstream SDK
or network calls when supported, and stop starting new work or external effects
after it is aborted. This lets Room timeouts and lost execution leases cancel
the underlying provider operation.

`RuntimeExecutionContext.runId` is the idempotency key for a logical run. It is
operationally required whenever an adapter can produce an external effect or
the call can be retried: reject those operations when `runId` is absent and
reuse the same value across every retry. Forward it to providers that support
idempotency keys, or use it in the adapter's deduplication mechanism, so one
logical run cannot apply the same effect twice.

## Runtime checkpoints

Providers may declare support for `pre_action` through
`AgentProvider.supportedCheckpoints` and invoke the checkpoint callback supplied
in `RuntimeExecutionContext` immediately before starting a tool or external
effect. Higher-level runtimes use `pre_step` and `post_output` around provider
execution. A denied checkpoint must stop the provider before the protected
operation begins.

`DefaultAgentRuntime.supportsCheckpoint` lets callers fail closed before
invoking a provider that cannot enforce the required action boundary. Declared
support is a provider conformance contract; adapters must be tested to ensure
every protected path invokes `pre_action`.

## Durable cognitive effects

`CognitiveAgentRuntimeV2` treats `memory_mutation` and `tool` as effectful. An
adapter that advertises either operation must provide both an explicit
`CognitiveDurableOperationStoreV2` and a `CognitiveEffectSinkV2`; construction
fails closed when either boundary is absent. The runtime never dispatches these
operations through the adapter's general `execute` method.

Before dispatch, the durable store atomically reserves the tuple
`tenantId/sessionId/operationId`, binds it to the complete request digest, and
claims the expected session revision. The sink receives a stable idempotency
key and request digest. Its `apply` implementation must atomically deduplicate
that pair, while `lookup` must return the durable sink receipt/result for crash
reconciliation. The store then atomically moves the operation from `prepared`
to `applied` together with the session-state CAS. Replays return the recorded
outcome, conflicting request digests fail, and a second operation cannot spend
the same session revision. Durable operation records omit request payloads but
retain the applied result and original outcome for exact replay, so production
stores must encrypt and govern that output according to its data classification.
A `prepared` record whose sink state cannot be established remains claimed and
blocks that session revision; operators must reconcile it rather than deleting
the reservation and risking a duplicate effect.

This protocol prevents duplicate logical application only when the configured
sink honors its idempotency contract. It does not claim exactly-once delivery
to an arbitrary external system: integrations must use an idempotent downstream
API or durably reconcile their own receipt before reporting success. The
in-memory store is intended for local execution and deterministic tests; a
multi-process deployment must supply a transactional durable implementation.

## Portable heterogeneous agents

`@agentplat/runtime/adapter` adds a stateful protocol for language, vision,
action, policy, symbolic, hybrid and custom agents. A manifest declares the
modalities, interaction modes, cancellation behavior and recovery support of
one immutable adapter implementation. Applications negotiate those capabilities
before opening a session, so incompatible peers fail before execution.

`PortableAgentSessionRuntimeV1` binds every session to an adapter implementation,
a versioned local control implementation and a revisioned role. Each step uses
compare-and-set state, a stable idempotency key and explicit source zones for
observations. Outputs and inert action proposals remain withheld until the
configured control approves the relevant pre-step, post-output and pre-action
checkpoints. Control errors fail closed.

Sessions can be paused, checkpointed, restored, assigned a successor role and
closed. Adapters may implement the paired `exportCheckpoint` and
`importCheckpoint` hooks to move portable application state between unused
sessions bound to the exact same adapter version and implementation. Imports
are digest-checked, pause before restore and are idempotent for the same
transfer. Role updates must form an unbroken revision chain for the same
objective. Ephemeral credentials are supplied only to the adapter call and are
never persisted, exported or shown to controls.

Two bridges connect this protocol to the existing runtime:

- `createAgentRuntimePortableAdapterV1` exposes an existing `AgentRuntime`
  agent through the portable protocol without granting tool calls action
  authority.
- `createPortableAgentProviderV1` exposes a portable session as an
  `AgentProvider`, allowing workflows and collectives to use the controlled,
  stateful execution path through `DefaultAgentRuntime`.
