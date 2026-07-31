# Inference Control threat model

Status: Alpha 3 design baseline.

This model covers the local inference and action enforcement boundary introduced
by `@agentplat/inference-control`. It complements the Agent Mesh threat model;
it does not replace transport, identity, admission, lease or recovery controls.

## Protected assets

- local policy and its hard ceilings;
- trusted instructions and accepted Objective constraints;
- tenant, run, agent, Objective and Work Item isolation;
- provider inputs not intended for release;
- buffered and not-yet-accepted output;
- tool and external-action authority;
- Action Grant, assessment, idempotency, epoch and fencing state;
- credentials, raw context, tool arguments and private reasoning;
- deterministic control history needed for replay and incident analysis.

## Trust boundaries

### Application boundary

The application constructs policies, wrappers, assessors, trusted clocks,
authority resolvers, grant ledgers and telemetry sinks. Values carried in generic
metadata or remote payloads are not authority.

### Context boundary

Policy, accepted Objective and configured local-trusted entries are distinct
from user, peer, tool, retrieval and provider content. Untrusted content remains
data even if it imitates an instruction, policy, assessment or grant.

### Provider boundary

The provider may generate unsafe content, emit an unexpected tool call, ignore
cooperative cancellation, misorder events, exceed declared limits or fail after
partial output. Capabilities describe the wrapper's observable control points;
they are not a universal proof about remote provider behavior.

The reference model/runtime integrations use stronger controlled request and
event contracts; they do not impersonate existing interfaces that cannot carry
trusted zones, provenance or a capability handle. Untrusted context is rendered
through the normative user-data envelope and never as a system/developer role.

### Assessor boundary

Assessors are fallible external drivers. Their results are normalized, bounded
and bound to exact content and policy before entering the reducer. An assessor
cannot directly release output or invoke an action.
Each result must answer one retained pending request and match its generation,
assessor identity/version, target, zone, provenance, scope and lifetime.
Assessor-produced revisions re-enter only as `assessor_untrusted` data.

### Action boundary

The Action Gateway is the only protected path to a wrapped handler. A handler
reference used directly is outside that enforcement boundary. The gateway
resolves canonical grants from its local ledger and revalidates current scope
before dispatch.

The gateway request carries only grant ID, bounded input and trusted logical
time. The action identity, handler binding, assessment and resolver are
construction-bound. Every grant has a mandatory input digest, including the
canonical empty object for a no-argument action.

### Message boundary

The outbound gateway is the only protected path to a construction-bound
dispatcher. It requires one current exact `pre_message` assessment and a local
atomic reservation. A direct dispatcher reference is outside the boundary and
`application_only` never claims otherwise.

### Downstream boundary

A downstream service may apply an effect and then time out, ignore an
idempotency key or reject a fencing token. The gateway can provide at-most-one
local dispatch attempt; exactly-once effects require an explicit downstream
contract.

### State and telemetry boundary

Snapshots and diagnostics may cross storage or observability adapters. Restore
does not trust serialized indexes or counts. Diagnostics are schema-closed and
contain no raw sensitive content. Strict restorable snapshots are themselves
sensitive application data, are never telemetry, and require caller-provided
storage access control and encryption. Redacted projections are not restorable.

## Adversaries and failures

- user, peer, retrieval or tool content attempting instruction injection;
- a compromised or defective model/provider adapter;
- a provider-native tool path that bypasses application handlers;
- a compromised or defective assessor;
- callers presenting fabricated or replayed grant documents;
- stale executors retaining an older epoch or fencing token;
- concurrent consumers racing one single-use grant;
- malformed, oversized, duplicated or reordered control inputs;
- rollback, truncation or forgery of a control snapshot;
- a downstream service with weak idempotency or fencing;
- a telemetry sink receiving malicious nested metadata or failing;
- resource exhaustion through context, output, assessments, retries or grants.
- unsolicited/stale assessor results and provider completion/stream conflicts;
- trusted logical-time rollback;
- process crash after a grant or message attempt is reserved;
- outbound-message attempts that bypass the controlled gateway.

## Threats, mitigations and verification

