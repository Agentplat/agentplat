# Dynamic Membership and Key Rotation V1

Status: implemented open-source protocol.

## Purpose

Static peer lists and static verification keys cannot safely support long-lived
collectives. This protocol lets a running collective add or remove a peer and
replace a peer's signing key without introducing a central membership leader or
interrupting operations already bound to an earlier configuration.

## State model

Each independently hosted peer persists the same kinds of records but makes
its own voting decision:

1. a configuration head `(epoch, configurationDigest)`;
2. an append-only configuration history;
3. at most one chosen proposal digest per source epoch;
4. idempotent signed vote responses; and
5. transition certificates.

A valid next configuration has `epoch = current.epoch + 1`, references the
current digest, advances both wall and logical activation time, and changes
exactly one membership fact. The supported facts are one join, one leave, or
one active-key replacement.

## Transition protocol

1. A current member creates a deterministic next configuration and proposal.
2. The proposer sends a signed vote request to the union of old and new peers.
3. Each peer verifies the configuration chain, transition-specific proofs,
   proposal time window, proposer instance, and its own inclusion in the union.
4. A peer durably chooses one proposal digest for the source epoch before
   returning a signed vote.
5. The proposer requires a strict majority from the old set and independently
   a strict majority from the new set.
6. The proposer assembles a deterministic certificate and disseminates it to
   the union. Each receiver verifies the complete certificate before an atomic
   compare-and-swap of its configuration head.

There is no permanent coordinator. Any current member may propose the next
epoch, while durable non-equivocation prevents one peer from supporting two
competing successors.

## Key lifecycle

A join carries a detached proof of possession from the advertised active key.
A rotation carries detached proofs over the same transition statement from:

- the current active key; and
- the replacement active key.

The next configuration retains the old public key but shortens its exclusive
`validUntil` to `overlapUntil`. The new key is valid at activation and beyond
the end of the overlap. A host switches its signing configuration to the new
private key during this window. Verification history keeps neither private
material nor an unbounded acceptance path for the retiring key.

## Interaction with distributed quorums

Assignment confirmation and recovery election payloads may carry a membership
epoch and configuration digest. When the membership port is configured:

- the client selects the configuration effective at the operation's starting
  logical time;
- every named participant must be in that snapshot;
- peers resolve the exact historical snapshot rather than the latest head; and
- responses echo the same binding.

Consequently, a later join, leave, or rotation cannot silently change the
threshold population of an active operation. A deployment that does not supply
the optional port retains the previous unbound protocol behavior.

## Operational invariants

- Never reuse a key ID for different public material.
- Keep clocks sufficiently synchronized for envelope and key validity windows.
- Start replacement-key hosts before the retiring key's exclusive expiry.
- Retain configuration and certificate history for the longest audit period.
- Give every physical voter its own PostgreSQL `peerId` scope.
- Authenticate transport channels in addition to document signatures.
- Treat loss of both keys during rotation as an operator recovery event; the
  protocol cannot reconstruct private material.

## Fault boundary

The implementation tolerates crash, restart, omission, delay, reordering, and
minority partition faults. It authenticates voters and detects equivocation in
local durable state, but it is not a Byzantine-fault-tolerant agreement system.
Endpoint discovery, hardware-backed key custody, revocation outside certified
configuration changes, and emergency operator recovery are deployment policy.
