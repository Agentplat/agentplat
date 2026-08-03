# Beta 3 increment 12 review: campaign readiness

Date: 2026-08-03

## Decision

Increment 12 is accepted at the open-core implementation boundary. AgentPlat
now has a provider-neutral, non-executing readiness gate that binds an exact
source, registered operation and fixed capacity envelope to a closed set of
content-addressed verification receipts.

This decision does not assert that the final release candidate is ready to run.
The protected five-cell preflight has not yet been executed for that immutable
source, so the final assessment remains deliberately pending. Readiness cannot
authorize the 240-cell campaign, deploy infrastructure, publish a package or
call a paid provider.

## Delivered boundary

### Derived readiness decision

- Public V1 estimate, plan, evidence-receipt and assessment contracts are
  strict, immutable, domain-separated and exported only from the evaluation
  subpath.
- The estimate fixes 240 cells, 960 slots, 48 shards, at most two concurrent
  shards, 3,296,000 interactions, 96,000,000 trace events, 15 GiB of artifact
  capacity and bounded runner-minutes.
- Monetary cost is `requires_operator_rate_card`; no provider price or budget is
  invented by the public contract.
- The recommendation is derived from exactly twelve controls. Missing, failed,
  duplicate, extra, corrupt or cross-source evidence yields `no_go`.
- Every artifact keeps `executionPermitted` and `fullCampaignPermitted` false.
  Campaign outcomes and release outcomes remain separate pending sets.

### Evidence and workflow custody

- The CLI creates immutable planning artifacts, hashes bounded public evidence,
  validates protected-preflight receipts and derives the exact assessment.
- A passing durable-preflight receipt can be produced only by the dedicated
  verifier. A missing or rejected preflight may produce only a failed receipt.
- The preflight verifier requires one authorization receipt and the exact first
  plus fresh-process-resume receipt pair for the same execution, authorization,
  source, operation, adapter and projection root.
- The manual workflow verifies the referenced run's repository, workflow path,
  event, branch, source commit, completion and conclusion before consuming its
  artifacts.
- Failed or absent technical evidence is materialized as a failed receipt so
  the terminal result is a diagnostic `no_go`, not a missing assessment.
- The workflow has read-only repository/action permissions, pinned actions, no
  schedule and no execution, deployment or publication branch.

### Portable and operational checks

- The complete public surface installs from 39 local tarballs under isolated
  pnpm and npm consumers without workspace links.
- Node 20 and Node 22 receive separate readiness controls; the PostgreSQL
  consumer packs the same 39 packages and performs 14 durable conformance cases
  without registry reads.
- Canary coverage spans logs, traces, reports, snapshots and tarball manifests.
  Required evidence-write failure still occurs before dispatch.
- PostgreSQL retention refuses to prune an indeterminate grant and preserves the
  required retained-chain anchor after the state becomes safe.
- Integrated replanning demonstrates a causal benign dependency failure that
  supersedes the prior fragment and changes the recovery role.

## Verification evidence

The following local gates were executed from an isolated worktree based on
`b65c39c1f4caeef04993ae2a92f74301058112b2`:

| Gate                                                     | Result                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| Public source, terminology and secret audit              | Passed: 1,633 files, zero findings                                |
| TypeScript build and public type contracts               | Passed for 39 public packages                                     |
| Root unit and contract suite                             | Passed: 771, failed: 0, skipped: 1, todo: 6                       |
| Focused Increment 12 suite                               | Passed: 20/20                                                     |
| Existing compatibility, fixtures and control-plane gates | Passed                                                            |
| Packed pnpm/npm consumer                                 | Passed: 39 tarballs and 64 public surfaces                        |
| PostgreSQL Collective Control integration                | Passed: 2/2                                                       |
| PostgreSQL registered custody integration                | Passed: 7/7                                                       |
| Packed PostgreSQL consumer                               | Passed: 39 packages and 14 conformance cases; zero registry reads |
| Production dependency audit                              | Passed: 0 critical, 0 high, 1 moderate                            |

The root check reached and passed every build, type, unit, adapter,
compatibility, fixture and control-plane stage. Its final pack step was rerun
independently with registry access after the sandbox denied DNS; that exact
consumer gate passed.

## Dependency disposition

`fast-uri` is fixed at `3.1.5`, `ip-address` at `10.4.0` and `hono` at
`4.12.34`. The remaining moderate advisory is in
`@hono/node-server@1.19.14`, reached transitively through the OpenAI Agents MCP
dependency. Its fix requires a major `2.x` transition. The affected Windows
static-file serving path is not imported by AgentPlat, and the readiness gate
does not allowlist or suppress the advisory: its identifier and severity remain
visible in the sanitized audit. Any future high or critical advisory fails the
gate.

## Operational closure still pending

After this implementation is merged to `main`, two bounded actions remain:

1. execute the existing protected five-cell/twenty-slot preflight and
   fresh-process resume against that exact source; and
2. run the readiness assessment against the exact successful preflight run.

A successful assessment may return `ready_for_operator_authorization`, which is
still non-authoritative. It cannot start the full campaign. The 48 campaign
shards, statistical claims, exact-registry consumers, release tag, package
publication, deployment and paid-provider traffic remain separately deferred
and fail closed.
