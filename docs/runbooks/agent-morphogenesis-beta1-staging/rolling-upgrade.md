# Rolling upgrade

Bind the predecessor and successor images by registry digest and source commit.
Verify protocol compatibility, database migration direction, Temporal workflow
compatibility and the exact 22-scenario catalog before changing a worker. Keep
the decision authority and external KMS identity unchanged during the rollout
unless key rotation is the explicit test under observation.

Upgrade one effects-fenced canary in the first failure domain. Re-run nominal
agent/person/quorum paths, then allow bounded effects. Continue one domain at a
time while maintaining quorum and at least one predecessor process. After each
step record pod/node identity, wire version, morphology head, pending inbox and
outbox counts, committed receipts and alerts. Repeat all canonical scenarios
after the final step as required by the frozen qualification profile.

Stop when a receipt is lost, an effect duplicates, an old authorization is
accepted, a morphology head forks, mission continuity drops or a tenant scope
crosses. Fence new decisions and follow rollback without deleting PostgreSQL,
Temporal history or the independent witness. A successful rolling upgrade is
one campaign component; it is not by itself staging qualification and never
permits a production claim.