| Threat                         | Required mitigation                                                                 | Verification                                   |
| ------------------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------- |
| Context instruction injection  | Closed zones; untrusted content is data; explicit local promotion only              | Hostile user/peer/tool/retrieval fixtures      |
| Policy or Objective escalation | Local immutable ceilings; remote constraints may narrow only                        | Expansion and revision tests                   |
| Capability confusion           | Separate control capabilities; pure fail-closed negotiation                         | Full policy/capability matrix                  |
| Native-tool bypass             | Declare unavailable interception; reject before provider invocation                 | Provider-native tool scenario                  |
| Premature output release       | Buffered high-risk mode and causal release heads                                    | Unsafe output and late-assessment scenarios    |
| Irretractable incremental leak | Prospective semantics, accepted-prefix ledger, effective local interruption         | Token-before-deny and ignored-cancel scenarios |
| Assessment substitution        | Retained request, generation, assessor ID/version and exact target binding          | Unsolicited/stale/cross-binding replay corpus  |
| Assessment loop exhaustion     | Explicit revise/retry/challenge budgets and deadlines                               | Boundary and model-based tests                 |
| Forged Action Grant            | Canonical local ledger lookup by ID; caller document is non-authoritative           | Fabricated/mutated grant tests                 |
| Grant replay or double use     | Atomic reservation before dispatch and non-evictable live state                     | Concurrent consumption scenario                |
| Stale assignment action        | Consumption-time Objective/Work/lease/epoch/fence validation                        | Recovery and stale-grant scenario              |
| Action/input substitution      | Frozen handler binding and mandatory canonical input digest                         | Empty/missing/mutated argument tests           |
| Ambiguous downstream effect    | `indeterminate`, no automatic retry, explicit downstream contract                   | Timeout-after-effect scenario                  |
| Local-check authority race     | Dispatch permit; downstream atomic fence for strong no-stale-effect claim           | Authority advance during dispatch scenario     |
| Stream completion ambiguity    | Exact sequence/byte windows and completion/token equality                           | UTF-8, conflict and completion mismatch corpus |
| Message bypass/replay          | Exact assessment, scoped idempotency, atomic reservation, in-flight restore fencing | Direct, duplicate and crash/send scenarios     |
| Clock rollback                 | Monotonic logical-time high-water and exclusive expiry                              | Backward-time boundary tests                   |
| Tenant or scope confusion      | Typed standalone/coordinated scope and construction-bound resolver                  | Cross-tenant/mesh/objective/work tests         |
| Snapshot rollback or forgery   | Versioned strict restore, relation/digest/count reconstruction                      | Tampered and old-head restore corpus           |
| Snapshot confidentiality leak  | Sensitive classification; no telemetry; non-restorable redaction                    | Sink and restore-negative tests                |
| Resource exhaustion            | Hard ceilings and pre-allocation backpressure                                       | Exact boundary plus one tests                  |
| Telemetry exfiltration         | Closed redacted diagnostics and keyed correlation for sensitive values              | Nested sensitive fixture and sink failure      |
| Import side effects            | Pure modules and explicit construction                                              | Isolated import consumer                       |

## Required invariants

- No untrusted context entry becomes an instruction without an authorized local
  promotion that creates a new provenance-bound entry.
- No missing provider capability degrades silently into weaker enforcement.
- No provider invocation occurs before every required pre-run check accepts.
- No buffered output or tool call is released before its exact current
  assessment accepts.
- No late event can release output after cancellation or another terminal head.
- No caller-supplied grant document, metadata object or tool argument creates
  authority.
- No protected handler runs before a valid single-use grant is reserved.
- No stale Objective, Work revision, lease, epoch or fencing token authorizes a
  local dispatch attempt; a strong external-effect claim additionally requires
  atomic downstream fencing.
- No current grant, idempotency or terminal fencing state is evicted to admit
  new work.
- No unknown schema, invalid transition, inconsistent count or forged digest is
  restored.
- No telemetry failure changes a decision or gateway state.
- No diagnostic contains raw context, provider output, tool arguments,
  credentials, full grants or private reasoning.
- No provider stream releases malformed UTF-8 boundaries, conflicting causal
  sequences or completion text inconsistent with observed tokens.
- No controlled SSE stream is accepted after malformed/post-terminal events or
  EOF without exactly one terminal event.
