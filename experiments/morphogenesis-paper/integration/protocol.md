# Integration pilot design - 2026-09-19

This extends, and does not replace, the eleven-case v0.2 boundary pilot.
It uses local PostgreSQL, the production Morphogenesis head/execution/budget
adapters, TeamFormationRuntime with a test PostgreSQL CAS adapter, and the
production Collective Work reducers/repository. Discovery, capability attestations
and membership observations are fixtures. No claim of a complete Mesh deployment
or external provider integration is made.

## Prespecified cases

1. Two exact proposals and separately signed approvals, with distinct authorized
   specialists, share one morphology predecessor. Activate their Teams and Work
   contracts, then race the morphology commits. Observe rather than suppress
   owner rejection, residual effects, or pending execution records. Clean up a
   losing Team and its Work contracts through their respective owners and retain
   both before/after records. Cleanup of owner state is not necessarily terminal
   completion of the Morphogenesis execution state.
2. Keep the organizational decision valid but advance the owner's wall clock past
   the Work mandate expiry before Team activation. The actual authority reducer
   must reject admission before a Work contract or active Team is produced.
3. Admit two decisions under the same source observations and bind source policy,
   target invariants and the Team position mapping explicitly. Verify substituted
   candidates are rejected by the actual decision verifier.
4. Reopen PostgreSQL state through a new pool and compare retained digests.
5. Extension recorded after the initial race/expiry development runs: start a
   local application work promise under the winner's active Work contract, revoke
   the contract using the production reducer/fence bridge, reject new admissions,
   and keep detachment pending until the already-admitted promise completes.
   Reconcile detachment with its original operation identity and complete the
   winning Morphogenesis execution. Admission/draining checks are an explicit
   application adapter; this is not an ActionGateway or external provider test.

This pilot uses one prescribed schedule per case. It is neither a reliability
estimate nor a four-condition mission utility study. Local Ed25519 signatures
bind the test approvals; the self-generated keys do not attest a real-world
identity. The rollback witness is process-local and does not establish host-loss
or database-rollback safety. Database access is restricted to loopback, with a
dedicated test container. Preserve failed attempts and exact code bindings.
