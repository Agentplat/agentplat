# Agent Mesh `0.3.0-alpha.1` implementation plan

Status: approved implementation sequence.

This plan turns the Milestone 0 contracts into one reproducible local vertical
slice. It preserves the existing AgentPlat package behavior while introducing
four independently installable Agent Mesh packages.

## Release outcome

`0.3.0-alpha.1` is complete when a clean consumer can install the coordinated
package tarballs, start three locally admitted peers, exchange a signed message
through the loopback transport, replay the same seeded simulation, and observe
the same ordered state transitions and effects.

The release uses:

- fixed version `0.3.0-alpha.1` across every public package;
- npm distribution tag `next`;
- protocol `agentplat.mesh`;
- `wireVersion: 0`;
- Node.js 20 for protocol-only consumers and Node.js 20.19.3 for packages that
  execute the reference Ed25519 Web Crypto path;
- browser-compatible source for every declared browser entrypoint.

## Package contract

| Package                    | Layer         | Public exports    | Browser entrypoints | Responsibility                                                                 |
| -------------------------- | ------------- | ----------------- | ------------------- | ------------------------------------------------------------------------------ |
| `@agentplat/mesh`          | collaboration | `.`, `./loopback` | `.`, `./loopback`   | Pure peer reducer, effect contracts, inbound coordination and loopback driver. |
| `@agentplat/mesh-crypto`   | foundation    | `.`               | `.`                 | Canonical digest and reference Ed25519 signing and verification.               |
| `@agentplat/mesh-protocol` | transport     | `.`               | `.`                 | Bounded wire types, strict parsing, validation and conformance fixtures.       |
| `@agentplat/mesh-sim`      | testing       | `.`               | `.`                 | Logical clock, event queue, seeded scheduling, replay and invariant monitors.  |

All four packages are public, provider-neutral and included in package smoke
testing. Runtime dependencies must use `workspace:^` and include only packages
that the source imports directly.

The intended dependency direction is:

```text
mesh-protocol
      |
      v
 mesh-crypto
      |
      v
     mesh
      |
      v
   mesh-sim
```

`mesh` may depend directly on both `mesh-protocol` and `mesh-crypto`.
`mesh-sim` may declare either package directly when it imports its public
contracts. Dependency declarations must reflect actual imports rather than
relying on transitive resolution.

## Alpha.1 scope

### Protocol

The protocol package provides the smallest closed, useful subset of protocol v0
needed by the vertical slice:

- branded identifiers and exact protocol and wire-version constants;
- direct-peer and bounded Mesh-topic audiences;
- closed signed-envelope structures;
- explicit payload discriminants for the alpha.1 scenario;
- UTF-8 byte, object, array, nesting, string and lifetime limits;
- duplicate-key rejection and safe-integer validation;
- exact type/payload equality;
- canonical JSON compatible with the signing contract;
- canonical signing-document construction;
- structured, bounded validation errors;
- public conformance fixtures containing no private key material.

Message families scheduled for later alphas may be represented as reserved
discriminants, but they must not be accepted through a generic payload fallback.
An unimplemented message fails explicitly before reducer invocation.

### Cryptography

The crypto package provides:

- SHA-256 payload digests;
- base64url encoding without padding;
- Ed25519 signing and verification through Web Crypto;
- public-key import and export required by preprovisioned bindings;
- constant-result verification APIs that do not disclose private material;
- injectable signers and verifiers for production and simulation drivers.

Private keys are generated ephemerally in tests. They are never committed,
serialized into fixtures, included in telemetry or packed into a package.

### Peer reducer and effects

The Mesh reducer is synchronous and pure:

```text
state + accepted input + logical time -> next state + ordered effects
```

It does not read clocks, randomness, storage, networks, tools, model providers
or process-global state. Those operations are represented by typed effects.

The alpha.1 reducer must demonstrate:

- local tenant and Mesh scope;
- one admitted local peer identity;
- accepted direct message processing;
- deterministic liveness state;
- correlation and causation for a response;
- ordered send and local-event effects;
- no state mutation for rejected input.

The inbound driver performs parsing, scope checks, key lookup, digest and
signature verification, admission, replay checks and causal checks before
creating the accepted input passed to the reducer.

### Signed loopback

`@agentplat/mesh/loopback` is an explicit in-memory adapter, not a hidden global
bus. It provides:

- peer registration scoped by tenant and Mesh;
- bounded queues and deterministic delivery order;
- direct-audience enforcement;
- signed delivery through the same inbound pipeline used by future transports;
- duplicate-delivery injection for idempotency tests;
- cooperative shutdown and queue inspection.

