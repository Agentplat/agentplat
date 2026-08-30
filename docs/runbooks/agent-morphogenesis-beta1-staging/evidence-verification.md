# Distributed staging evidence verification

Start from the frozen profile, exact source commit, bound environment inventory,
execution authorization and external public keys. Recompute every artifact
digest and reject mutable references. Verify provider-resolved cluster/node IDs,
three failure domains, image digests, TLS services, KMS canonical key and
independent rollback-witness domain against the inspection receipt.

Require the exact 22 canonical scenario IDs with no missing, duplicate or
unexpected entries; require their post-upgrade repetition and partition-time
authority subset. Verify at least 24 hours and 1,000 runs, tenant/mission
isolation, fault counts, deployments, schema upgrades, backup/restores, key
rotations, alert receipts and resource samples. Recompute receipt roots,
hash-chain continuity, SLO percentiles and all signatures using public keys.

Any absent, unverifiable or contradictory evidence fails closed. Diagnostic or
single-host preflight material cannot fill a distributed requirement. The final
bundle may state `beta1-distributed-staging-profile-established` only when every
gate passes. It must still state `productionReadiness: not-established` and
`productionClaimPermitted: false`; a production pilot needs a separate
authorization and acceptance contract.
