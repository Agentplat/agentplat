# `@agentplat/workflows-rooms`

Agent Room approval gates for Governed Durable Workflows V1.

## Installation (developer preview)

Install the coordinated preview explicitly:

```sh
npm install @agentplat/workflows-rooms@next
```

Keep all `@agentplat/*` packages on the same release version. npm's default
`latest` tag can point to an older preview. See the
[release channels](https://github.com/Agentplat/agentplat/blob/main/docs/release-channels.md)
for distribution status and version selection.

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

## Attention wakeup mapping (source preview)

`attentionWakeupToProcessSignalV1(wakeup, runId)` maps a bounded Room attention
wakeup to the existing workflow signal contract with stable identity. It neither
persists the signal nor advances a runner; routing, capacity, current authority
and execution gates remain the workflow owner's responsibility.
See [signals](../../docs/agent-governance/signals.md).

## Agent governance and existing Action Gateway (source preview)

`agentGovernanceActionTargetDigestV1` binds the assessment target before grant issuance.
`createAgentGovernanceActionGatewayV1` narrows the existing gateway with current
governance and cumulative reservations. The trusted quote port supplies a stable
logical effect ID, actual destination and upper-bound resource charges. It neither
creates a grant nor upgrades an old approval. See [execution](../../docs/agent-governance/execution.md).

See [governed continuity](../../docs/agent-governance/continuity.md) for objective 8: ancestry budgets, mixed-mode Handoffs, model replacement and qualified evolution receipts.
