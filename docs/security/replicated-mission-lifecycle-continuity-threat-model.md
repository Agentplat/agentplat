# Replicated mission lifecycle continuity threat model

## Security objective

Restore an exact governed lifecycle revision on an authorized process while
preventing duplicate confirmed effects, rollback, checkpoint forks, stale
authority, and false availability claims.

## Trust boundaries

- The authority port decides which holder generation is current. The runtime
  only validates and consumes that decision.
- The availability port certifies and verifies durable replica availability.
- The repository stores immutable snapshots, certificates, and checkpoints.
- The continuity store serializes prepared/applied phase receipts by CAS.
- A monotonic head outside the replaceable snapshot witnesses revision,
  logical-time high water, and exact state digest.
- The restore port atomically installs a lifecycle revision at the destination.
- The governed lifecycle remains responsible for authorizing and executing
  mission effects after recovery.

## Protected bindings

Every checkpoint is transitively bound to the full validated lifecycle state,
state digest and revision, state key, scope digest, policy digest, predecessor,
authority ID and digest, authority epoch, fencing token, holder generation, and
logical time. The certificate is bound to the checkpoint and authority digests.
Operation receipts are bound to action, operation ID, input digest, scope, and
policy.

## Threats and mitigations

### Replaying an applied lifecycle effect

An attacker may try to turn an applied outbox entry back into prepared work.
Snapshots include the exact validated lifecycle state and state digest.
Takeover copies it without invoking effect ports or rewriting outbox entries.
Digest or state tampering fails validation.

### Restoring an older state

The restore port compares the destination revision and digest atomically. A
newer destination revision is a rollback attempt and fails closed. A different
digest at the same revision is equivocation and also fails closed.

The same protection applies to the continuity coordinator itself. A missing
snapshot behind an existing head, an older revision/time, or a different
digest at the witnessed revision is rejected before any phase resumes.

### Forking checkpoint history

Snapshots bind the current checkpoint head as predecessor. Preparing and
applying the checkpoint compares that head through the continuity CAS. Reusing
a snapshot/checkpoint ID for another digest or changing the head is rejected.

### Forging or replaying authority

Authority records are digest-bound to mission authority ID, epoch, fence,
scope, policy, holder generation, holder identity, resume checkpoint, and
expiry. Currentness is checked before and after artifact-producing operations.
A takeover additionally requires a strictly newer holder generation and an
explicit resume checkpoint. A different mission epoch, fence, scope, or policy
cannot take over the checkpoint.

### Claiming unavailable state is recoverable

Replication yields a certificate with a canonical unique replica list and a
valid threshold. The availability port verifies it before checkpoint commit and
takeover. A missing, malformed, mismatched, or unverifiable certificate fails
closed.

### Crash between side effect and receipt

All continuity phases persist a `prepared` operation before invoking an
external port. Repositories enforce immutable IDs, availability certification
receives the stable operation ID, and restore recognizes an exact already
installed digest. A retry completes the same operation rather than creating a
new one.

### Concurrent coordinators

Continuity state changes use revision and predecessor-digest CAS. Bounded retry
prevents unbounded contention. A different pending operation blocks new work,
and operation ID reuse with different input is rejected.

### Logical-time rollback

The continuity state retains a high-water mark. Requests below it fail. The
authority must be unexpired, and snapshot time cannot precede the lifecycle
state high-water mark.

### Resource exhaustion

Operation history and CAS retry counts are bounded. Identifiers and replica
lists are validated, replica IDs must be unique, and thresholds cannot exceed
the certified set. Production repositories should additionally enforce record
size, retention, tenant quota, and request-rate limits.

### Sensitive content disclosure

The continuity contract accepts only a validated governed lifecycle state,
whose public contract is reference-only. Raw prompts, mission prose, model
inputs, tool payloads, and raw outputs are outside the snapshot contract.
Deployments must not attach opaque payloads to repository records.

## Required production properties

- Linearizable CAS for continuity state and destination restore.
- Atomic advancement of continuity state and its external monotonic head.
- Immutable artifact writes keyed by digest plus uniqueness by artifact ID.
- Authority decisions authenticated independently from the requesting process.
- Availability certificates derived from durable, independent replica
  acknowledgements and verified with deployment-specific authenticity checks.
- Durable audit retention for authority decisions, prepared/applied receipts,
  checkpoint lineage, and restore outcomes.
- Encryption, tenant isolation, access control, and deletion policy for stored
  metadata.

## Residual risks

The runtime cannot prove that an availability adapter represents genuinely
independent storage or that a restore adapter is linearizable. A compromised
authority service may designate a malicious holder. A lifecycle effect adapter
that ignores operation IDs may duplicate a prepared effect during the
lifecycle's later recovery; that risk belongs to the lifecycle effect boundary,
not checkpoint transport. These properties require deployment controls and
conformance testing.
