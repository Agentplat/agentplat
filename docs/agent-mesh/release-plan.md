# Agent Mesh release plan

AgentPlat uses one fixed SemVer across every public package. Agent Mesh
development begins in the `0.3.0` prerelease line and is published under the npm
`next` tag.

## Milestones

### Milestone 0: governance

- canonical public package catalog;
- architectural decisions and glossary;
- threat model and compatibility policy;
- external terminology gate;
- unchanged Runtime, Sessions, Rooms and Framework behavior.

Milestone 0 is not published by itself.

### `0.3.0-alpha.1`: reproducible local vertical slice

- `@agentplat/mesh-protocol`;
- `@agentplat/mesh-crypto`;
- pure Mesh peer reducer and effect contracts;
- `@agentplat/mesh-sim` kernel;
- signed loopback delivery;
- a deterministic three-peer scenario installed from packed tarballs.

### `0.3.0-alpha.2`: allocation and recovery

- partial peer views and capability discovery;
- Objective and Work Item state machines;
- offer, bid, award and acceptance;
- leases, epochs, fencing and reassignment;
- crash, loss, duplicate, reorder and partition scenarios.

The detailed scope, invariants and implementation increments are in the
[Alpha 2 implementation plan](./alpha-2-implementation-plan.md). Release
evidence is tracked in the
[Alpha 2 acceptance checklist](./alpha-2-acceptance-checklist.md).

### `0.3.0-alpha.3`: inference and actions

- `@agentplat/inference-control`;
- context trust zones and assessments;
- buffered and incremental release modes;
- Action Gateway and scoped action grants;
- provider capability validation.

The detailed scope, invariants and implementation increments are in the
[Alpha 3 implementation plan](../inference-control/alpha-3-implementation-plan.md).
Release evidence is tracked in the
[Alpha 3 acceptance checklist](../inference-control/alpha-3-acceptance-checklist.md),
and its local enforcement boundary is defined by the
[Inference Control threat model](../security/inference-control-threat-model.md).
The design-freeze evidence is recorded in the
[Alpha 3 design review](../inference-control/alpha-3-design-review.md).

### `0.3.0-alpha.4`: evidence and trust

- claims, attestations and fusion policies;
- local multidimensional Trust Profiles;
- decay, contradiction, scoped quarantine and recovery;
- adversarial and collusion scenarios with documented assumptions.

The detailed scope, deterministic Fusion contract and implementation increments
are in the [Alpha 4 implementation plan](../trust/alpha-4-implementation-plan.md).
Release evidence is tracked in the
[Alpha 4 acceptance checklist](../trust/alpha-4-acceptance-checklist.md), and the
security boundary is defined by the
[Evidence and Trust threat model](../security/evidence-trust-threat-model.md).
The independent review verdicts and exact normative commit are recorded in the
[Alpha 4 design review](../trust/alpha-4-design-review.md).

### `0.3.0-alpha.5`: adapters

- reference HTTP transport;
- optional durable inbox, outbox and journal adapter;
- Room bridge;
- multi-process reference example.

The exact adapter boundaries, crash semantics and implementation increments are
defined in the [Alpha 5 implementation plan](./alpha-5-implementation-plan.md).
Release evidence is tracked in the
[Alpha 5 acceptance checklist](./alpha-5-acceptance-checklist.md), and the
network, persistence and bridge boundary is defined by the
[Mesh adapters threat model](../security/mesh-adapters-threat-model.md).
The design findings and exact normative commit are recorded in the
[Alpha 5 design review](./alpha-5-design-review.md).

### `0.3.0-beta.1`: compatibility freeze

- `wireVersion: 1`;
- frozen canonical protocol and persistence fixtures;
- current/previous compatibility matrix;
- complete conformance suite;
- release-scale benchmark report tied to the release commit.

## Promotion gates

Every preview requires:

- complete public audit;
- build and public type tests;
- unit, component and deterministic scenario tests;
- release manifest verification;
- installation of cataloged tarballs in an isolated consumer;
- no behavioral regressions in Runtime, Sessions or Rooms.

Stable promotion additionally requires:

- zero unresolved tenant, signature, replay, fencing or authorization failures;
- no runtime critical or high severity dependency findings;
- two consecutive release candidates without critical flakes;
- documented scale, compatibility, migration and rollback reports;
- at least two independent consumer validations.

Published versions are never overwritten. Recovery restores a previous dist-tag
or publishes a new patch.
