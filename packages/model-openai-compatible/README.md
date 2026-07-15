# @agentplat/model-openai-compatible

A dependency-light `ModelAdapter` for servers that implement the OpenAI Chat
Completions wire format. It uses the platform `fetch` implementation and does
not install an OpenAI SDK.

```ts
import { chatModel } from '@agentplat/model-openai-compatible';

const model = chatModel({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  defaultModel: process.env.OPENAI_MODEL,
});
```

`chatModel` has SDK-free presets for `openai`, `gemini`, `ollama` and
`openrouter`. Use `compatible` with an explicit `baseURL` for another
Chat-Completions server:

```ts
const localModel = chatModel({
  provider: 'compatible',
  baseURL: 'http://localhost:1234/v1',
  requireApiKey: false,
  defaultModel: 'local-model',
});
```

The adapter does not read environment variables. Provider capabilities and
parameter support vary. For a provider with a non-compatible HTTP protocol,
implement the small public `ModelAdapter` interface from `@agentplat/model`.
Use
`@agentplat/provider-openai` when an application needs the OpenAI Agents SDK
runner and the provider-specific capabilities implemented by that adapter.
