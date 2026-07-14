# @agentplat/model

Provider-neutral contracts for direct model generation and streaming.

Use this layer for simple chat or text-generation providers. It intentionally
does not own an agent loop, tool execution, approvals, handoffs, persistence or
Room lifecycle. Those concerns remain in `@agentplat/runtime` and
`@agentplat/rooms`.

Provider SDKs belong in separate adapter packages. Applications that do not
install those packages do not inherit their dependencies.
