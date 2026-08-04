# ADR 0010: Authenticated causal state synchronization

Status: accepted for V1 implementation

## Context

Collective peers already authenticate operational messages and persist local
transitions, but a joining or restarted peer cannot recover causal predecessors
that it did not observe. A message can therefore be authentic and current while
still being unusable because its predecessor is absent locally. Copying a whole
snapshot from one peer would make that peer an implicit authority, would erase
partial-observation boundaries, and would bypass the existing domain reducers.

## Decision

Agentplat adds two opt-in public packages:

- `@agentplat/collective-sync` owns a provider-neutral, signed anti-entropy
  protocol, bounded causal records, catch-up orchestration, readiness evidence,
  an in-memory repository, and Fetch-based HTTP hosting;
- `@agentplat/collective-sync-postgres` owns resumable durable sessions,
  append-only records, frontiers, receipts, certificates, migrations, and
  explicitly guarded rollback.

The protocol is independent from Mesh Wire V1. It is bound to the current
certified membership `epoch` and `configurationDigest`; every envelope names
the exact sender and audience instances. Existing reserved Mesh message names
remain reserved and are not activated by this decision.

State is synchronized as content-addressed causal records. Each stream is a
linear, append-only chain with a monotonically increasing sequence and an exact
predecessor digest. A frontier is the sorted set of stream heads for one
explicit synchronization domain. It never claims global knowledge outside that
domain.

Catch-up has five phases:

1. collect signed frontier responses from current members;
2. select an identical frontier attested by the configured threshold;
3. request bounded chunks from those sources and import them with compare-and-
   set predecessor checks;
4. replay imported records through the host's existing domain adapter;
5. collect signed attestations for the reached frontier and persist a catch-up
   certificate.

A certificate is local operational-readiness evidence, not consensus on world
truth. The default threshold is the membership quorum threshold. Callers may
require a stricter threshold but never fewer than two sources or the majority
of current members. Certificates become stale immediately when membership
epoch, configuration digest, target instance, synchronization domain, or local
frontier changes.

The productive peer node accepts an optional readiness port. When configured,
planning, bidding, execution, assignment confirmation, and recovery-election
participation fail closed until the port confirms a current certificate. A
missing authenticated causal predecessor invokes the optional recovery port;
the original inbox item stays retryable and is processed again only after the
predecessor has passed normal domain validation.

## Invariants

1. Private keys, credentials, raw prompts, private reasoning, and transient
   inference context are never valid synchronization-record payloads.
2. A transport signature proves who served bytes; it never grants domain
   authority. The domain adapter must validate every record before replay.
3. Records are append-only. The same stream and sequence cannot name two
   digests, and a head advances only from its exact predecessor.
4. Requests and responses are tenant-, mesh-, policy-domain-, epoch-, peer-,
   and instance-bound, time-bounded, size-bounded, and idempotent.
5. Chunks contain at most 256 records and at most 1 MiB of canonical data.
6. Import and frontier advancement are atomic. Partial chunks never advertise
   a frontier that was not durably committed.
7. Restart resumes from the durable session cursor; it does not trust a caller-
   supplied cursor.
8. A membership rotation invalidates unfinished sessions and prior readiness
   certificates for operational gating.
9. No single peer can make another peer ready under the default policy.
10. Forks, gaps, digest mismatches, reordered records, and membership drift fail
    closed and remain diagnosable.

## Consequences

Peers can recover missed causal evidence without a central coordinator and
without weakening the authority checks of existing reducers. Hosts must expose
domain adapters and choose bounded synchronization domains. V1 deliberately
does not merge divergent forks, transfer secret material, claim Byzantine
agreement, compact history, or modify Mesh Wire V1.
