# `@agentplat/rooms-api`

Hono transport adapter for the public AgentPlat Agent Room framework. The
package contains no database, runtime, or web-server choice: applications
inject a `RoomService` and mount the returned Hono app in their preferred
server.

## Installation (developer preview)

Install the coordinated preview explicitly:

```sh
npm install @agentplat/rooms-api@next
```

Keep all `@agentplat/*` packages on the same release version. npm's default
`latest` tag can point to an older preview. See the
[release channels](https://github.com/Agentplat/agentplat/blob/main/docs/release-channels.md)
for distribution status and version selection.

```ts
import { createRoomsApp } from "@agentplat/rooms-api";

const app = createRoomsApp({ service });
export default app;
```

By default every route except `GET /health` requires an
`X-Agentplat-Tenant-Id` header. This is a trusted local-development boundary,
not an authentication protocol. A production application should inject an
authenticator that resolves its verified identity to an AgentPlat
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
- `POST /approvals/:approvalId/expire` (authorized machine/system actor only)
- `GET /rooms/:roomId/events` (optional `cursor` and `limit` for bounded pages)

When an optional `RoomExecutionCoordinator` is injected:

- `GET /rooms/:roomId/execution-sessions/:sessionId`
- `POST /rooms/:roomId/execution-sessions/:sessionId/interventions`
- `GET /rooms/:roomId/execution-sessions/:sessionId/events?after=...`

Applications may additionally inject an execution event stream to expose
`GET /rooms/:roomId/execution-sessions/:sessionId/events/stream` using the
versioned AgentPlat SSE envelope. Authenticated actor identity overrides any
request-body participant identifier.

When an optional `AgentDefinitionRegistry` is injected:

- `POST /agents`
- `POST /agents/:agentId/revisions`
- `GET /agents/:agentId/revisions`
- `GET /agents/:agentId/revisions/:revisionId`
- `POST /agents/:agentId/revisions/:revisionId/publish`
- `POST /agents/:agentId/revisions/:revisionId/deprecate`

Tenant scope always comes from the configured authenticator. Lifecycle writes
require the expected lifecycle revision.

When an optional `AgentRoomHandoffCoordinator` is injected:

- `POST /rooms/:roomId/handoffs`
- `GET /rooms/:roomId/handoffs/:handoffId`
- `POST /rooms/:roomId/handoffs/:handoffId/accept|reject`
- `POST /rooms/:roomId/handoffs/:handoffId/bind-run|reconcile`

Authenticated actor identity overrides source, acceptance and rejection
participant identifiers supplied in request bodies.

When an optional `HumanContributionCoordinator` is injected:

- `POST /rooms/:roomId/human-contributions`
- `GET /rooms/:roomId/human-contributions/:contributionId`
- `POST /rooms/:roomId/human-contributions/:contributionId/assign`
- `POST /rooms/:roomId/human-contributions/:contributionId/start|complete|cancel`

Authenticated actor identity overrides requester and lifecycle actor IDs.

With both human contributions and work management configured:

- `POST /rooms/:roomId/human-contributions/:id/deliveries/:providerId`
- `POST /rooms/:roomId/human-contributions/:id/deliveries/:providerId/retry`
- `GET /rooms/:roomId/work-management/metrics`

When a `KnowledgeBundleRegistry` is injected:

- `POST /knowledge-bundles/:bundleId/revisions`
- `GET /knowledge-bundles/resolve?reference=...`
- `GET /knowledge-bundles/documents/:documentId?reference=...`

When `AgentRoomLiveViewService` is injected:

- `GET /rooms/:roomId/live`
- `GET /rooms/:roomId/live/stream`

Optional query parameters filter coordination, execution-session, Handoff and
human-contribution projections. When they are omitted, configured stores are
queried by Room and all known projections are discovered automatically. The
returned composite cursor resumes every event source independently.

With planning and participant membership configured:

- `POST /rooms/:roomId/plans`
- `GET /rooms/:roomId/plans/:planId`
- `POST /rooms/:roomId/plans/:planId/materialize`
- `POST /rooms/:roomId/plans/:planId/replan`
- `POST /rooms/:roomId/plans/reconcile`
- `PUT|PATCH /rooms/:roomId/participants/:participantId/membership`
- `GET /rooms/:roomId/participant-memberships`

`GET /rooms/:roomId` returns the complete aggregate projection produced by
the domain service, including participants, transcript, tasks, artifacts and
versions, approvals, policy and memory context, runs, tool calls, child rooms,
and ordered audit events.

## Agent governance endpoints (source preview)

The optional `agentGovernance` service exposes configuration reads, paged history
and controlled operations under `/agents/:agentId/governance`. It authenticates
raw requests independently; the development tenant header is not owner identity.
See [governance configuration](../../docs/agent-governance/configuration.md).

## Inception endpoints (source preview)

The optional `agentInceptions` service adds intake and assessment history beneath
`/rooms/:roomId/agents/:agentId/inceptions`. It independently authenticates raw
requests and distinguishes submit, assess and read permissions. These endpoints
never dispatch tasks. See [inception usage](../../docs/agent-governance/inceptions.md).

## Attention signal endpoints (source preview)

The optional `attentionSignals` service exposes candidate definitions/references,
source observations, current coverage and worker operations under
`/agents/:agentId/attention`. Raw-request authentication distinguishes owner,
collector and worker permissions. See [signals](../../docs/agent-governance/signals.md).

## Execution limit endpoints (source preview)

The optional `executionLimits` service publishes/reads immutable limit candidates
under `/agents/:agentId/execution-limits`. Owner-only staged activation uses the
existing authenticated governance operations endpoint. No refund or effect-settlement
endpoint accepts unverified claims. See [execution](../../docs/agent-governance/execution.md).

## Qualified purpose mission endpoints (source preview)

The optional `purposeMissions` service exposes authenticated issue, revise, cancel,
evaluate, outcome review and history under `/agents/:agentId/purpose-missions/:missionId`.
Clients cannot supply an assessor verdict or bypass the existing effect path.
See [missions](../../docs/agent-governance/missions.md).
