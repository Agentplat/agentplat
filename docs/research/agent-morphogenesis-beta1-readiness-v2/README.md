# Agent Morphogenesis Beta 1 operational readiness evidence V2

Status: `beta1-local-profile-established` for source commit
`d8b2d45c41ee50cf2435d8791082cc78fbce411b`.

V2 supersedes V1 and enforces the exact registered set of 22 scenario IDs. The
supervised local/staging profile ran for 1,801,621 ms and completed 120
PostgreSQL/Temporal vertical-slice iterations, six four-peer Agent Mesh cycles,
three PostgreSQL connection-loss recoveries, authorization expiry/key rotation,
all six crash boundaries and an explicit supervisor restart/resume.

Observed SLO results:

- exact scenario coverage: 22/22, with no missing or unexpected IDs;
- nominal p95: 600 ms (limit 5,000 ms);
- recovery p95: 10,575 ms (limit 15,000 ms);
- supervisor resume: 9,280 ms (limit 30,000 ms);
- peak RSS: 537,378,816 bytes (limit 1,073,741,824);
- peak aggregate CPU: 140.3% (limit 400%);
- PostgreSQL growth: 20,299,776 bytes (limit 536,870,912);
- Temporal growth: 3,862,528 bytes (limit 536,870,912);
- duplicate effects, unauthorized activations, lost receipts and head forks: 0;
- mission continuity: 1;
- external spend: USD 0.

The evidence includes 455 resource samples, 138 consolidated operation
receipts, 124 operation metric records and a hash-chained supervisor journal.
The bundle and readiness attestation are signed with Ed25519. Only public keys
are published; ephemeral private keys were destroyed.

## Claim boundary

Operational readiness is established only for this bounded Beta 1 local/staging
profile. Experimental evidence remains uncollected. Production readiness and
security certification are not established, and production claims are
prohibited. The frozen V1 baseline and excluded future capabilities remain
unchanged.

Run `pnpm verify:agent-morphogenesis-beta1-operational-readiness-evidence` to
recompute coverage, digests, roots, signatures, SLOs, source bindings and claim
boundaries.
