# First execution

## Requirements and packages

Use Node.js 22.13+, Git and the repository's Corepack-managed pnpm version.
The local deterministic example imports `@agentplat/framework` and
`@agentplat/runtime-mock`. No database, Docker or model key is required.

From a fresh clone:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm run example:quick
```

Expected: `Hello from the deterministic AgentPlat quick run.` The command
builds workspace packages before running the example.

## Connect a model explicitly

For a downstream application, select the coordinated registry channel described
in [release channels](../release-channels.md). Check its version first:

```sh
npm view @agentplat/framework dist-tags --json
npm install @agentplat/framework@next
```

Use this server-side code with a provider key supplied by your environment:

```js
import { AgentPlat } from "@agentplat/framework";
const answer = await AgentPlat.ask({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL,
  prompt: "Draft a short internal pilot proposal.",
});
console.log(answer);
```

Set both variables deliberately. Running this code sends the prompt to the
provider and may incur charges. Provider output is not deterministic.
For other endpoints, see the [model adapter](../../packages/model-openai-compatible/README.md).

## Limits and next step

`ask` and `quickRun` are ephemeral. They do not create durable Rooms, approvals
or protected action controls. Keep credentials in server code.
Next: [persistent human-agent collaboration](persistent-collaboration.md), or
[the framework guide](../../packages/framework/README.md) for streaming and sessions.
