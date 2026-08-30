# Agent Morphogenesis Beta 1 operational readiness evidence V1

Status: **superseded; does not establish operational readiness**.

This retained V1 attempt used the correct material boundary but emitted
`crash-after-fence-before-detach-or-retire` instead of the registered scenario
ID `crash-after-fence-before-terminal-agent`. The terminal coverage audit found
one missing and one unexpected ID. V2 repeats the complete 30-minute soak on a
corrected source commit and is the authoritative readiness evidence.

Historical source commit:
`b36bc5885855519e1ea7b7cbdf1c6588e03d6f4b`.

The supervised local/staging profile ran for 1,804,745 ms and completed 120
PostgreSQL/Temporal vertical-slice iterations, six four-peer Agent Mesh cycles,
three PostgreSQL connection-loss recoveries, authorization expiry/key rotation,
all six crash boundaries and an explicit supervisor restart/resume.

Observed SLO results:

- nominal p95: 608 ms (limit 5,000 ms);
- recovery p95: 10,569 ms (limit 15,000 ms);
- supervisor resume: 6,201 ms (limit 30,000 ms);
- peak RSS: 537,575,424 bytes (limit 1,073,741,824);
- peak aggregate CPU: 139% (limit 400%);
- PostgreSQL growth: 25,698,304 bytes (limit 536,870,912);
- Temporal growth: 3,596,288 bytes (limit 536,870,912);
- duplicate effects, unauthorized activations, lost receipts and head forks: 0;
- mission continuity: 1;
- external spend: USD 0.

The evidence includes 456 resource samples, 138 consolidated operation
receipts, 124 operation metric records and a hash-chained 71-event supervisor
journal. The bundle and readiness attestation are signed with Ed25519. Only
public keys are published; ephemeral private keys were destroyed.

## Claim boundary

The signed V1 bundle is retained for incident traceability but its readiness
claim is superseded and invalid. Experimental evidence remains uncollected. Production readiness and
security certification are not established, and production claims are
prohibited. The frozen V1 baseline and excluded future capabilities remain
unchanged.

Run `pnpm verify:agent-morphogenesis-beta1-operational-readiness-evidence` to
recompute all digests, roots, signatures, SLOs, source bindings and claim
boundaries.
