# @agentplat/model-openai-compatible

A dependency-light `ModelAdapter` for servers that implement the OpenAI Chat
Completions wire format. It uses the platform `fetch` implementation and does
not install an OpenAI SDK.

## Installation (developer preview)

Install the coordinated preview explicitly:

```sh
npm install @agentplat/model-openai-compatible@next
```

Keep all `@agentplat/*` packages on the same release version. npm's default
`latest` tag can point to an older preview. See the
[release channels](https://github.com/Agentplat/agentplat/blob/main/docs/release-channels.md)
for distribution status and version selection.

```ts
import { chatModel } from "@agentplat/model-openai-compatible";

const model = chatModel({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY,
  defaultModel: process.env.OPENAI_MODEL,
});
```

`chatModel` has SDK-free presets for `openai`, `gemini`, `ollama`,
`openrouter`, `groq`, `mistral`, `azure` and `bedrock`. Azure and Bedrock require
an explicit `baseURL`. Use `compatible` with an explicit `baseURL` for another
Chat-Completions server:

```ts
const localModel = chatModel({
  provider: "compatible",
  baseURL: "http://localhost:1234/v1",
  requireApiKey: false,
  defaultModel: "local-model",
});
```

The adapter does not read environment variables. Provider capabilities and
parameter support vary. For a provider with a non-compatible HTTP protocol,
implement the small public `ModelAdapter` interface from `@agentplat/model`.
Use
`@agentplat/provider-openai` when an application needs the OpenAI Agents SDK
runner and the provider-specific capabilities implemented by that adapter.

## Groq and Mistral presets

Both presets use the same `ModelAdapter` contract and Chat Completions transport;
no provider SDK is required. They require an API key by default:

| Provider | Default base URL |
| --- | --- |
| `groq` | `https://api.groq.com/openai/v1` |
| `mistral` | `https://api.mistral.ai/v1` |

```ts
const groqModel = chatModel({
  provider: "groq",
  apiKey: process.env.GROQ_API_KEY,
  defaultModel: process.env.GROQ_MODEL,
});

const mistralModel = chatModel({
  provider: "mistral",
  apiKey: process.env.MISTRAL_API_KEY,
  defaultModel: process.env.MISTRAL_MODEL,
});
```

The application reads these environment variables explicitly. Supply a model
through `defaultModel` or each request's `model`. Existing `apiKeyResolver`,
execution-scoped credentials, `baseURL`, `requireApiKey` and `capabilities`
overrides also apply to these presets.

These presets select endpoints and authentication defaults; they do not add
provider-specific APIs or guarantee every model supports tools, vision or
structured output. Check [Groq compatibility](https://console.groq.com/docs/openai)
and [Mistral compatibility](https://docs.mistral.ai/resources/migration-guides)
for parameter differences. For example, Groq does not support `messages[].name`.
The shared adapter does not translate every provider-specific parameter.
Tests use mocked HTTP responses and do not establish live-provider validation.

## Azure OpenAI / Microsoft Foundry and Amazon Bedrock

These presets use the providers' OpenAI-compatible **Chat Completions** APIs.
Both require an explicit `baseURL` and a key/token by default. They also work
through `AgentPlat.ask` and `AgentPlat.configure` with the same options.

```ts
const azureModel = chatModel({
  provider: "azure",
  baseURL: process.env.AZURE_OPENAI_BASE_URL,
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  defaultModel: process.env.AZURE_OPENAI_MODEL,
});
// AZURE_OPENAI_BASE_URL=https://YOUR-RESOURCE.openai.azure.com/openai/v1
// AZURE_OPENAI_MODEL is your deployment name, not necessarily the model name.

const bedrockModel = chatModel({
  provider: "bedrock",
  baseURL: process.env.BEDROCK_BASE_URL,
  apiKey: process.env.BEDROCK_API_KEY,
  defaultModel: process.env.BEDROCK_MODEL,
});
// BEDROCK_BASE_URL=https://bedrock-runtime.YOUR-REGION.amazonaws.com/openai/v1
// BEDROCK_API_KEY is an Amazon Bedrock API key, not an AWS access key ID.
```

Supply the complete API root, without `/chat/completions`. Missing or blank
URLs are rejected before any request; no Azure resource or AWS region is
selected implicitly. Choose a deployed model supported by Chat Completions in
the selected resource/region. A custom endpoint can be supplied for a supported
Foundry or Bedrock Mantle deployment; confirm its API root with the provider.

Credentials are sent as `Authorization: Bearer`. Azure v1 accepts API keys and
Microsoft Entra tokens; for a refreshing Entra token use the existing
`apiKeyResolver: async (context) => ...` to obtain a token per execution.
Applications own token acquisition, scopes and refresh. Execution-scoped
`credentials.apiKey` is also supported. The Bedrock preset uses a Bedrock bearer
API key; it does not resolve an AWS credential chain or sign SigV4 requests.
This is not a Converse, InvokeModel, legacy Azure deployment API or Responses
API adapter. No cloud SDK dependency is added.

Provider references:
[Azure v1 API and authentication](https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle),
[Bedrock Chat Completions and authentication](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html).

## Joint provider smoke test

From the repository, after building the adapter and its dependencies, run:

```sh
node scripts/smoke-model-providers.mjs
node scripts/smoke-model-providers.mjs --providers=groq,mistral,azure,bedrock
# Explicit live execution: two requests per selected provider, may incur charges.
node scripts/smoke-model-providers.mjs --providers=groq,mistral,azure,bedrock --live
```

Without `--live`, the script only checks configuration and makes no network
requests. Without `--providers`, it selects all eight named presets. `compatible`
is a generic endpoint option and is not part of the named-provider cohort.
Configure the selected providers with these environment variable prefixes:

| Preset | Prefix | Required suffixes |
| --- | --- | --- |
| `openai` | `OPENAI` | `_MODEL`, `_API_KEY` |
| `gemini` | `GEMINI` | `_MODEL`, `_API_KEY` |
| `ollama` | `OLLAMA` | `_MODEL` |
| `openrouter` | `OPENROUTER` | `_MODEL`, `_API_KEY` |
| `groq` | `GROQ` | `_MODEL`, `_API_KEY` |
| `mistral` | `MISTRAL` | `_MODEL`, `_API_KEY` |
| `azure` | `AZURE_OPENAI` | `_MODEL`, `_API_KEY`, `_BASE_URL` |
| `bedrock` | `BEDROCK` | `_MODEL`, `_API_KEY`, `_BASE_URL` |

`_BASE_URL` can override any preset endpoint; `_API_KEY` is optional for Ollama.
The script validates the entire selected cohort before sending requests. Each
provider must return nonempty text for both generation and streaming, with a
60-second timeout per call. It continues after a provider failure and exits
nonzero if any selected provider fails. Output includes provider status and
missing variable names, never keys, endpoint values, prompts, responses or raw
provider errors. This smoke test covers basic connectivity and text streaming;
it does not qualify tools, vision, structured output or production behavior.
The native Anthropic/Gemini adapters and OpenAI Agents SDK runner are separate
integrations, outside this compatible-preset smoke test.
