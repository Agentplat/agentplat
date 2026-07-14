# @agentplat/runtime

Provider-neutral agent runtime contracts and a small executable runtime.

`DefaultAgentRuntime` registers provider adapters by platform, dispatches runs and streams provider events. Model-provider adapters are separate packages so applications can choose their own providers and credential strategy.

`ChatAgentProvider` adapts the lower-level `@agentplat/model` contract to one
agent generation. It is appropriate for simple chat and generation. Providers
such as `@agentplat/provider-openai` remain available when an application needs
an SDK-managed agent loop and the provider-specific capabilities implemented by
that adapter.

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
