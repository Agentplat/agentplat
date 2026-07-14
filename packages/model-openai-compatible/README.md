# @agentplat/model-openai-compatible

A dependency-light `ModelAdapter` for servers that implement the OpenAI Chat
Completions wire format. It uses the platform `fetch` implementation and does
not install an OpenAI SDK.

```ts
import { OpenAICompatibleModelAdapter } from '@agentplat/model-openai-compatible';

const model = new OpenAICompatibleModelAdapter({
  apiKey: process.env.OPENAI_API_KEY,
  defaultModel: process.env.OPENAI_MODEL,
});
```

Set `baseURL` and `requireApiKey: false` for a trusted local compatible server.
Provider capabilities and parameter support vary. Use
`@agentplat/provider-openai` when an application needs the OpenAI Agents SDK
runner and the provider-specific capabilities implemented by that adapter.
