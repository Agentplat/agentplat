# Agent Mesh `0.3.0-alpha.5` acceptance checklist

Status: open. Every checkbox requires evidence tied to the exact release
commit. A passing test on another commit is not evidence.

## Design and compatibility

- [ ] Implementation plan, package boundaries and non-goals are reviewed.
- [ ] Adapter threat model has zero unresolved P0/P1 findings.
- [ ] `wireVersion: 0` and protocol fixtures remain unchanged.
- [ ] All Alpha 4 public exports compile without source changes.
- [ ] Runtime, Sessions, Rooms and Framework default behavior is unchanged.
- [ ] Imports perform no network, database, migration or global-registration
      side effects.

## HTTP transport

- [ ] The client sends one already signed envelope to one explicitly resolved
      allowlisted endpoint and does not follow redirects.
- [ ] The handler bounds bytes before parsing and strictly parses one protocol
      envelope.
- [ ] Method, route, media type, content encoding and response bytes are
      bounded and tested.
- [ ] Abort, timeout, overload and retry hints have stable coarse outcomes.
- [ ] Remote receipts reveal no signature, key, admission, replay, Trust,
      policy or database detail.
- [ ] Channel authentication is optional, construction-bound and cannot be
      supplied by the remote envelope.

## Durable inbox, snapshot, journal and outbox

- [ ] The full tenant/Mesh/peer/instance scope qualifies every persisted row.
- [ ] Accepted receipt occurs only after the inbox transaction commits.
- [ ] Exact duplicate receipt is idempotent and conflicting message-ID reuse
      fails closed.
- [ ] Inbox claim and reclaim are bounded and generation-fenced.
- [ ] Snapshot CAS, journal append, outbox insert and inbox settlement are one
      transaction.
- [ ] A stale or expired claim cannot commit or settle work.
- [ ] Journal entries are ordered, redacted and hash-chained from an explicit
      anchor.
- [ ] Outbox delivery is at least once and retries the exact signed bytes.
- [ ] No acknowledged message is lost across forced process restart.
- [ ] No database failure leaves a partial state/outbox transition.
- [ ] Migrations are explicit, schema-qualified, locked and status-reporting.
- [ ] Destructive rollback requires exact confirmation and `allowDataLoss`.
- [ ] Caller-owned PostgreSQL pools are not closed by the adapter.

## Room bridge

- [ ] Room projection requires complete explicit Mesh policy and owner inputs.
- [ ] Room role, authority level, metadata and actor fields cannot create Mesh
      authority or select an assignee.
- [ ] The bridge does not sign, publish, bid, award, accept or execute work
      implicitly.
- [ ] Inbound projection accepts only caller-asserted verified and accepted
      Work records.
- [ ] Applying a projection cannot approve an artifact, complete a task or
      bypass Room policy.
- [ ] Duplicate and cross-scope projection attempts are rejected or
      idempotently reported.
- [ ] Sink failure can be retried with the same deterministic idempotency key;
      the documented no-duplicate guarantee is conditional on sink support.

## Multi-process and adversarial scenarios

- [ ] Two independent processes exchange an authenticated protocol-v0
      envelope through HTTP and PostgreSQL.
- [ ] Crash before inbox commit, after inbox commit, during processing, after
      transition commit and after remote receipt are covered.
- [ ] Duplicate, reorder, timeout, overload, stale claim and stale assignment
      scenarios have deterministic assertions.
- [ ] Database outage and recovery do not produce a false accepted receipt.
- [ ] Graceful shutdown stops new claims and leaves recoverable work.
- [ ] Example commands, configuration and expected redacted output are
      documented and reproducible.

## Quality and release

- [ ] Build, public type tests, unit tests and adapter tests pass.
- [ ] Inference Control and Trust scenario suites remain green.
- [ ] Public terminology, dependency, secret and package audits pass.
- [ ] All 33 packages install and import from cataloged tarballs.
- [ ] Browser smoke covers every declared browser entrypoint.
- [ ] Release manifest, packed files, versions and dependency ranges verify.
- [ ] Security, architecture and release audits have zero unresolved P0/P1
      findings.
- [ ] Dry publication succeeds for the exact release commit.
- [ ] All 33 packages publish as `0.3.0-alpha.5` under npm `next`.
- [ ] Registry consumer verification confirms every recorded SHA512 integrity.
- [ ] Annotated tag `v0.3.0-alpha.5` resolves to the published commit.
- [ ] Final release evidence is merged into public `main` with zero open items.

## Evidence

Normative design commit: pending.

Release commit: pending.

Implementation PR: pending.

Release workflow: pending.

Registry verification: pending.

Final evidence record: pending.