The loopback adapter does not provide distributed persistence, network
confidentiality or production membership discovery.

### Deterministic simulation

The simulation package provides:

- integer logical time;
- a documented seedable pseudo-random algorithm and version;
- scoped random substreams;
- a priority queue ordered by logical time, priority and insertion sequence;
- explicit event and logical-time limits;
- immutable trace records;
- chained trace digests;
- invariant checks after every event;
- a replay result that reports the first divergence.

The canonical scenario contains three preprovisioned peers. It proves successful
signed delivery and response, deterministic replay, audience isolation and
duplicate rejection. The same generated key handles may be reused for two
replays within a test run; private keys are never recorded in the trace.

## Non-goals

The following are intentionally outside `0.3.0-alpha.1`:

- capability discovery and partial peer views;
- Objective and Work Item allocation;
- offers, bids, awards and acceptance;
- leases, epochs, fencing and recovery certificates;
- inference control and external Action Gateway enforcement;
- evidence fusion and Trust Profiles;
- HTTP, WebSocket or broker transports;
- durable inboxes, outboxes, journals and checkpoints;
- Agent Room projection or control-plane integration;
- Framework re-exports;
- wire compatibility promises beyond alpha `wireVersion: 0`;
- production claims of exactly-once delivery, confidentiality or Sybil
  resistance.

These capabilities remain assigned to later milestones. Alpha.1 must not expose
placeholder APIs that imply they already work.

## Compatibility requirements

Agent Mesh remains additive:

- `@agentplat/runtime` keeps local provider dispatch semantics;
- `@agentplat/sessions` keeps fixed round-robin defaults;
- `@agentplat/rooms` keeps its durable aggregate and governance behavior;
- `@agentplat/framework` does not depend on or re-export Mesh;
- no existing interface gains a required field;
- no existing closed union gains a Mesh discriminant;
- no existing package export is removed or redirected;
- existing browser entrypoints retain their current import closure.

The coordinated version bump changes package versions, not existing default
behavior. Any source change under Runtime, Sessions, Rooms or Framework requires
separate review and is not part of this milestone.

## Implementation phases

### Phase 0: establish a clean baseline

- branch from the Milestone 0 squash commit on `origin/main`;
- run the complete existing check before introducing new files;
- preserve Runtime, Sessions, Rooms and Framework behavior.

Exit criterion: audit, build, type checks, 99 unit tests, adapter tests, release
verification and the 24-package tarball smoke test pass unchanged.

### Phase 1: reserve and scaffold the public surface

- add the four catalog entries in ASCII order;
- add the four root `workspace:*` development dependencies;
- record this implementation plan;
- create all four package directories, READMEs, source entrypoints and
  TypeScript configurations;
- declare explicit exports and internal dependencies;
- define compile-only public contracts without parser, crypto or reducer
  implementations;
- assert the complete 28-package alpha.1 catalog and type contract;
- add build, type-check and clean scripts;
- regenerate the pnpm lockfile;
- confirm a clean frozen install succeeds;
- keep every source entrypoint importable without side effects.

Exit criterion: catalog discovery, workspace installation, build, type-check,
release verification and isolated export imports are green with minimal stub
implementations.

### Phase 2: implement the protocol

- implement strict bounded parsing and closed schemas;
- implement canonical signing documents and payload digests;
- test tampering, duplicate keys, invalid UTF-8, invalid numbers, unsupported
  messages, expiry, wrong audience and wrong wire version.

Exit criterion: malformed input cannot produce a structurally signed envelope.

### Phase 3: implement cryptography

- implement SHA-256 payload digests;
- implement Ed25519 sign and verify;
- add public-key and signed-envelope conformance fixtures;
- test payload and signing-document tampering, unsupported algorithms, key
  binding, validity and revocation.

Exit criterion: unauthenticated input cannot produce a verified envelope.

### Phase 4: implement the reducer

- define immutable peer state, accepted inputs and ordered effects;
- implement the minimal liveness transition used by the vertical slice;
- implement local key resolution, admission and replay state;
- prove duplicate input is idempotent and cross-scope input is rejected.

Exit criterion: invalid or unaccepted input cannot reach the reducer.

### Phase 5: implement loopback, simulation and scenario

- implement signed loopback dispatch;
- implement logical time, seeded scheduling and event limits;
- implement trace recording, chained digests and replay comparison;
- add invariant monitors;
- add the deterministic three-peer scenario and negative variants;
- report seed, configuration digest and first divergence on failure.

