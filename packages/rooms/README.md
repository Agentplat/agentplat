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

## Promote a Session

`promoteSessionToRoom` atomically turns a completed ephemeral simulation into a
governed Room through `RoomService`. Session speakers become Room participants
and the bounded Session transcript becomes ordinary Room messages; no second
durable simulation model is introduced.

```ts
import { promoteSessionToRoom } from '@agentplat/rooms';

const promotion = await promoteSessionToRoom(service, {
  tenantId: 'tenant-a',
  session: sessionResult,
  speakers,
  room: {
    title: 'Approved negotiation',
    goal: 'Review and operationalize the simulated agreement',
  },
});
```

Incomplete sessions require `allowIncomplete: true`. Promotion records source
session, turn and timestamp metadata so consumers do not mistake the imported
transcript for messages originally authored inside the Room lifecycle.
