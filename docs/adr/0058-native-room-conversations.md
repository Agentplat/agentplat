# ADR 0058 Native Room conversations and Planner continuity

Status: implemented in source, pending coordinated distribution.

## Context

Room messages currently provide a flat transcript. Applications can put reply
references in metadata, but every consumer then implements its own relationship
validation, pagination and context filtering. Planner operations and workflow
receipts need stable bindings so a retry cannot move an answer into another
conversation. Mail assistance and support-ticket applications need the same
mechanisms while retaining different relevance and notification policies.

## Decision

Add optional native `threadId`, `replyToMessageId` and message direct-recipient
references to existing Room contracts. A thread is identified by an immutable
root message, including a historical unthreaded message when explicitly replied
to. No additional thread lifecycle or execution authority is introduced.

Resolve relationships from scoped storage inside the message transaction.
Include normalized links in exact replay checks and durable domain events.
Declare repository support explicitly, with indexed message pages in the
memory and PostgreSQL adapters. Migration 020 is additive; older message inputs
and older schemas continue to work for legacy operations.

Threaded task context defaults to its conversation and relevant artifact/memory
provenance. A trusted host may grant coordinator-wide context or selected extra
evidence. That policy is not a model argument and does not replace authorization
at retrieval/tool sinks. Keep a bounded serialized context and explicit provenance.

Propagate bindings through Planner tasks, objectives, operations, calls, workflow
inputs and delivery notifications. A model proposal cannot redirect a task's
conversation. External and timer events remain attributed evidence, not owner
requests or permission to create objectives. Direct events remain in Planner's
state without requiring a redundant inference turn.

## Consequences

Applications retain UI, provider authentication, event collection, relevance
policies, default routing, worker operation and external delivery. The same
contracts support mail and support tickets. Custom adapters opt in rather than
silently dropping new fields. Native writes require migration 020; old adapters
must not run against an unknown newer migration ledger.

Tests cover shared memory/SQL scenarios, historical data, keyset cursors,
cross-scope rejection, coordinator delegation, exact replays, workflow conflicts
and restart recovery. Deterministic tests establish software behavior, not
general reasoning competence or provider reliability.
