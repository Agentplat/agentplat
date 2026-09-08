# `@agentplat/provider-openai`

OpenAI Agents SDK adapter for `@agentplat/runtime`.

## Installation (developer preview)

Install the coordinated preview explicitly:

```sh
npm install @agentplat/provider-openai@next
```

Keep all `@agentplat/*` packages on the same release version. npm's default
`latest` tag can point to an older preview. See the
[release channels](https://github.com/Agentplat/agentplat/blob/main/docs/release-channels.md)
for distribution status and version selection.

The adapter creates an isolated SDK runner for every execution. Supply credentials
through `RuntimeExecutionContext.credentials` or an `apiKeyResolver`; it does not
mutate the process-wide OpenAI configuration.

```ts
import { OpenAIAgentProvider } from "@agentplat/provider-openai";
import { DefaultAgentRuntime } from "@agentplat/runtime";

const runtime = new DefaultAgentRuntime();
runtime.registerProvider("openai", new OpenAIAgentProvider());

const result = await runtime.run(
  {
    id: "agent-1",
    tenantId: "tenant-1",
    name: "Support agent",
    platform: "openai",
    modelName: "gpt-5.4-mini",
    instructions: "Answer concisely.",
  },
  { input: "Hello" },
  {
    agentId: "agent-1",
    tenant: { tenantId: "tenant-1" },
    credentials: { openaiApiKey: process.env.OPENAI_API_KEY! },
  },
);
```

Never store API keys in agent definitions or metadata.
