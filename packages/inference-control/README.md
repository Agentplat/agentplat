# @agentplat/inference-control

Opt-in, provider-neutral control boundaries for inference, released output,
external actions and outbound messages. Alpha 3 is a developer preview.

```sh
pnpm add @agentplat/inference-control@next
```

## Entry points

- `@agentplat/inference-control` — browser-safe canonicalization, validation,
  context provenance, policy/capability/assessment contracts, strict snapshots
  and the pure reducer.
- `@agentplat/inference-control/model` — controlled `@agentplat/model`
  rendering and execution.
- `@agentplat/inference-control/runtime` — controlled `@agentplat/runtime`
  execution and validated SSE events.
- `@agentplat/inference-control/tools` — explicit single-use Action Grant
  ledger and gateway.
- `@agentplat/inference-control/messages` — explicit outbound-message attempt
  ledger and gateway.

The root entry point has no Node runtime dependency and imports only
`@agentplat/core`. Adapter subpaths depend only on public AgentPlat contracts
and never import a vendor SDK.

## Minimal controlled model

Create a `CapabilityRegistryV1`, register the exact wrapper descriptor and
resolve an immutable policy from local configuration. Then pass the resulting
boundary to `ControlledModelExecutorV1`:

```js
import {
  CapabilityRegistryV1,
  createContextEntryV1,
} from '@agentplat/inference-control';
import { ControlledModelExecutorV1 } from '@agentplat/inference-control/model';

const registry = new CapabilityRegistryV1();
const capability = registry.register({
  descriptor: localDescriptor,
  wrapperInstanceId: 'instance:primary',
});

const executor = new ControlledModelExecutorV1({
  adapter,
  contextEntries: (ids) => ids.map((id) => contextById.get(id)),
  controlBoundary: {
    capabilityRegistry: registry,
    resolvePolicy: (id, version) => localPolicies.get(`${id}:${version}`),
  },
  mode: 'buffered',
  outputRisk: 'high',
  assessor: localAssessor,
});

const result = await executor.generate(
  {
    schemaVersion: 1,
    runId: 'run:example',
    tenantId: 'tenant:example',
    policyId: 'policy:example',
    policyVersion: 1,
    capabilityHandleId: capability.capabilityHandleId,
    contextEntryIds: ['context:policy', 'context:user'],
    model: null,
    tools: [],
    options: null,
    scope: null,
  },
  { tenant: { tenantId: 'tenant:example' } },
);
```

Context entries are immutable and digest-bound. Only `policy`, `objective` and
configured `local_trusted` entries may supply instructions; user, peer, tool,
retrieval, provider and assessor content remains ordinary untrusted data.

## Security boundary

Protection applies only to calls routed through the exact controlled executor
or gateway. A direct adapter, provider, handler or dispatcher call is outside
this opt-in boundary. Coordinated external effects require a downstream-atomic
fencing adapter; local ledgers provide at-most-one local dispatch attempt, not
durable distributed single use or exactly-once effects. Provider cancellation
stops future local release but does not guarantee immediate termination of
remote computation.

Construct `ActionGateway` and `OutboundMessageGateway` with the effective
policy's `maxActionInputBytes` and `maxOutboundMessageBytes`, respectively.
Both gateways apply those canonical UTF-8 limits before assessment or external
effects and reject deeply nested JSON. Omitting the options uses the fixed
65,536-byte hard ceiling; a larger configured value is rejected.

Assessment resolvers must make `consumeCurrent` idempotent for the same exact
grant or message attempt. The gateway calls it once to consume the assessment
and again at the final local pre-effect boundary; cancellation, generation
advance or revocation between those checks must make the second call return
`false`.
