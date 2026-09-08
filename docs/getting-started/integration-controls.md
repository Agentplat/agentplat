# Connect controls to the execution path

## Drafts, approvals and effects are distinct

The proposal API demo generates drafts and approves artifacts. It does not
execute protected external effects. The separate `demo:controls` host uses:

```js
const service = new RoomService({
  repository,
  runtime,
  requireProtectedActionCheckpoints: true,
});
```

The library default remains false for compatibility. With this option enabled,
protected tasks require a runtime that declares `pre_action` support. The
provider must also **await the checkpoint before each protected effect**.
Declaring support alone does not intercept arbitrary provider code.

The controls demo requests and grants task approval through RoomService, then
uses the existing `onCheckpoint` hook to demonstrate an independent denial.
The HTTP run endpoint does not accept executable hooks from request bodies.
Hosts integrate checkpoint policy on the server, never as client-supplied code.

Run from the repository root with a development PostgreSQL environment:

```sh
corepack pnpm --dir examples/rooms-api demo:controls
```

The script asserts approval is required before provider execution, rejection
before an incompatible provider runs, and checkpoint denial before a local
effect. It simulates response loss after the effect commits and retries with
the same task identity. A PostgreSQL unique key admits one fixed-payload local
receipt. The example-owned effect schema is removed afterward; Room history
remains. No domain migration is introduced.

This sink proves idempotency for one fixed local payload. Real sinks must bind
identity to payload and scope, reconcile ambiguous outcomes and atomically
apply their own idempotency/fencing rules. A checkpoint, Room approval or
PostgreSQL adapter cannot make an arbitrary external API exactly-once.

## Integrate verified identity

`createRoomsApp` accepts the existing `RoomsAuthenticator` through `auth`:

```ts
import { createRoomsApp, type RoomsAuthenticator } from "@agentplat/rooms-api";

// Application-owned verifier: validates signature/session, issuer, audience,
// expiry and organization membership; returns no identity on failure.
const auth: RoomsAuthenticator = async (request) => {
  const identity = await verifyApplicationIdentity(request);
  if (!identity) return null;
  return { tenantId: identity.organizationId, actorId: identity.userId };
};
const app = createRoomsApp({ service, auth });
```

`verifyApplicationIdentity` is an application integration point, not an exported
AgentPlat function. Do not derive tenant identity from an unverified header or
JWT payload. Reject missing/invalid identities and unauthorized organizations.
The reference header authenticator is only a trusted development boundary.

Tenant authentication does not automatically bind every request-body actor
field to the authenticated user. Apply application authorization to actor IDs,
`decidedBy`, participant creation and permissions before forwarding requests.
Verify cross-tenant rejection and attempted actor impersonation in your host.
See the [Rooms API contract](../../packages/rooms-api/README.md).
