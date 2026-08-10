# `@agentplat/mesh-sim-local`

Node.js local storage adapter for statistical campaign evidence. It stores bytes
in an immutable SHA-256 content-addressed store, publishes slot commits without
overwrite, and exposes campaign locks that are never broken automatically.

The caller supplies an explicit absolute root. Logical artifact paths are never
used as filesystem paths. `readBundleV1` and `readCurrentBundleV1` require a
caller-provided verifier; use the campaign bundle verifier from `mesh-sim` for
schema and evidence validation.

This package is intentionally Node-local. It does not make a cloud, database,
or cross-host locking claim.

`createLocalCollectiveStatisticalCampaignExecutionStoreV1()` adapts the local
CAS to the portable executor interface. It persists revision-CAS execution and
lease state as well as immutable slot records. A logical `runKey` is bound to
exactly one content digest; an identical retry is a duplicate and different
bytes are a conflict. Content written before a crash remains unreachable until
its slot commit is published, so an orphan blob cannot become campaign
evidence.

```ts
import {
  createLocalCollectiveStatisticalCampaignExecutionStoreV1,
  openCollectiveStatisticalCampaignLocalStoreV1,
} from "@agentplat/mesh-sim-local";

const local = await openCollectiveStatisticalCampaignLocalStoreV1({
  root: "/absolute/operator-owned/campaign-store",
});
const executionStore =
  createLocalCollectiveStatisticalCampaignExecutionStoreV1(local);
```

Protected local operations can additionally use
`createLocalCollectiveStatisticalCampaignDeadlineArtifactWriterV1()`. It
validates the trusted local clock before reading the artifact stream and again
immediately before publishing the immutable logical binding. Content staged
before an expiry but left without that binding is unreachable campaign
evidence. This is a local-process deadline boundary, not a cross-host clock or
distributed-transaction claim.

The root must be private to the running OS user. Every fixed directory segment
is rechecked on each operation; the store rejects symlink intrusion, content
corruption, path escape and configured byte/file limits. Campaign and mutation
locks are explicit and never stolen by age. After proving no live writer owns a
stranded mutation lock, inspect it with `inspectMutationLockV1()` and pass its
exact identity to `recoverMutationLockV1(lockId)`. The store rejects a missing
or changed identity.
