# Native Room conversations and selective Planner context

This additive implementation is available in the [verified AgentPlat 1.5.0 cohort](../releases/1.5.0-distribution.md). It supplies conversation primitives, not a user interface or a provider connector.

## Messages and replies

`RoomService.sendMessage` accepts `startThread: true`, or an existing `threadId` and/or `replyToMessageId`. A new root uses its own message ID as `threadId`; replies inherit the root from storage. Passing just `threadId` replies to that root. A legacy unthreaded message can be a root without rewriting it. References must resolve inside the current tenant and Room; self-replies, mismatched roots and reuse of an ID with another conversation or direct recipient are rejected.

`targetParticipantId` explicitly addresses an existing Room participant. It is independent of replying: replying to an agent does not implicitly address that agent. Application policy decides whether this recipient bypasses Planner. Old inputs without conversation fields retain their previous behavior. Opt-in native fields fail closed if a custom repository has not declared `conversationVersion: 1`.

```ts
const root = await rooms.sendMessage(tenantId, roomId, {
  role: 'human', content: 'Review this obligation', startThread: true,
});
const reply = await rooms.sendMessage(tenantId, roomId, {
  role: 'human', content: '@Mail check the new evidence',
  replyToMessageId: root.id, targetParticipantId: mailParticipantId,
});
const page = await rooms.listMessages(tenantId, roomId, {
  threadId: root.id, limit: 50,
});
```

`getMessage` performs scoped lookup. `listMessages` supports thread pages or `rootsOnly` pages with an opaque keyset cursor and a limit of 1–200. The cursor binds tenant, Room and query mode, and preserves timestamp/ID ordering across adapters. Pages are forward reads, not frozen snapshots: later insertions after the cursor may appear. `rootsOnly` and `threadId` are mutually exclusive. The optional `conversations` port in `createRoomsApp` exposes authenticated GET message/page routes; the application still owns user-to-Room authorization.

## Task context

Tasks accept the same native conversation references. `BoundedContextBuilder` defaults a threaded task to that thread, artifacts whose message provenance is entirely in the selected conversation, and readable memory explicitly belonging to that thread, shared memory or that agent's own memory. Old tasks remain Room-scoped.

The trusted host can supply `selectContext` to give a coordinator Room-wide context or to include specific additional messages, artifacts and memory for a delegated task. Model task arguments cannot configure that callback. Tenant/Room membership is validated before host selection. Context selection does not grant tool permissions: a host exposing retrieval tools must apply equivalent scope checks at those tool sinks.

Threaded contexts have a default 64,000-byte serialized limit; hosts can override `maximumContextBytes`. Whole context entries are omitted rather than modifying persisted evidence. The task's reply anchor is retained when transcript is enabled; if the required context cannot fit, assembly fails. Provenance identifies included records and the count of omitted thread messages. Bounds are not claims of complete historical coverage.

## Planner and workflow continuity

`RoomPlannerEvent`, tasks, objectives, operations, calls and delivery notifications carry conversation references. Threaded human events also specify `messageId`, the actual stored message rather than the event ID. A host must provide `resolveConversation`; it can delegate to `resolveRoomConversation(repository, tenantId, roomId, reference)` after current authorization.

Planner validates the message and root before intake. It binds resulting tasks and responses to that conversation, ignoring model-authored task scope. Internal result/review/resume events retain the binding. Replanning cannot redirect an existing objective into another thread, and unchanged completed task identities retain their original bindings. Workflow inputs persist these references and reject a replay with a different payload or conversation.

Direct-route events are recorded and their known results remain in the durable Planner state; they do not require a second model invocation to acknowledge them. The host supplies Planner's authorized context, including relevant direct exchanges. `external` and `timer` event kinds require source provenance. They can inform a response or continue an existing objective; they cannot create a new owner objective or invoke the direct-participant route. A host must verify connectors, timer identity and occurrence evidence before resolving such events.

No method here installs a worker, creates a Gmail watch or changes the application's default routing. Those are application composition choices. No paid inference is used by the deterministic fixtures.

## PostgreSQL adoption and verification

Run the explicit Room migration through **020_room_conversations** before using native conversation fields. It adds optional message/task columns, same-Room reference constraints and pagination indexes. Historical messages and task data remain intact. Legacy writes can still operate against an older schema; native writes and indexed thread queries require 020. Do not assume older adapter versions can read a migration ledger containing an unknown head. Rollback removes conversation fields and requires the normal explicit data-loss confirmation and a compatible application deployment.

Shared scenarios run against memory and PostgreSQL, including reopened connections, exact retries, cursor scoping, context isolation, historical roots and task references. Additional tests cover Planner recovery, notification continuity, HTTP routes and workflow replay conflicts. These establish bounded software behavior; they do not establish production provider reliability or reasoning quality.

Run `node examples/threaded-planner.mjs` after building Rooms to exercise two consumers—personal mail and support tickets—with the same contracts. Both use a deterministic reasoner and no external services.

The remaining unified-plan increments—continuous event retention/analysis receipts, durable situation lifecycle, preference proposals, cross-Room projections, periodic shared budgets and scheduled notification policy—are separate work. This increment supplies the conversation and coordination foundation for them.
