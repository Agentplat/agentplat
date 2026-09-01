# Agent Morphogenesis Beta 1 Temporal recovery runbook

Temporal owns wakeups and retry history, not AgentPlat authority. Stop the
failed worker, retain its task queue and Workflow ID, and start a replacement
worker from the same source commit. The activity must reopen PostgreSQL before
reconciling a prepared operation.

If notification was lost after commit, run the Workflow reconciler. A running
Task lease is not stolen before expiry. The replacement may publish only the
receipt for the original operation ID. History substitution, a different task
binding or reconstructed authority from Temporal fails closed.
