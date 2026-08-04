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
closed. Checkpoints cannot move between adapter implementations, and role
updates must form an unbroken revision chain for the same objective. Ephemeral
credentials are supplied only to the adapter call and are never persisted or
shown to controls.

Two bridges connect this protocol to the existing runtime:

- `createAgentRuntimePortableAdapterV1` exposes an existing `AgentRuntime`
  agent through the portable protocol without granting tool calls action
  authority.
- `createPortableAgentProviderV1` exposes a portable session as an
  `AgentProvider`, allowing workflows and collectives to use the controlled,
  stateful execution path through `DefaultAgentRuntime`.
