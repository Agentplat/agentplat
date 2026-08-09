# Long-Horizon Context Integrity V1 implementation plan

Status: implemented

## Product outcome

Long-Horizon Context Integrity V1 provides a concrete, provider-neutral local
controller for adversarial and contradictory context. It evaluates bounded
inputs before inference, retains content-free longitudinal risk state and
allows a model or Portable Agent to continue with a safe subset only when an
exact construction-bound filter is installed.

This feature is additive and opt-in. It is not a global truth service, a prompt
firewall claim, an assignment mechanism or effect authority.

## Public surface

- `@agentplat/inference-control/context-integrity` owns browser-safe contracts,
  canonical digests, validators, the pure reducer, the CAS runtime and
  provider-neutral analyzers.
- `@agentplat/inference-control/context-integrity/model` adapts immutable
  `ContextEntryV1` records into the controller and filters the exact context
  set before `ControlledModelExecutorV1` calls a provider.
- `@agentplat/inference-control/context-integrity/portable-agent` supplies a
  manifest-bound adapter wrapper, a control port for pre-step, post-output and
  pre-action enforcement, and state handoff continuity that can be coordinated
  alongside an application checkpoint.

## Content boundary

Raw text or JSON exists only in the ephemeral analyzer call and in the owning
runtime. Requests, decisions, snapshots, revision heads and handoff records retain
only identifiers, source zones, memory tiers, revisions, digests, bounded
scores and reason codes. No prompt, model output, tool input, credential or
hidden reasoning is persisted by this controller.

Each item binds:

- tenant/session/agent/Objective scope through its request;
- item, source and source-revision identity;
- source zone and memory tier;
- content and provenance digests;
- logical observation and exclusive expiry times; and
- optional claim key/value digests and independent corroboration groups.

## Memory tiers

The closed V1 hierarchy is:

1. `doctrine` — locally installed invariant instructions;
2. `mission` — current Objective and mission context;
3. `role` — exact current role revision;
4. `episodic` — retained content-free history; and
5. `working` — current step inputs and outputs.

The controller stores heads and a bounded score window, not the original
content. Retention is therefore independent of prompt length and total mission
duration.

## Analyzer contract

An analyzer returns one request- and item-bound assessment with:

- risk, uncertainty and instruction-conflict scores in basis points;
- a closed disposition: `clear`, `caution`, `quarantine`, `deny` or
  `unavailable`;
- bounded threat kinds, reason codes and evidence digests;
- analyzer identity, implementation digest and monotonic revision.

The built-in reference analyzer combines source-zone baselines with explicit
portable lexical rules. A composite analyzer can conservatively combine it
with application-owned semantic entropy, representation probe, classifier or
model-based analyzers. Analyzer output never grants authority.

## Conservative reduction

For each item the reducer applies, in order:

1. request/content/provenance binding mismatch -> reject;
2. missing, expired, future or unavailable assessment -> isolate;
3. source or analyzer revision rollback -> isolate;
4. same-revision digest conflict -> deny;
5. divergent claim values from independent sources -> require corroboration;
6. insufficient independent corroboration -> require corroboration;
7. deny threshold or analyzer denial -> deny;
8. quarantine threshold or excessive uncertainty -> isolate;
9. caution threshold -> restrict; and
10. otherwise admit.

Only `admit` and `restrict` can reach a provider or Portable Agent adapter.
`isolate` and `require_corroboration` are withheld. `deny` blocks the protected
operation.

If withholding changes the input set, the request must carry an allowed
filter-binding digest. Without that exact binding, the overall decision fails
closed. This prevents a control-only installation from claiming quarantine
while still passing the original content downstream.

## Longitudinal behavior

State retains:

- logical-time and step-count high-water marks;
- per-item `(sourceVersion, sourceRevision)` and analyzer revision heads;
- a bounded window of aggregate risk, uncertainty and conflict;
- degraded, adverse and recovery streaks;
- intervention totals;
- the last exact request and decision for idempotent retry; and
- canonical decision/state digests and predecessor-state continuity.

Risk is sticky across individual healthy steps. Recovery requires the exact
policy-defined consecutive healthy count. State is bounded independently of
10,000 or more inference steps.

## Productive integrations

### Controlled Model

The executor resolves the original immutable entries, evaluates the complete
ordered set, validates the returned decision and renders only admitted or
restricted entries. Provider-request assessment still runs afterward and sees
the digest of the filtered request.

### Portable Agent

The control port evaluates the original request before a step. When isolation
is required it returns allow only for the exact protected adapter wrapper. The
wrapper obtains the idempotent decision and removes withheld observations
before invoking the underlying heterogeneous adapter. Post-output and
pre-action checkpoints cannot be filtered and therefore deny or abstain when
the decision is not safe.

### Role and candidate state

A content-free projection maps controller status and rolling uncertainty into
role-alignment and capability-state source inputs. It cannot activate a role,
select a peer, create Work or grant an action.

## Persistence and handoff

The productive runtime uses revision-checked compare-and-swap saves with
bounded retries. The in-memory store is for local use and tests. Production
deployments provide a durable implementation.

Portable handoff binds the exact controller snapshot and source-state digest
to one target state key. Applications coordinate that envelope alongside the
corresponding application checkpoint. A handoff cannot reset adverse history
or replace policy, controller or analyzer bindings.

## Compatibility

- Existing executors, adapters, controls and snapshots are unchanged when the
  feature is absent.
- Existing wire and persistence schemas are not widened.
- Model and Portable Agent integration is construction-bound and opt-in.
- Browser-safe code imports no Node built-in or vendor SDK.
- Closed-model adapters require only ordinary input/output interception.
- Representation-level steering remains an optional analyzer/intervention
  adapter, never a mandatory provider capability.

## Completion criteria

- a hostile untrusted instruction is physically absent from the provider or
  adapter request while safe context continues;
- contradictory claims from independent sources require corroboration;
- missing, stale, future, rolled-back, equivocated or malformed state fails
  closed;
- longitudinal degradation survives restart and checkpoint handoff;
- one healthy step cannot clear accumulated degradation;
- 10,000 steps retain bounded state and deterministic results;
- model, Portable Agent, role and capability projections are usable from
  public entrypoints;
- existing behavior is unchanged without the opt-in components; and
- public build, type, browser, audit, release and packed-consumer checks pass.