- No outbound dispatcher is called without an exact current single-use message
  assessment and local reservation.
- No strict snapshot restores protected operation until every retained
  capability, assessor, transformer, action/context/authority resolver and
  dispatcher identity/version/digest is rebound exactly.

## Capability claims and limitations

### Input inspection

`full` means the wrapper sees the complete normalized request it passes to the
provider. It does not imply visibility into hidden provider prompts or server
configuration.

### Output assessment

`final` means a complete final result is inspectable before local release.
`incremental` means the wrapper can assess chunks or pending windows before
their local release. Neither implies representation access.

### Release interruption

`local` means the wrapper can prevent future local delivery and signal
cooperative cancellation. It does not guarantee termination of remote compute
or removal of content already delivered.

### Tool interception

`application_only` covers calls explicitly dispatched through the Action
Gateway. `all` is valid only for an adapter with a verified pre-dispatch hook
for every possible tool path. Alpha 3 reference provider wrappers do not infer
`all` from ordinary tool support.

### Message interception

`application_only` covers only messages sent through the explicit outbound
gateway. Existing application, provider or transport paths are neither wrapped
nor represented as intercepted.

### Representation access

Representation access is optional. Closed-model and text-only providers remain
usable for policies whose required checkpoints are observable at the wrapper
boundary.

## Grant crash and retry semantics

The local grant transition is `issued -> reserved` synchronously before an
awaited handler call. The record binds reservation, dispatch-attempt, gateway
and authority-generation IDs. A synchronous, explicit pre-effect rejection may
become `failed`. Once dispatch may have begun, any unknown outcome becomes
`indeterminate`. Restoring a reserved snapshot also becomes `indeterminate`,
never `issued`.

Outbound message attempts use the same synchronous linearization rule and bind
reservation, message-dispatch-attempt, gateway, dispatcher, authority
generation and fence. Equal scoped idempotency replay returns retained state;
changed content conflicts. Restore maps a reserved message attempt to
`indeterminate`, never prepared, and automatic retry is prohibited.

Alpha 3 performs no automatic retry of an indeterminate grant. If a downstream
system promises idempotency or fencing, an application may reconcile through a
separate explicit operation using the same key and current authority. Without
that contract, retry could duplicate an effect and remains prohibited.

Idempotency keys are scoped by the exact scope digest. Equal replay of the same
action returns retained state; the same scoped key with a different action
digest is a conflict. A strong coordinated no-stale-effect guarantee exists
only when the downstream validates the passed generation/fencing token
atomically with its effect.

Strict snapshots allow a caller to persist state, but Alpha 3 supplies no
durable transactional adapter. After an uncoordinated process crash, an
application that cannot restore a current ledger must fail closed for protected
actions.

Quiescent snapshots must reproduce an uninterrupted projection. Snapshots with
an in-flight reserved action/message intentionally transform that record to
`indeterminate`; this fail-closed transform, rather than byte equality, is the
required deterministic restore result.

## Privacy requirements

Diagnostics may contain:

- stable reason and checkpoint codes;
- policy and schema versions;
- bounded counts and bucketed sizes;
- locally keyed correlation digests;
- coarse terminal states and latency buckets.

Diagnostics must not contain:

- raw prompts, context or provider output;
- tool arguments or result values;
- credentials or authorization headers;
- full Action Grants or reusable authorization material;
- private reasoning or hidden model state;
- unkeyed digests presented as anonymous identifiers for low-entropy values.

## Availability assumptions

Enforcement depends on local access to the selected policy, trusted clock,
required assessor, current authority state and grant ledger. Missing required
state produces denial or unavailability. Observe mode may continue when policy
allows observation, but it cannot be reported as enforced.

The Action Gateway requires a working local state commit before dispatch.
Telemetry is not authoritative and may fail without changing the decision.

## Deferred risks

- cross-process signed or remotely delegated Action Grants;
- durable atomic ledger adapters and crash-consistent multi-process dispatch;
- evidence fusion, collusion resistance and Trust Profiles;
- automated quarantine and recovery;
- provider representation probes beyond declared observable boundaries;
- universal downstream idempotency or fencing adapters.

These limitations must remain visible in package documentation and release
evidence.
