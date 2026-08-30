# Distributed deployment

Use this runbook only after the external inventory passes
`inspect:agent-morphogenesis-beta1-staging-environment`. The inspection receipt
must bind a clean source commit, immutable image digest, cluster ID, at least
three distinct zones and node UIDs, TLS PostgreSQL and Temporal endpoints, four
Agent Mesh identities, six processes, external key custody, an independent
rollback witness and observability endpoints.

Before deployment, verify provider identity read-only and compare every
resolved resource ID with the inventory. Apply database migrations once under
a dedicated migration identity. Start one canary worker with effects fenced,
then one Mesh process per failure domain. Confirm health, KMS signing,
rollback-witness read/write separation, Temporal namespace, PostgreSQL CAS and
alert delivery before scaling to the declared process count.

Abort on a mutable image, placement collapse, TLS downgrade, identity mismatch,
missing receipt, authority widening, witness failure or cross-scope result.
Fence new Morphogenesis decisions, preserve existing durable work and invoke
the rollback runbook. Record provider placement, rollout revisions, image
digests, migrations, health observations and authorization digest in the
deployment receipt. Deployment success does not establish staging or
production readiness; only the completed signed campaign may change the
staging claim.
