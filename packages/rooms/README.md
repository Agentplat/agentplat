# @agentplat/rooms

Infrastructure-neutral Agent Room domain contracts and lifecycle services.

`RoomService` coordinates room state, participants, messages, tasks, artifacts,
approvals, policy checks, bounded context and durable domain events. Storage,
agent execution and event delivery are injected through public interfaces.

```ts
import { InMemoryRoomRepository, RoomService } from '@agentplat/rooms';

const service = new RoomService({
  repository: new InMemoryRoomRepository(),
});

const room = await service.createRoom('tenant-a', {
  title: 'Product launch',
  goal: 'Prepare a launch brief',
});
```

Use `@agentplat/rooms-postgres` for durable self-hosted deployments. The
in-memory repository is intended for tests and examples.
