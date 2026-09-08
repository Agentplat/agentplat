# `@agentplat/rooms-mesh`

Explicit, authority-neutral projections between Agentplat Rooms and Agent Mesh.
The package is a bridge, not a scheduler or trust service.

## Installation (developer preview)

Install the coordinated preview explicitly:

```sh
npm install @agentplat/rooms-mesh@next
```

Keep all `@agentplat/*` packages on the same release version. npm's default
`latest` tag can point to an older preview. See the
[release channels](https://github.com/Agentplat/agentplat/blob/main/docs/release-channels.md)
for distribution status and version selection.

```ts
import {
  projectRoomToMeshObjective,
  projectRoomTaskToMeshWork,
} from "@agentplat/rooms-mesh";

const objective = projectRoomToMeshObjective({ room, policy });
const work = projectRoomTaskToMeshWork({ room, task, policy: workPolicy });
```

Outbound policies must provide issuer, owner, revision, budget, capability,
deadline and recovery fields explicitly. Room roles, participant authority,
metadata and event actors are never converted into Mesh admission, assignment
or lease authority. The result is an unsigned payload; this package does not
sign, publish, bid, award, accept or execute it.

`projectApprovedRoomDecisionToMandateProposalV1` applies the same rule to
collective control: an explicitly resolved human approval becomes an unsigned,
digest-bound proposal for an application-owned issuer. It does not install a
mandate. `projectCollectiveDecisionToRoomArtifactV1` creates an ordinary draft
artifact containing bounded identifiers and digests only; applying it remains
explicit.

An accepted `work.progress`, `work.checkpoint` or `work.result` decision can be
projected into an ordinary Room message or draft artifact. Applying it is
explicit and uses deterministic IDs plus an idempotency key. The included Room
service sink does not run or complete a task, approve an artifact, complete a
Room or bypass its normal policy.

The in-memory idempotency repository is for local use and tests. Multi-process
applications must inject a durable atomic claim/complete implementation. A sink
must honor the supplied deterministic key; no bridge can promise exactly-once
application when a remote sink commits and then times out while ignoring that
key.
