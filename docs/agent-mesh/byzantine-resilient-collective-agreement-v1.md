# Byzantine-resilient collective agreement V1

## Capability

`@agentplat/collective-quorum/agreement` provides an opt-in agreement boundary
for decisions that must remain unique when admitted validators may be faulty or
malicious. The original quorum API remains the lighter crash-fault option.

V1 includes:

- immutable validator membership with exactly `n = 3f + 1`;
- deterministic proposer rotation by height and round;
- signed proposals, prevotes and precommits;
- `2f + 1` vote and commit certificates;
- durable highest-round and value-lock state;
- signed equivocation proofs and Trust evidence projection;
- joint old/new validator-set certification;
- bounded, hash-chained commit catch-up;
- in-memory and PostgreSQL repositories;
- process-local and bounded HTTP transports;
- adapters for assignment confirmation, recovery selection, planning-slot heads
  and synchronization watermarks.

## Install the opt-in boundary

```ts
import {
  CollectiveAgreementClientV1,
  CollectiveAgreementPeerV1,
  CollectiveAgreementHttpTransportV1,
  createCollectiveAgreementRuntimePortsV1,
} from "@agentplat/collective-quorum/agreement";
import {
  PostgresCollectiveAgreementRepositoryV1,
  runMigrations,
} from "@agentplat/collective-quorum-postgres/agreement";
```

Construct one repository and one peer endpoint per validator identity. The
membership resolver must return the exact epoch/configuration digest referenced
by a message. A proposer client uses the same local repository so its own votes,
locks and commits share the validator's durable boundary.

The runtime adapter accepts any `CollectiveAgreementDecisionPortV1`. A local
`CollectiveAgreementClientV1` can decide only when the local peer is the
deterministic proposer. Deployments where arbitrary runtime peers submit
decisions should inject a routing implementation that forwards to the current
proposer; it must not share or impersonate the proposer's signing key.
The adapter independently verifies the returned commit with its configured
membership, key resolver and clock before projecting it into runtime evidence.

## Round behavior

For height `h` and round `r`, the proposer index is `(h - 1 + r) mod n` over the
sorted validator set. A successful round is:

1. proposer sends one canonical value;
2. validators validate scope, membership, signature, proposer, lock and
   application semantics, then durably prevote;
3. proposer distributes a `2f + 1` prevote certificate;
4. validators durably lock and precommit the certified value;
5. proposer creates a `2f + 1` precommit certificate, stores the commit and
   broadcasts it.

If progress stalls, the deployment advances the round. A proposer that changes
the value must carry a verified prior prevote certificate whose round is at or
above each correct validator's lock. Timeout expiry alone grants no authority.

## Application values

Use `createCollectiveAgreementValueV1` for generic decisions or the typed
helpers for planning, synchronization and membership changes. Values are
canonical JSON and chain with `previousCommitDigest` when a slot spans several
heights. Agreement proves that a threshold selected the exact digest; the
semantic port remains responsible for domain validity.

`createCollectiveAgreementRuntimePortsV1` maps certified values to the existing
node runtime assignment-confirmation and recovery-election ports. Installing the
returned ports is explicit. Existing node construction and behavior do not
change.

## Reconfiguration

Create the membership-change value with both configuration digests and
`activationHeight`. Run agreement independently under the prior and next sets,
then create a joint certificate. Do not expose the next membership as current
until `verifyCollectiveAgreementJointReconfigurationCertificateV1` accepts it.
Retain both memberships and key records for historical commit/catch-up
verification.

## Catch-up

Create bounded bundles from `repository.listCommits`, then verify or apply them
with a membership resolver for each commit. Application is fail-closed at the
verification boundary: a gap, fork, wrong scope, stale membership, bad
signature or prior-hash mismatch rejects the bundle. The reference apply helper
stores commits idempotently and reports the final height.

## Equivocation and Trust

Every observed vote is keyed by validator, height, round and phase. A second
signed vote for a different proposal/value yields a deterministic proof.
`createCollectiveAgreementEquivocationEvidenceV1` converts it to a normal Trust
claim only after verifying both signatures and the proof digest with the
configured key resolver. The two signed votes become basis references. Feed
that claim through the existing Trust reducer and policy; the agreement layer
does not impose a global quarantine policy.

## PostgreSQL operations

Migration V2 adds agreement state, local votes, observed votes and commit
history. Run migrations before serving protocol traffic. Each repository
instance is scoped to exactly one tenant, mesh and validator peer. Preserve that
mapping across restart and never point two signing identities at the same peer
scope.

Back up vote, lock and commit tables together. Restoring only commits while
discarding local votes/locks can make a validator unsafe. Migration rollback is
destructive and requires the package's explicit backup and data-loss controls.

## Sizing and observability

- validator set: 4 to 127 members in V1, with exactly `3f + 1` members;
- envelope limit: 1 MiB;
- HTTP hard maximum: 8 MiB when explicitly raised;
- catch-up bundle: at most 1,024 commits;
- default request timeout: 5 seconds;
- default envelope TTL: 30 seconds, maximum 5 minutes.

Record, without payload secrets:

- policy domain, slot, height, round and membership digest;
- proposer and participating validator IDs;
- prevote/precommit counts and certificate digest;
- round timeout/retry and readiness rejection codes;
- equivocation proof digest and Trust claim ID;
- catch-up source range and result.

## Local multiprocess exercise

The seven-process example uses HTTP and caller-provided PostgreSQL, makes two
validators unavailable, commits with the remaining five, restarts the proposer
and verifies retained lock/commit state:

```sh
DATABASE_URL=postgresql://127.0.0.1:5432/agentplat \
  pnpm run example:byzantine-agreement-multiprocess
```
