# @agentplat/runtime-mock

A deterministic AgentPlat provider for local development, examples and tests.
It performs no network or model calls and returns a draft artifact-shaped result.

## Installation (developer preview)

Install the coordinated preview explicitly:

```sh
npm install @agentplat/runtime-mock@next
```

Keep all `@agentplat/*` packages on the same release version. npm's default
`latest` tag can point to an older preview. See the
[release channels](https://github.com/Agentplat/agentplat/blob/main/docs/release-channels.md)
for distribution status and version selection.

For UI and transport tests it also supports ordered `responses`, exact
`streamEvents`, token chunks, deterministic delays and a one-based
`failAtCall`. The final scripted response is reused after the sequence is
exhausted, keeping repeated tests deterministic.

Multi-agent simulations can use `responsesByAgent` or
`streamEventsByAgent`. Each agent has an independent invocation counter, so
reordering speakers does not consume the wrong response tape.

```ts
import { createMockRuntime } from "@agentplat/runtime-mock";

const runtime = createMockRuntime({
  responsesByAgent: {
    buyer: ["Offer 1", "Offer 2"],
    seller: ["Counter 1", "Counter 2"],
  },
});
```
