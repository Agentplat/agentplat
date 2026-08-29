# `@agentplat/workflows-rooms`

Agent Room approval gates for Governed Durable Workflows V1.

The gate provider creates deterministic, version-bound Room approvals and maps
only persisted Room dispositions to generic workflow gate outcomes. Human
`needs_revision` decisions preserve the reviewed artifact version; after a new
artifact version is created, the provider opens a new approval in the same gate
chain.

The projector consumes the transactional Agent Room operational stream and
emits idempotent workflow wakeup signals. It reloads the exact approval and Room
state before signaling. An operational event, approval projection or external
work-management state never becomes execution authority by itself.

At expiry the provider attempts the Room `requested → expired` transition. A
provider failure or unresolved approval still takes the workflow's `expired`
branch; expiry never approves.
