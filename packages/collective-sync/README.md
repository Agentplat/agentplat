# `@agentplat/collective-sync`

Provider-neutral authenticated causal anti-entropy for independently hosted
Agentplat collective peers.

The package exposes signed, membership-bound frontier discovery, bounded chunk
transfer, receipts, threshold catch-up certificates, resumable repository
contracts, a readiness gate, an in-memory reference repository, and WHATWG
Fetch HTTP adapters. Importing it performs no network, filesystem, migration,
timer, or global-registration work.

## Minimal shape

```ts
import {
  CollectiveSyncClientV1,
  CollectiveSyncPeerV1,
  CollectiveSyncReadinessGateV1,
  InMemoryCollectiveSyncRepositoryV1,
} from "@agentplat/collective-sync";

const repository = new InMemoryCollectiveSyncRepositoryV1(scope);
const peer = new CollectiveSyncPeerV1({
  scope,
  signing,
  membership,
  repository,
  clock,
});
const client = new CollectiveSyncClientV1({
  scope,
  signing,
  membership,
  repository,
  transport,
  clock,
  adapter: {
    validate: (record) => domainReducer.accepts(record.payload),
    replay: (records) => domainReducer.replay(records.map((r) => r.payload)),
  },
});

await client.catchUp({ syncDomain: "mission.42.planning" });
// Availability-only lookup; this does not create a readiness certificate.
await client.resolveRecord({
  peerId: "peer.2",
  syncDomain: "planning.artifacts.v1",
  streamId: "planning.artifact.<fragment-digest>",
  sequence: 1,
});
const readiness = await new CollectiveSyncReadinessGateV1({
  scope,
  membership,
  repository,
  clock,
}).check({ syncDomain: "mission.42.planning" });
```

## Security boundary

A source signature authenticates transport provenance only. The supplied domain
adapter must apply normal authority and semantic validation before records are
replayed. Do not create synchronization records from credentials, signing
material, raw prompts, private reasoning, transient inference context, or any
other content that is not explicitly safe to replicate.

`resolveRecord` authenticates one exact source response and replays one domain
validated record. It proves availability only; callers must not treat it as
threshold agreement or causal readiness.

The default readiness threshold is the current membership majority. A
certificate is invalid after membership rotation, instance change, or local
frontier movement. V1 does not claim Byzantine consensus or reconcile forks.
Incoming signed-envelope lifetimes default to a 30-second maximum, and HTTP
request and response streams are stopped after 1 MiB even when no
`Content-Length` header is present. Hosts may lower those bounds per deployment.
See the repository ADR and threat model for the complete invariants.
