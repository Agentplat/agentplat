# Temporal worker recovery

Bind the Temporal resource ID, namespace, TLS endpoint, workflow code digest
and task queues before failure injection. Capture open workflow IDs, histories,
Morphogenesis execution phases and PostgreSQL receipt roots. Ensure workers are
spread across all three failure domains and use the same authorized source
commit.

Terminate one worker process, then all workers in one failure domain. Do not
delete workflows or reset histories. Replacement workers must replay existing
history, reconcile prepared external effects and resume without duplicate
material action. Repeat at least six worker-loss cycles, including one during a
rolling upgrade. Verify workflow completion, deterministic replay, mission
continuity, receipt preservation and no unauthorized activation after each
cycle.

If replay is nondeterministic, a task is stuck, history is missing or an effect
becomes indeterminate, stop new decisions and fence protected execution. Retain
histories and logs for diagnosis; do not force-complete workflows. Record killed
and replacement node identities, workflow/run IDs, recovery latency, replay
status and reconciled receipts. Temporal recovery alone establishes neither
staging nor production readiness.
