# @agentplat/runtime-mock

A deterministic AgentPlat provider for local development, examples and tests.
It performs no network or model calls and returns a draft artifact-shaped result.

For UI and transport tests it also supports ordered `responses`, exact
`streamEvents`, token chunks, deterministic delays and a one-based
`failAtCall`. The final scripted response is reused after the sequence is
exhausted, keeping repeated tests deterministic.

```ts
import { createMockRuntime } from '@agentplat/runtime-mock';

const runtime = createMockRuntime();
```
