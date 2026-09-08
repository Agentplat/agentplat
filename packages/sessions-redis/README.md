# `@agentplat/sessions-redis`

Redis pub/sub implementation of `SessionRegistry` for multi-instance services.
It stores only `sessionId -> owner instance` leases in Redis. The
`AbortController` stays in the ECS task or Node process that owns the live
provider stream; remote stop requests are routed to that owner over pub/sub.

## Installation (developer preview)

Install the coordinated preview explicitly:

```sh
npm install @agentplat/sessions-redis@next
```

Keep all `@agentplat/*` packages on the same release version. npm's default
`latest` tag can point to an older preview. See the
[release channels](https://github.com/Agentplat/agentplat/blob/main/docs/release-channels.md)
for distribution status and version selection.

Use separate command and subscriber connections (node-redis requires a
dedicated connection while subscribed):

```ts
import { createClient } from "redis";
import { createRedisSessionRegistry } from "@agentplat/sessions-redis";

const command = createClient({ url: process.env.REDIS_URL });
const subscriber = command.duplicate();
await Promise.all([command.connect(), subscriber.connect()]);

export const sessions = await createRedisSessionRegistry({
  command,
  subscriber,
  prefix: "agentplat:orders:prod",
});
```

The prefix is an application/environment trust boundary, not a replacement for
authorization. Continue to authenticate the stop endpoint and verify that the
caller can control the requested session. The adapter does not close the
application-owned Redis clients when `registry.close()` is called.

Redis pub/sub is an online control plane, not a durable event log. A stop sent
after the owner lease expires returns false; use `SessionEventSink` for durable
session history.
