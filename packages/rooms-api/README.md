# `@agentplat/rooms-api`

Hono transport adapter for the public Agentplat Agent Room framework. The
package contains no database, runtime, or web-server choice: applications
inject a `RoomService` and mount the returned Hono app in their preferred
server.

```ts
import { createRoomsApp } from '@agentplat/rooms-api';

const app = createRoomsApp({ service });
export default app;
```

By default every route except `GET /health` requires an
`X-Agentplat-Tenant-Id` header. This is a trusted local-development boundary,
not an authentication protocol. A production application should inject an
authenticator that resolves its verified identity to an Agentplat
`TenantContext`:

```ts
const app = createRoomsApp({
  service,
  auth: async (request) => {
    const identity = await authenticateWithYourIdentityProvider(request);
    return identity ? { tenantId: identity.tenantId } : null;
  },
});
```

Successful API responses use `{ "data": ... }`; errors use
`{ "error": { "code", "message", "details"? } }`. Tenant IDs supplied in
request bodies or query parameters are ignored—the authenticated tenant is
always authoritative.

Adapter error details are hidden by default. `exposeErrorDetails: true` is
available for local debugging and should not be enabled on an internet-facing
deployment.

## Routes

- `GET /health`
- `POST /rooms`, `GET /rooms`
- `GET /rooms/:roomId`, `PATCH /rooms/:roomId`
- `POST /rooms/:roomId/pause|resume|complete|archive`
- `POST /rooms/:roomId/participants`
- `POST /rooms/:roomId/messages`
- `POST /rooms/:roomId/tasks`
- `POST /rooms/:roomId/tasks/:taskId/run`
- `POST /rooms/:roomId/artifacts`
- `POST /rooms/:roomId/artifacts/:artifactId/versions`
- `POST /rooms/:roomId/approvals`
- `POST /approvals/:approvalId/approve|reject|request-revision`
- `GET /rooms/:roomId/events`

`GET /rooms/:roomId` returns the complete aggregate projection produced by
the domain service, including participants, transcript, tasks, artifacts and
versions, approvals, policy and memory context, runs, tool calls, child rooms,
and ordered audit events.
