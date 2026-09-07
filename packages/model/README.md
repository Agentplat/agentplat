# @agentplat/model

Provider-neutral contracts for direct model generation and streaming.

## Installation (developer preview)

Install the coordinated preview explicitly:

```sh
npm install @agentplat/model@next
```

Keep all `@agentplat/*` packages on the same release version. npm's default
`latest` tag can point to an older preview. See the
[release channels](https://github.com/Agentplat/agentplat/blob/main/docs/release-channels.md)
for distribution status and version selection.

Use this layer for simple chat or text-generation providers. It intentionally
does not own an agent loop, tool execution, approvals, handoffs, persistence or
Room lifecycle. Those concerns remain in `@agentplat/runtime` and
`@agentplat/rooms`.

Provider SDKs belong in separate adapter packages. Applications that do not
install those packages do not inherit their dependencies.