Exit criterion: the same reducer is used directly, through signed loopback and
inside simulation without simulation-specific branches; repeated runs with the
same versioned configuration produce the same ordered semantic trace.

### Phase 6: integrate tarball and release gates

- pack every cataloged package;
- audit every extracted tarball;
- install each declared export in a package-isolated consumer;
- compile a TypeScript consumer against packed declarations;
- install the three-peer scenario exclusively from local tarballs;
- run the unchanged existing functional consumer;
- assert packed internal dependency ranges contain no `workspace:` references.

Exit criterion: the local tarballs, rather than workspace links, pass all
functional and type-level scenarios.

### Phase 7: prepare and publish

- set the fixed workspace version to `0.3.0-alpha.1`;
- regenerate the lockfile and rebuild from clean output;
- update README, release channels, release instructions and changelog;
- run the required external terminology audit;
- perform a no-mutation npm dry run from clean `main`;
- publish all packages under a commit-specific staging tag;
- verify registry integrity for all packages;
- promote all packages to `next`;
- run one independent clean-consumer validation;
- tag the verified commit as `v0.3.0-alpha.1`.

## Test matrix

### Unit tests

- identifier, time and size boundaries;
- canonicalization and digest vectors;
- base64url and signature representation;
- reducer purity and immutable input handling;
- deterministic queue ordering and seeded substreams;
- trace divergence reporting.

### Security and conformance tests

- signature and payload tampering;
- unsupported algorithm and key ID;
- unknown or revoked sender;
- self-signed but unadmitted peer;
- expired, future and excessive-lifetime envelopes;
- cross-tenant, cross-Mesh and wrong-audience delivery;
- duplicate message ID and sender sequence;
- duplicate JSON keys and structural-limit exhaustion;
- unknown critical extensions;
- guarantee that rejected input never invokes the reducer.

### Component tests

- sign, loopback, verify, admit and reduce;
- response correlation and causation;
- bounded queue backpressure;
- telemetry failure without decision changes;
- repeated delivery without repeated state mutation.

### Scenario tests

- deterministic three-peer success;
- delivery to a non-audience peer;
- tampered delivery;
- duplicate delivery;
- replay with the same seed and configuration;
- divergence after a controlled input change;
- maximum logical-time and event-count termination.

### Regression tests

- all existing unit and adapter tests;
- existing Runtime, Session, Room and Framework public type contracts;
- unchanged existing functional tarball smoke scenario;
- exact existing export-key checks;
- no Mesh dependency or re-export from Framework.

## Required gates

### Pull request gates

- public checkout audit;
- clean build and type-check;
- all unit, component and scenario tests;
- catalog and manifest verification;
- browser-entrypoint import-graph verification;
- package tarball audit and isolated imports;
- legacy behavior regression suite;
- deterministic scenario with a reported seed.

### Release gates

- clean `main` worktree at the reviewed commit;
- fixed `0.3.0-alpha.1` version across all 28 manifests;
- non-empty external terminology denylist;
- no missing, private or uncataloged internal runtime dependency;
- successful packed TypeScript and three-peer consumers;
- successful registry integrity preflight;
- publication only to `next`;
- post-publication integrity and clean-consumer verification;
- documented previous `next` versions for rollback.

### Private operational prerequisites

The following remain outside the public repository:

- the contents of the release terminology denylist;
- the repository secret that supplies that denylist in release CI;
- npm organization publication rights;
- an npm token or Trusted Publishing configuration;
- protected release-environment approvals;
- the operator record of prior distribution tags and rollback authority.

No private Agent Mesh implementation, hosted service, signing key or customer
data is required to build or test the public alpha.1 vertical slice.

## Recovery

Published versions are immutable. A failed prepublication gate produces no
registry mutation. A partial staged upload is retried only when local and
registry integrity match. A failed `next` promotion is retried from the same
commit or rolled back by restoring every package's previously recorded `next`
target. Code corrections use a new prerelease version; published artifacts are
never overwritten.

## Definition of done

`0.3.0-alpha.1` is done only when:

1. all four packages are public and independently importable;
2. every declared browser entrypoint passes the fail-closed graph check;
3. rejected envelopes cannot reach the reducer;
4. the signed three-peer scenario passes from packed tarballs;
5. replay is deterministic under its documented version and inputs;
6. all existing package behavior and public contracts remain green;
7. all 28 coordinated packages are integrity-verified under npm `next`;
8. the release commit, tag, checks and rollback targets are recorded.
