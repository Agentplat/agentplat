# Proposed instruction appendices

Status: design text for review, not used in any runs. These appendices will follow
the unchanged official task instruction. Placeholders will be resolved from the
manifest, not through task-specific choices. Tool interface documentation will
be saved and hashed alongside the prompt.

## Shared by all three arms

```text
Complete the original task above and leave the requested deliverables in the
specified locations. You may inspect the provided inputs and test your own work.
Do not search for or access benchmark reference solutions or official verifier
files. No human will provide assistance during this run.

The entire system has a total deadline of {{agent_timeout_seconds}} seconds and
a shared model-call budget of USD {{run_budget_usd}}, including all participants
and internal retries. Use only the configured model and available tools.
Do not create additional model clients or change the evaluation configuration.

Signal completion through {{completion_mechanism}} only when the deliverables
are ready and no worker is still changing them. If you cannot finish, state that
explicitly. A completion statement does not determine the evaluator's result.
```

## A — individual

```text
Work in this single Claude Code session. Do not create teammates, subagents or
other agent sessions. Decide your own approach to the original task.
```

## B — Agent Teams

```text
Act as the coordinator. Use native Claude Code Agent Teams to start exactly two
generic teammates, worker-1 and worker-2, using the configured model. Do not use
ordinary subagents, nested teams or any additional agent identities.

Give both workers access to the original task instruction and assign each work.
Decide the division yourself; you may also perform task work. Use native team
coordination to exchange findings and consolidate the requested deliverables.
Each worker must respond at least once; no fixed tool use or equal workload is
required. Coordinate file ownership as you judge appropriate.
```

## C — AgentPlat

```text
Act as the coordinator. Use the AgentPlat Room coordination tools to work with
exactly the two generic participants worker-1 and worker-2, using the configured
model. Do not use native Agent Teams, subagents or additional agent identities.

Give both workers access to the original task instruction and assign each work.
Decide the division yourself; you may also perform task work. Use Room tasks and
messages to exchange findings and consolidate the requested deliverables.
Each worker must respond at least once; no fixed tool use or equal workload is
required. Coordinate file ownership as you judge appropriate.
```

## Generic worker initialization

B's native mechanism and C's bridge must preserve their respective session
contexts. The explicit worker instruction will be generic in both:

```text
You are {{worker_id}} in a three-agent team. Follow the coordinator's assignment
within the original task and shared limits. Report your findings through the
available coordination tools. Do not create additional agents or change models.
```

Freeze how workers receive the original instruction, which history they receive,
and which messages they can access. If the native configuration cannot accept
part of the initialization text, document the difference before evaluation.
Do not describe different contexts as identical.

These appendices prescribe no algorithms, solutions, or business-specific roles.
The `completion_mechanism` placeholder must be resolved after reliable mechanical
termination is demonstrated during preparation; it is not an API implemented by
this document.

[Back to protocol](protocol.md)
