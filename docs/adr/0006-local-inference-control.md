# ADR 0006: Inference control is local and capability-aware

- Status: Accepted
- Date: 2026-07-29

## Context

An agent provider may own a complete model loop, stream output incrementally or
invoke provider-native tools. A check performed only after `AgentRuntime.run()`
cannot prevent an internal tool call or retract content that has already been
released.

Agent Mesh also receives content from peers with different trust levels. That
content must not become trusted instructions merely because it is present in
the execution context.

## Decision

Introduce `@agentplat/inference-control` as an independent, provider-neutral
layer that can be used with or without Agent Mesh.

The layer provides:

- trusted and untrusted context zones with provenance;
- objective, role, constraint and budget anchoring;
- pre-run, streaming, post-run, pre-tool and pre-message checkpoints;
- structured assessments with reason codes and uncertainty;
- bounded revise, retry, challenge, abstain, escalate and deny decisions;
- buffered, incremental and observe-only release modes;
- an Action Gateway that validates short-lived action grants;
- provider capability declarations for input inspection, output assessment,
  stream interruption, tool interception and optional representation access.

Policies fail closed when they require a control capability the selected
provider cannot supply. Observe mode emits evidence but does not claim
enforcement. High-risk output and actions use buffered evaluation.

Action grants bind the objective, work item, peer, epoch, fencing token, action,
optional input digest, source assessment and expiry. Grants can be single-use.

## Consequences

- The existing runtime, model and tool contracts remain source compatible.
- Runtime and tool wrappers enforce controls without adding vendor SDKs to the
  public core.
- Provider-native tools that cannot be intercepted are explicitly unsupported
  for policies that require tool enforcement.
- Optional representation probes may be added later, but closed-model
  providers remain supported only for controls observable at their provider
  boundary. Representation-level controls and unobservable tool enforcement are
  unavailable.
- Assessments are evidence for a local policy decision; they are not presented
  as mathematical guarantees.
- Raw prompts, private reasoning and secrets are not emitted as normal
  telemetry.
