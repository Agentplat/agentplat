# Beta 8 distribution record — 2026-09-14 (UTC)

All 65 packages in the public catalog are published at `0.3.0-beta.8`, with
all 65 `next` tags aligned. Publication and final verification completed on
2026-09-14 UTC (2026-09-13 in America/Montevideo). `latest` was unchanged for
every package; no stable promotion was performed.

## Source and immutable artifacts

- Published source: `0e1e34e8755bfdecf708314130cc2385b4797f95`.
- [Reconciliation PR #170](https://github.com/Agentplat/agentplat/pull/170): merged;
  includes local Morphogenesis coverage, corrected diagnostic convergence
  projection and dependency/toolchain reconciliation.
- [Preparation and OIDC staging run](https://github.com/Agentplat/agentplat/actions/runs/34793919073): successful.
- Artifact: `npm-release-0e1e34e8755bfdecf708314130cc2385b4797f95-all-next`.
- Manifest digest: `sha256-Q2fJLx0/55orxToaPFgKXNfRUQd873q5RiiGyWvf5Vw=`.
- All 65 staged tarballs were downloaded and compared byte for byte with the
  originating GitHub artifacts before individual npm 2FA approval.
- Public registry inspection at `2026-09-14T02:01:56.081Z` confirmed all 65
  exact versions, aligned tags and resolved catalog dependencies.

The earlier Beta 8 cohort from `bf6bdae` was never publicly approved. Its
GitHub artifact expired during the approval interval. All 65 staged entries
were compared and retired before replacement staging. PR #174 raised artifact
retention to 30 days; the replacement cohort and its provenance use the source
above. Historical local copies remain preserved and are not substituted for
GitHub's source-bound artifact.

## Approved-release verification

The [complete approved-release verification](https://github.com/Agentplat/agentplat/actions/runs/34797827606)
finished successfully while the exact published source remained at `main` HEAD.

| Check | Result |
| --- | --- |
| Registry bytes, integrity, signatures, provenance and tag | Passed against the originating artifact |
| Coordinated public distribution | 65/65 packages published and `next` aligned |
| Clean pnpm portable consumer, Node 24.20.0 | Passed exact-version imports, declarations and functional checks |
| Clean pnpm PostgreSQL consumer, PostgreSQL 16 | Passed durable consumer scenarios |
| Clean npm portable consumer, Node 22.22.0 | Passed exact-version imports and functional checks |

The consumer cohort covers all 65 packages and 216 export subpaths. These
checks consume published packages from npm, not workspace links. The final
reconciliation documentation is a later source-only change and does not alter
published package code.

## Review settings and channels

The owner explicitly authorized self-review only for Beta 8, scope `all`, tag
`next`. Artifact comparison, OIDC stage-only publishing and npm 2FA remained
required. After the final approval, `npm-production` was restored to
`prevent_self_review=true`, with `can_admins_bypass=false`. Both temporary
owner-review variables were removed. Governance verification passed with no
findings. The permanent owner PR-review exception remains limited to its
review ruleset and does not bypass required CI.

No `latest` tag changed. External downstream validation and stable API
promotion review remain outstanding under the release-channel criteria.
Historical public staging aliases remain historical metadata; none represents
an unpublished part of this Beta 8 cohort.

## Evidence boundary

This release establishes coordinated distribution and bounded executable
consumer checks. It does not establish a completed distributed Morphogenesis
staging campaign, long-duration host-loss qualification, a full registered
empirical campaign or production-scale readiness. The frozen baseline and
historical evidence remain unchanged. See the
[development reconciliation](../development-status-2026-09-11.md) for deferred
work and its closure criteria.
