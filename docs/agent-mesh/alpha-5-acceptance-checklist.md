# Agent Mesh `0.3.0-alpha.5` acceptance checklist

Status: accepted. Implementation, coordinated publication, registry
verification and the annotated release tag are complete. Every checked item is
tied to the exact release commit and the machine-readable evidence below.

## Design and compatibility

- [x] Implementation plan, package boundaries and non-goals are reviewed.
- [x] Adapter threat model has zero unresolved P0/P1 findings.
- [x] `wireVersion: 0` and protocol fixtures remain unchanged.
- [x] All Alpha 4 public exports compile without source changes.
- [x] Runtime, Sessions, Rooms and Framework default behavior is unchanged.
- [x] Imports perform no network, database, migration or global-registration
      side effects.

## HTTP transport

- [x] The client sends one already signed envelope to one explicitly resolved
      allowlisted endpoint and does not follow redirects.
- [x] The handler bounds bytes before parsing and strictly parses one protocol
      envelope.
- [x] Method, route, media type, content encoding and response bytes are
      bounded and tested.
- [x] Abort, timeout, overload and retry hints have stable coarse outcomes.
- [x] Remote receipts reveal no signature, key, admission, replay, Trust,
      policy or database detail.
- [x] Channel authentication is optional, construction-bound and cannot be
      supplied by the remote envelope.

## Durable inbox, snapshot, journal and outbox

- [x] The full tenant/Mesh/peer/instance scope qualifies every persisted row.
- [x] Accepted receipt occurs only after the inbox transaction commits.
- [x] Exact duplicate receipt is idempotent and conflicting message-ID reuse
      fails closed.
- [x] Inbox claim and reclaim are bounded and generation-fenced.
- [x] Snapshot CAS, journal append, outbox insert and inbox settlement are one
      transaction.
- [x] A stale or expired claim cannot commit or settle work.
- [x] Journal entries are ordered, redacted and hash-chained from an explicit
      anchor.
- [x] Outbox delivery is at least once and retries the exact signed bytes.
- [x] No acknowledged message is lost across forced process restart.
- [x] No database failure leaves a partial state/outbox transition.
- [x] Migrations are explicit, schema-qualified, locked and status-reporting.
- [x] Destructive rollback requires exact confirmation and `allowDataLoss`.
- [x] Caller-owned PostgreSQL pools are not closed by the adapter.

## Room bridge

- [x] Room projection requires complete explicit Mesh policy and owner inputs.
- [x] Room role, authority level, metadata and actor fields cannot create Mesh
      authority or select an assignee.
- [x] The bridge does not sign, publish, bid, award, accept or execute work
      implicitly.
- [x] Inbound projection accepts only caller-asserted verified and accepted
      Work records.
- [x] Applying a projection cannot approve an artifact, complete a task or
      bypass Room policy.
- [x] Duplicate and cross-scope projection attempts are rejected or
      idempotently reported.
- [x] Sink failure can be retried with the same deterministic idempotency key;
      the documented no-duplicate guarantee is conditional on sink support.

## Multi-process and adversarial scenarios

- [x] Two independent processes exchange an authenticated protocol-v0
      envelope through HTTP and PostgreSQL.
- [x] Crash before inbox commit, after inbox commit, during processing, after
      transition commit and after remote receipt are covered.
- [x] Duplicate, reorder, timeout, overload, stale claim and stale assignment
      scenarios have deterministic assertions.
- [x] Database outage and recovery do not produce a false accepted receipt.
- [x] Graceful shutdown stops new claims and leaves recoverable work.
- [x] Example commands, configuration and expected redacted output are
      documented and reproducible.

## Quality and release

- [x] Build, public type tests, unit tests and adapter tests pass.
- [x] Inference Control and Trust scenario suites remain green.
- [x] Public terminology, dependency, secret and package audits pass.
- [x] All 33 packages install and import from cataloged tarballs.
- [x] Browser smoke covers every declared browser entrypoint.
- [x] Release manifest, packed files, versions and dependency ranges verify.
- [x] Security, architecture and release audits have zero unresolved P0/P1
      findings.
- [x] Dry publication succeeds for the exact release commit.
- [x] All 33 packages publish as `0.3.0-alpha.5` under npm `next`.
- [x] Registry consumer verification confirms every recorded SHA512 integrity.
- [x] Annotated tag `v0.3.0-alpha.5` resolves to the published commit.
- [x] Final release evidence is merged into public `main` with zero open items.

## Evidence

Normative design commit: `0de423c85cc6096a674ce2bc54915de7ea72aa1c`
([PR #43](https://github.com/Agentplat/agentplat/pull/43)).

Candidate implementation audit:
[Alpha 5 implementation audit](./alpha-5-implementation-audit.md).

Release commit: `5d11f715947bd7d3e5b8f7311c8f6f68c8c33a98`.

Implementation PR: [#44](https://github.com/Agentplat/agentplat/pull/44).

CI workflow:
[run 30678261671](https://github.com/Agentplat/agentplat/actions/runs/30678261671).

Dry publication:
[run 30678386400](https://github.com/Agentplat/agentplat/actions/runs/30678386400).

Coordinated publication and registry consumer:
[run 30678528244](https://github.com/Agentplat/agentplat/actions/runs/30678528244).

Annotated tag: `v0.3.0-alpha.5`, tag object
`a1929ac29e0e121f5ec4ab846d0778e3eef32e84`, resolving to the release commit.

Final evidence record:
[Alpha 5 release evidence](./alpha-5-release-evidence.json), including all 33
SHA512 integrities, npm publication timestamps and distribution-tag targets.
