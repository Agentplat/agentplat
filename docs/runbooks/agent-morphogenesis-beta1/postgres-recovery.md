# Agent Morphogenesis Beta 1 PostgreSQL recovery runbook

On connection loss, stop new mutations and retain the current operation ID.
Reconnect with a new pool, verify migration head 009, then load and validate the
Workflow run, Morphogenesis execution record, morphology head, budget
reservation and external rollback witnesses.

Resume from the retained phase using CAS. A missing witness, changed digest,
revision rollback or fork fails closed. Do not recreate a reservation or effect
under a new identity. Recovery succeeds when the original receipt is returned,
pending connections drain and no duplicate row or material effect exists.
