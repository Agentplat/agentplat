# Tenant and mission isolation incident

Treat any cross-tenant read, write, effect, authority use or receipt acceptance
as a qualification failure, even if no user content is exposed. Record the
request identity, tenant, mission, scope digest, operation ID, database scope,
workflow run and receiving component without copying sensitive payloads into
the incident record.

Immediately fence Morphogenesis for the affected tenants and any shared
component. Revoke the suspect execution authorization, preserve KMS and Mesh
audit events, snapshot relevant PostgreSQL and Temporal identifiers and stop
automatic retries that could repeat an effect. Do not delete or rewrite the
cross-scope receipt. Determine whether the fault occurred at storage lookup,
workflow idempotency, Mesh routing, decision binding or effect release.

Recovery requires a code/configuration fix, clean restore when necessary, exact
repetition of the 3-tenant/2-mission probe and all authority-sensitive canonical
scenarios, with zero accepted crossings. Record containment and recovery times,
root cause and evidence digests. The campaign cannot qualify with a waived
isolation violation; it must be rerun under a new authorization and evidence
bundle. No failed or rerun campaign permits a production claim.
