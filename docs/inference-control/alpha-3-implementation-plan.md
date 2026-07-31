# Inference Control `0.3.0-alpha.3` implementation plan

Status: design frozen and independently reviewed. No Alpha 3 runtime behavior
is enabled yet.
The Alpha 2 release remains the compatibility baseline.

This plan delivers a provider-neutral, opt-in inference and action enforcement
layer without changing the default behavior or closed public unions of
Runtime, Model, Tools, Streaming, Sessions, Rooms, Framework or Agent Mesh.

## Release identity

- coordinated package version: `0.3.0-alpha.3`;
- npm distribution tag: `next`;
- Git tag: `v0.3.0-alpha.3`;
- compatibility baseline: `v0.3.0-alpha.2`;
- new package: `@agentplat/inference-control`;
- expected coordinated package count: 29;
- wire version: unchanged at `0`;
- state schema version: `1`;
- grant schema version: `1`.

## Outcome

Alpha 3 lets an application explicitly wrap an existing model adapter, agent
provider or tool registry with local controls that:

- preserve trusted instructions and policies as distinct context zones;
- keep user, peer, tool, retrieval and provider content as untrusted data;
- negotiate the control points a provider boundary can actually expose;
- evaluate normalized input, streaming, final-output, tool and outbound-message
  checkpoints;
- apply bounded allow, revise, retry, challenge, abstain, escalate or deny
  decisions;
- withhold high-risk output until its required assessment accepts it;
- issue short-lived, scope-bound Action Grants from accepted local decisions;
- atomically reserve a valid grant before dispatch through an Action Gateway;
- reject expired, stale, conflicting, consumed or incorrectly scoped grants;
- emit bounded redacted diagnostics without raw prompts, tool arguments,
  credentials, grants or private reasoning.

The package is useful with or without Agent Mesh. Mesh assignment fields become
mandatory only for a policy that enables actions derived from coordinated work.

## Explicit non-goals

Alpha 3 does not provide:

- a universal safety, truth or alignment guarantee;
- implicit instruction promotion based on signatures, reputation or model
  output;
- enforcement for provider-native tools that cannot be intercepted before
  dispatch;
- retraction of stream content already released to a consumer;
- representation-level inspection when a provider does not expose it;
- signed or portable bearer grants between processes;
- a durable multi-process grant journal;
- exactly-once external effects without a downstream idempotency or fencing
  contract;
- evidence fusion, Trust Profiles, quarantine or reputation scoring;
- production network transport, durable inbox/outbox or Room bridging;
- changes to Agent Mesh wire messages or `wireVersion`.

Evidence fusion and Trust Profiles remain assigned to Alpha 4. Durable and
multi-process adapters remain assigned to Alpha 5.

## Frozen design decisions

### 1. Local and opt-in boundary

`@agentplat/inference-control` is a new public package. Importing it performs no
network I/O, provider discovery, registration, migration, telemetry emission or
global mutation. Existing runtime and adapter instances remain uncontrolled
unless a caller explicitly wraps them.

Direct access to an original provider, model adapter or tool handler bypasses a
wrapper. Documentation and diagnostics must describe enforcement only for the
exact wrapped boundary; the package never claims process-wide or provider-wide
control.

### 2. Local ledger grants, not bearer tokens

An Alpha 3 Action Grant is authoritative only as an immutable record retained
by the construction-bound local grant ledger. The gateway accepts a `grantId`
and resolves the canonical retained grant; it never trusts a caller-supplied
grant document or metadata object as authority.

The public grant document supports inspection and strict snapshots, but copying
or fabricating it does not authorize an action. Cross-process signed grants are
deferred. A caller may persist and restore a strict snapshot, but Alpha 3 does
not claim a durable atomic commit across processes.

### 3. Typed authority source

Standalone actions use an explicit local scope. Coordinated actions use a
complete Mesh scope resolved through a construction-bound authority resolver.
Neither `RuntimeExecutionContext.metadata`, `RuntimeExecutionContext.policies`,
`AgentDefinition.capabilities` nor arbitrary JSON can grant authority.

The gateway re-resolves authority at consumption time. A valid grant issued
under an older Objective revision, Work revision, assignment epoch, fencing
token, lease or terminal state fails before handler invocation.

### 4. Provider-native tools

Alpha 3 does not claim enforcement of a tool executed wholly inside a provider
loop when no pre-dispatch hook exists. Such a boundary declares
`toolInterception: none`. A policy that requires complete tool interception is
rejected before the provider is invoked.

`toolInterception: application_only` means only handlers reached through the
local Action Gateway are controlled. It is never upgraded implicitly to
complete interception.

### 5. Incremental output is prospective

Incremental control governs future chunks. It cannot retract bytes already
released. It is allowed only for policies that explicitly classify the output
as low or moderate risk, require incremental assessment, and have an effective
local release-interruption boundary.

High-risk output, all action authorization and any policy requiring complete
pre-release inspection use buffered mode. If the required buffer cannot be
maintained within its configured limit, the run fails closed without partial
release.

### 6. Pure core, effectful wrappers

The core transition remains:

```text
state + normalized input + trusted logical time -> decision + next state + ordered effects
```

It performs no model invocation, tool dispatch, storage, network I/O, clock
read, randomness or telemetry call. Assessors, providers, clocks, ledgers,
telemetry sinks and action handlers are driver boundaries. Wrappers normalize
and bound their results before presenting them to the core.

### 7. Safety over availability

Missing capabilities, expired authority, unknown schemas, invalid snapshots,
capacity exhaustion, ambiguous action outcomes and failed grant-state commits
deny or stop enforcement. Telemetry failure alone cannot change a decision.

## Package and export boundary

The package is registered in the public catalog as:

```json
{
  "name": "@agentplat/inference-control",
  "directory": "packages/inference-control",
  "layer": "runtime",
  "publish": true,
  "providerNeutral": true,
  "browserEntrypoints": ["."],
  "packSmoke": true
}
```

Planned exports:

| Export                                  | Responsibility                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `@agentplat/inference-control`          | closed contracts, validation, canonicalization, limits, immutable state, negotiation and reducer       |
| `@agentplat/inference-control/model`    | controlled model request compiler/executor and exact model-stream release control                      |
| `@agentplat/inference-control/runtime`  | controlled agent request compiler/executor, provider-event normalization and controlled runtime events |
| `@agentplat/inference-control/tools`    | explicit Action Gateway, grant ledger and helpers that freeze exact Tool Registry bindings             |
| `@agentplat/inference-control/messages` | explicit outbound message gateway and dispatcher boundary for the `pre_message` checkpoint             |

The root export is browser-safe and depends only on `@agentplat/core`. Adapter
subpaths may depend on the relevant public AgentPlat contracts, but no export
depends on a vendor SDK or on `@agentplat/mesh`. Framework does not re-export
this alpha package. Only the root has a browser-support guarantee in Alpha 3;
adapter subpaths are server/runtime boundaries unless cataloged separately in a
later release.

The model and runtime exports do not implement `ModelAdapter`, `AgentProvider`
or `AgentRuntime`. Their input contracts are intentionally stronger and cannot
be represented by the existing interfaces without losing context zones and
provenance. The tools export does not pretend that an ordinary `ToolHandler`
can receive a grant through its existing context. Protected calls use the new
closed `ActionGateway.invoke` request. Helpers may freeze a handler discovered
from a `ToolRegistry`, but they never return a transparently authorized
`ToolHandler`.

## Normative schema and digest conventions

All version-1 input, state, snapshot, policy, assessment, grant, action and
message objects are closed: own enumerable string keys must equal the keys for
the selected discriminated variant. Unknown keys, symbols, accessors, custom
prototypes, sparse arrays, cycles, non-finite numbers and `undefined` fail
before reducer invocation.

### IDs and strings

- existing AgentPlat IDs are non-empty strings of at most 256 UTF-8 bytes with
  no C0 control, DEL or unpaired-surrogate code point;
- new control-generated IDs use namespace prefixes `policy:`, `run:`,
  `context:`, `assessment-request:`, `assessment:`, `stream:`, `chunk:`,
  `grant:`, `reservation:`, `dispatch:`, `action-binding:`, `message:` or
  `message-attempt:` followed by 1–192 characters from
  `[A-Za-z0-9._~:/-]`;
- action namespaces, operations, channels and reason codes are 1–128 ASCII
  characters from `[A-Za-z0-9][A-Za-z0-9._:/-]*`;
- human-readable diagnostic text is local-only, optional and at most 512 UTF-8
  bytes; decisions never depend on it.

### Canonical JSON

`canonicalizeControlJsonV1` accepts JSON values only. Objects use null
prototypes in restored state, keys are sorted by JavaScript UTF-16 code-unit
order, strings reject unpaired surrogates, arrays preserve order, `-0` becomes
`0`, and finite numbers use the ECMAScript JSON number serialization. Schema
fields that represent counters, revisions, times or budgets require safe
integers and never use floating-point values.

Every security digest has the form `sha256:` plus 64 lowercase hexadecimal
characters and is computed over:

```text
UTF8("agentplat.inference-control/<domain>/v1\0")
+ UTF8(canonicalizeControlJsonV1(value))
```

The closed digest domains are `context`, `provenance`, `policy`, `scope`,
`capability`, `assessment-target`, `provider-request`, `stream-window`,
`handler-binding`, `action`, `action-input`, `message`, `state` and `trace`. A
digest from one domain cannot be substituted into another. Trace chaining
hashes the previous trace digest and the next canonical redacted transition
under the `trace` domain.

Diagnostics never expose an ordinary digest as anonymization for low-entropy
content. A driver may replace it with an HMAC-based tenant correlation value
using a construction-bound key; HMAC keys never enter reducer state.

### Trusted time

External timestamps are canonical RFC 3339 strings with an explicit offset and
at most nanosecond precision. Reducer inputs additionally carry
`logicalTimeMs`, a non-negative safe integer that must be greater than or equal
to the state's high-water time. A lower time is `logical_time_rollback` and
changes no state.

All expiry is exclusive: `logicalTimeMs >= expiresAtLogicalMs` is expired.
Because decisions use one local monotonic timeline, sender clock skew grants no
extra lifetime. Coordinated authority resolvers translate accepted local lease
state to that same trusted timeline before returning a decision.

## Control capability contract

Control capabilities are separate from `ModelAdapterCapabilities`. Functional
support for streaming or tools does not prove that a control wrapper can
inspect, interrupt or intercept them.

```text
InferenceControlCapabilities
  schemaVersion: 1
  capabilityId
  descriptorVersion: positive safe integer
  inputInspection: full | none
  finalOutputAssessment: full | none
  incrementalOutputAssessment: windowed | none
  releaseInterruption: local | none
  toolInterception: all | application_only | none
  messageInterception: application_only | none
  representationAccess: none | opaque | token
  declarationSource: wrapper | adapter
  assurance: reference_tested | application_verified | declared
  wrapperId
  wrapperVersion: positive safe integer
  descriptorDigest
```

`releaseInterruption: local` means the wrapper can stop future release to its
consumer and cooperatively signal cancellation. It does not claim that remote
provider computation stops immediately.

Negotiation is pure and returns exactly one result:

```text
accepted
  schemaVersion: 1
  policyDigest
  descriptorDigest
  effectiveReleaseMode
  enforcedCheckpoints: sorted unique ControlCheckpoint[]
  observedCheckpoints: sorted unique ControlCheckpoint[]

rejected
  schemaVersion: 1
  policyDigest
  descriptorDigest
  reasonCode: policy_capability_missing | release_mode_incompatible
  missingCapabilities: sorted unique RequiredControlCapability[]
```

Capability requirements:

| Policy requirement           | Minimum capability                                                       |
| ---------------------------- | ------------------------------------------------------------------------ |
| pre-run enforcement          | `inputInspection: full`                                                  |
| final output enforcement     | `finalOutputAssessment: full`                                            |
| incremental release          | `incrementalOutputAssessment: windowed` and `releaseInterruption: local` |
| application tool enforcement | `toolInterception: application_only` or `all`                            |
| complete tool enforcement    | `toolInterception: all`                                                  |
| outbound message enforcement | `messageInterception: application_only`                                  |
| representation policy        | matching non-`none` representation access                                |

Observe mode records capability gaps but never reports an enforced outcome. A
declared capability is evidence about the wrapped boundary, not proof that a
remote provider behaves correctly; deterministic adapter conformance tests
verify the reference wrappers.

Descriptors arrive through a construction-bound `ControlCapabilityRegistry`,
not through request metadata. The registry validates the exact descriptor,
binds it to a wrapper instance and returns an opaque runtime handle. Restoring a
snapshot requires rebinding that handle to the exact policy-allowlisted
descriptor identity and digest. High-risk policies accept only
`reference_tested` or an explicitly
allowlisted `application_verified` descriptor; `declared` descriptors may be
used only for observe mode or a policy that expressly accepts them.

`minimumCapabilityAssurance: verified` means exactly `reference_tested` or an
explicitly policy-allowlisted `application_verified` descriptor. `declared`
means all three assurance variants are eligible, subject to the separate
high-risk rule. The registry recomputes the `capability` digest and reference
wrappers must pass the published deterministic conformance suite before they
may declare `reference_tested`.

`ControlCapabilityRegistryV1` has no ambient discovery. Construction registers
closed records `{ descriptor, descriptorDigest, wrapperInstanceId }`, rejects a
duplicate identity with different content, and returns an opaque
`CapabilityHandleV1 { schemaVersion, capabilityHandleId, capabilityId,
descriptorVersion, wrapperId, wrapperVersion, wrapperInstanceId,
descriptorDigest }`. `resolve(handleId, requirement)` returns that exact handle
and descriptor only when every requirement field matches. `rebind(snapshot
binding)` performs the same comparison against a newly constructed registry;
it never recreates a wrapper or accepts a caller-supplied descriptor. Missing,
stale or conflicting records return `dependency_rebind_failed` without a
partial binding.

## Context zones and provenance

### Zones

The closed zone set is:

```text
policy
objective
local_trusted
user_untrusted
peer_untrusted
tool_untrusted
retrieval_untrusted
provider_untrusted
assessor_untrusted
```

Only `policy`, `objective` and explicitly configured `local_trusted` entries
may contribute executable instructions. Every untrusted zone is data even when
its content imitates an instruction, policy, assessment, grant or system
message.

### Context entry

Each immutable entry has this exact shape:

```text
ContextEntryV1
  schemaVersion: 1
  contextEntryId
  runId
  tenantId
  zone
  sourceKind: local | user | peer | tool | retrieval | provider | assessor
  sourceId
  sourceVersion: positive safe integer
  mediaType: text | json
  content: string | JSON value
  contentDigest
  provenanceDigest
  encodedBytes: non-negative safe integer
  createdAtLogicalMs
  scope: standalone scope | coordinated scope | null
  derivation: PromotionRecordV1 | AssessorRevisionRecordV1 | null

PromotionRecordV1
  sourceContextEntryId
  sourceContentDigest
  transformerId
  transformerVersion
  policyId
  policyVersion
  targetZone: local_trusted | user_untrusted | peer_untrusted |
              tool_untrusted | retrieval_untrusted |
              provider_untrusted | assessor_untrusted
  promotedAtLogicalMs

AssessorRevisionRecordV1
  sourceContextEntryId
  sourceContentDigest
  assessmentRequestId
  assessmentId
  assessorId
  assessorVersion
  targetZone: assessor_untrusted
  createdAtLogicalMs
```

`contentDigest`, `provenanceDigest` and `encodedBytes` are recomputed on
admission and restore. The scope variant is closed and validated as defined for
Action Grants. Context content is part of the strict snapshot and therefore
classified as sensitive application data, not telemetry.

Raw secrets and credentials are forbidden. A source signature authenticates
provenance but does not promote a zone.

### Promotion

Promotion creates a new entry; it never edits the source. The promotion record
binds source entry ID and digest, transformer ID and version, policy version,
result zone and trusted time. Only a construction-bound transformer explicitly
authorized by policy may promote data, and it cannot create a `policy` or
`objective` entry.

Multiplicity, peer consensus, repeated model output or a high score cannot
promote content. Evidence diversity and trust fusion remain outside Alpha 3.

Revised content returned by an assessor becomes a new `assessor_untrusted`
entry whose derivation record names the original assessment request and result.
It never replaces a trusted entry or becomes an instruction implicitly. A
policy may send it through another assessment or an authorized transformer,
subject to the same budgets and limits.

## Controlled model request and renderer

Context enforcement is available only through a new request contract; an
arbitrary `ModelRequest` cannot be retroactively assigned trustworthy zones.

```text
ControlledModelRequestV1
  schemaVersion: 1
  runId
  tenantId
  policyId
  policyVersion
  capabilityHandleId
  contextEntryIds: 1..256 ordered unique IDs
  model: bounded string | null
  tools: bounded ModelToolDefinition[]
  options: ControlledModelOptionsV1 | null
  scope: standalone scope | coordinated scope | null

ControlledModelOptionsV1
  temperature: finite number from 0 through 2 | null
  maxOutputTokens: positive safe integer | null
  stop: 0..16 strings, each at most 256 UTF-8 bytes
  responseFormat: text | json | null
```

The request contains no generic metadata or credentials. Credentials remain in
the construction-bound `ModelExecutionContext` passed directly to the wrapped
adapter and never enter control state.

`renderControlledModelRequestV1` resolves the exact current context entries and
uses this fixed mapping:

| Zone                 | Provider-neutral `ChatMessage` role and encoding                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `policy`             | `system`; exact text or canonical JSON                                                                |
| `objective`          | `developer`; exact text or canonical JSON                                                             |
| `local_trusted`      | `developer`; exact text or canonical JSON                                                             |
| every untrusted zone | `user`; canonical JSON data envelope containing zone, source reference, provenance digest and content |

An untrusted entry is never rendered as `system` or `developer`. Entries retain
their caller-specified order inside each fixed zone tier; tiers render in the
order policy, Objective, local-trusted, then untrusted. The renderer returns the
exact `ModelRequest` plus a `provider-request` digest covering every rendered
message, tool declaration and option. The pre-run assessment binds that digest.

This renderer preserves authority separation in AgentPlat's control plane. It
does not claim that a probabilistic model will obey trusted instructions or
ignore malicious data; output and action checkpoints remain necessary.

## Policy contract

One immutable policy version has this exact shape:

```text
InferenceControlPolicyV1
  schemaVersion: 1
  policyId
  policyVersion: positive safe integer
  parentPolicyDigest: digest | null
  mode: observe | buffered | incremental
  outputRisk: low | moderate | high
  checkpoints: sorted unique ControlCheckpoint[]
  requiredCapabilities: sorted unique RequiredControlCapability[]
  minimumCapabilityAssurance: verified | declared
  allowedCapabilityBindings: sorted unique CapabilityBindingRequirementV1[]
  allowedContextZones: sorted unique ContextZone[]
  allowedTransformerBindings: sorted unique { id, version }[]
  allowedActions: sorted unique ActionPatternV1[]
  allowedMessageChannels: sorted unique bounded strings[]
  assessmentBindings: one exact AssessorBindingV1 per enabled checkpoint
  budgets: { revisions, retries, challenges }
  limits: InferenceControlLimitsV1
  maximumRunDurationMs
  maximumAssessmentTtlMs
  maximumGrantTtlMs
  maximumMessagePermitTtlMs
  exhaustedDisposition: abstain | escalate | deny
  coordinatedActionsRequired: boolean
  diagnosticsPolicyId
  redactionPolicyId
```

`mode: off` is represented by not installing a controller and is not a policy
value. High-risk policies require `mode: buffered`,
`minimumCapabilityAssurance: verified`, a pre-run and post-run binding, and a
pre-tool binding when any action is allowed. A policy enabling outbound-message
enforcement requires a pre-message binding and at least one allowed channel.
Every policy with a non-empty `allowedActions` list requires exactly one
`pre_tool` assessor binding regardless of output risk; otherwise validation
fails.

`ActionPatternV1` binds exact action namespace, tool ID, operation,
action-binding ID and minimum binding version. Wildcards are not supported in
Alpha 3.

```text
ActionPatternV1
  schemaVersion: 1
  namespace
  toolId
  operation
  actionBindingId
  minimumActionBindingVersion: positive safe integer

RequiredControlCapability =
  { kind: input_inspection, value: full }
| { kind: final_output_assessment, value: full }
| { kind: incremental_output_assessment, value: windowed }
| { kind: release_interruption, value: local }
| { kind: tool_interception, value: application_only | all }
| { kind: message_interception, value: application_only }
| { kind: representation_access, value: opaque | token }
```

```text
AssessorBindingV1
  schemaVersion: 1
  assessorId
  assessorVersion: positive safe integer
  assessorBindingDigest
  checkpoint
  maximumResponseBytes: positive safe integer
  maximumEvidenceReferences: positive safe integer
  timeoutMs: positive safe integer

CapabilityBindingRequirementV1
  schemaVersion: 1
  capabilityId
  descriptorVersion: positive safe integer
  wrapperId
  wrapperVersion: positive safe integer
  descriptorDigest
  requiredAssurance: reference_tested | application_verified | declared
```

The driver registry binds assessor identity/version/digest to one
construction-provided instance. A result from another assessor is unsolicited.
A capability handle is eligible only when every identity field and digest
matches one allowlisted requirement; stronger assurance does not permit a
different wrapper or descriptor. Restore must rebind the same requirement.

Policies are local configuration. A remote Objective may narrow behavior within
an accepted local ceiling but cannot expand capabilities, limits, allowed
actions, release modes or authority.

## Assessment contract

### Checkpoints

The closed checkpoint set is:

```text
pre_run
stream
post_run
pre_tool
pre_message
```

### Dispositions

The closed disposition set is:

```text
allow
revise
retry
challenge
abstain
escalate
deny
```

The reducer creates and retains an exact request before an assessor is invoked:

```text
AssessmentRequestV1
  schemaVersion: 1
  assessmentRequestId
  requestGeneration: positive safe integer
  runId
  tenantId
  policyId
  policyVersion
  checkpoint
  assessorId
  assessorVersion
  targetKind: provider_request | stream_window | final_output |
              action | outbound_message
  targetDigest
  contextEntryIds: ordered unique IDs
  zoneDigest
  provenanceDigest
  scope: standalone scope | coordinated scope | null
  createdAtLogicalMs
  expiresAtLogicalMs
  status: pending | accepted | expired | cancelled
```

Only the construction-bound assessor matching the exact ID/version may answer.
The normalized result is:

```text
InferenceAssessmentV1
  schemaVersion: 1
  assessmentId
  assessmentRequestId
  requestGeneration
  runId
  tenantId
  policyId
  policyVersion
  checkpoint
  assessorId
  assessorVersion
  targetKind
  targetDigest
  zoneDigest
  provenanceDigest
  scope: exact request scope
  disposition
  reasonCodes: 1..16 sorted unique stable codes
  uncertaintyBasisPoints: integer 0..10_000
  evidenceReferences: 0..32 bounded references
  revisedContent: bounded string or JSON value | null
  challenge: bounded string or JSON value | null
  assessedAtLogicalMs
  expiresAtLogicalMs
```

Exactly one of `revisedContent` or `challenge` may be non-null, and only for its
matching disposition. The result must arrive while the request is pending,
before both request and result expiry, from the matching assessor binding and
with every copied field equal. An exact duplicate is idempotent; a second
different result, an old generation or an unsolicited result is a conflict or
no-op rejection and grants no release.

An accepted assessment is reusable only for the exact request and while its
policy, run, content, zone, provenance and authority heads remain current. It
is single-use for release, grant issuance or message dispatch. Using it marks
that checkpoint authorization consumed; duplicate delivery returns the
retained outcome without a second effect.

### Stable reason codes

Schema version 1 exposes these local diagnostic codes:

```text
context_zone_invalid
context_promotion_denied
context_limit_exceeded
policy_capability_missing
assessment_required
assessment_invalid
assessment_indeterminate
assessment_expired
assessment_scope_mismatch
assessment_content_mismatch
assessment_budget_exhausted
release_mode_incompatible
release_buffer_exceeded
stream_abort_unavailable
action_not_permitted
grant_missing
grant_expired
grant_consumed
grant_scope_mismatch
grant_action_mismatch
grant_input_mismatch
grant_assessment_mismatch
grant_epoch_stale
grant_fence_stale
grant_idempotency_conflict
gateway_unavailable
downstream_fence_rejected
downstream_indeterminate
state_capacity_exceeded
state_conflict
logical_time_rollback
assessment_unsolicited
assessment_assessor_mismatch
assessment_generation_stale
stream_sequence_invalid
stream_content_mismatch
message_not_permitted
message_indeterminate
message_idempotency_conflict
dependency_rebind_failed
```

External/remote receipts are coarsened to `accepted`, `withheld`, `denied` or
`unavailable`. Exact reason codes stay in bounded local diagnostics.

## Immutable state and transition inputs

### Limits schema

`InferenceControlLimitsV1` is a closed object with one positive-safe-integer
field for every row in the numeric-bounds table: `maxContextEntriesPerRun`,
`maxContextEntryBytes`, `maxContextBytesPerRun`,
`maxProvenanceReferencesPerEntry`, `maxAssessmentsPerRun`,
`maxAssessmentBytes`, `maxEvidenceReferencesPerAssessment`,
`maxRevisionsPerRun`, `maxRetriesPerRun`, `maxChallengesPerRun`,
`maxOutputChunksPerRun`, `maxOutputChunkBytes`, `maxPendingWindowBytes`,
`maxBufferedOutputBytes`, `maxActionInputBytes`, `maxOutboundMessageBytes`,
`maxDispatchAttemptsPerRun`, `maxActiveGrants`,
`maxRetainedGrantRecords`, `maxActiveMessageAttempts`,
`maxRetainedMessageAttempts`, `maxDiagnostics`, `maxStateBytes`,
`maxRunDurationMs`, `maxAssessorResponseTimeoutMs`, `maxAssessmentTtlMs`,
`maxGrantTtlMs` and `maxMessagePermitTtlMs`. Each value must be at or below its
hard ceiling; missing or unknown fields fail validation.

### State and snapshot topology

```text
InferenceControlStateV1
  schemaVersion: 1
  stateId
  tenantId
  stateGeneration: positive safe integer
  logicalTimeHighWaterMs: non-negative safe integer
  limits: InferenceControlLimitsV1
  policies: sorted unique PolicyRecordV1[]
  policyHeads: sorted unique PolicyHeadV1[]
  dependencyBindings: sorted unique DependencyBindingRecordV1[]
  runs: sorted unique ControlRunRecordV1[]
  contextEntries: sorted unique ContextEntryV1[]
  assessmentRequests: sorted unique AssessmentRequestV1[]
  assessments: sorted unique InferenceAssessmentV1[]
  streams: sorted unique ControlStreamV1[]
  streamChunks: ordered ControlStreamChunkV1[]
  grants: sorted unique ActionGrantV1[]
  actionIdempotency: sorted unique ActionIdempotencyRecordV1[]
  messageAttempts: sorted unique OutboundMessageAttemptV1[]
  messageIdempotency: sorted unique MessageIdempotencyRecordV1[]
  diagnostics: ordered ControlDiagnosticV1[]
  traceDigest
  encodedBytes: non-negative safe integer

InferenceControlSnapshotV1
  schemaVersion: 1
  snapshotId
  createdAtLogicalMs
  state: InferenceControlStateV1
  stateDigest
```

Every sorted-unique array is ordered by its exact logical key and rejects a
duplicate key. Keys are policy digest, policy ID, binding kind/ID/version, run
ID, context-entry ID, assessment-request ID, assessment ID, stream ID, grant
ID, `(scopeDigest,idempotencyKey)`, message-attempt ID and
`(scopeDigest,idempotencyKey)` respectively. Stream chunks are ordered by
`(streamId,generation,sequence)`.

```text
ControlRunRecordV1
  schemaVersion: 1
  runId
  tenantId
  policyDigest
  capabilityDescriptorDigest
  capabilityHandleId: negotiated construction-bound handle | null
  scope: standalone | coordinated | null
  generation
  phase
  createdAtLogicalMs
  deadlineAtLogicalMs
  dispositionCounts: { revisions, retries, challenges }
  contextEntryIds: ordered unique IDs
  assessmentRequestIds: ordered unique IDs
  assessmentIds: ordered unique IDs
  streamIds: ordered unique IDs
  grantIds: ordered unique IDs
  messageAttemptIds: ordered unique IDs
  outputDigest: digest | null
  releasedBytes
  terminalReasonCode: reason code | null

PolicyRecordV1
  schemaVersion: 1
  policyDigest
  policy: InferenceControlPolicyV1

PolicyHeadV1
  schemaVersion: 1
  policyId
  policyVersion: positive safe integer
  policyDigest

DependencyBindingRecordV1
  schemaVersion: 1
  kind: capability | assessor | transformer | action_dispatcher |
        action_context_resolver | authority_resolver | message_dispatcher
  bindingId
  bindingVersion
  bindingDigest

ActionIdempotencyRecordV1
  schemaVersion: 1
  scopeDigest
  idempotencyKey
  actionDigest
  grantId
  retainedOutcome: issued | reserved | dispatched | failed | indeterminate |
                   expired

MessageIdempotencyRecordV1
  schemaVersion: 1
  scopeDigest
  idempotencyKey
  messageDigest
  messageAttemptId
  retainedOutcome: prepared | reserved | sent | failed | indeterminate |
                   expired

ControlDiagnosticV1
  schemaVersion: 1
  diagnosticId
  logicalTimeMs
  runId: bounded ID | null
  checkpoint: ControlCheckpoint | null
  reasonCode
  outcome: accepted | withheld | denied | unavailable
  sizeBucket: 0 | 1 | 2 | 3 | 4
  correlationId: keyed opaque string | null
```

Restore reconstructs all indexes, relations, counts, encoded bytes and digests
instead of trusting serialized derivatives. Every retained capability,
assessor, transformer, action dispatcher/context resolver, authority resolver
and outbound dispatcher must rebind from an explicit construction registry to
the exact identity/version/digest in `dependencyBindings`. Missing or unequal
bindings reject strict restore with `dependency_rebind_failed`. An explicitly
selected redacted/observational import can inspect evidence but cannot assess,
release, issue, dispatch or send.

The strict snapshot contains context, pending buffers and grant/assessment
material. It is classified with the same confidentiality as raw prompts,
outputs and action arguments: it never enters diagnostics or ordinary logs,
persistence is disabled by default, and callers supply access control and
encryption at rest/in transit. The redacted projection is not restorable.

### Run phases

```text
created
input_assessed
executing
buffering
streaming
output_assessed
completed
denied
abstained
escalated
failed
```

Terminal phases cannot be reopened. A duplicate input with identical canonical
content is idempotent. Reuse of a logical ID with different content is
`state_conflict` and changes no state.

### Inputs

Every reducer input has exact common fields `schemaVersion: 1`, `inputId`,
`type`, `expectedStateGeneration` and `logicalTimeMs`, plus exactly one variant
payload:

```text
policy_registered       { policy, policyDigest }
run_created             { run: ControlRunRecordV1 }
context_admitted        { entry: ContextEntryV1 }
context_promoted        { sourceContextEntryId, entry,
                          transformerBindingDigest }
capability_negotiated   { runId, capabilityHandleId, descriptorDigest,
                          result }
assessment_requested    { request: AssessmentRequestV1 }
assessment_received     { assessment: InferenceAssessmentV1 }
provider_started        { runId, generation, providerRequestDigest, streamId }
provider_chunk_received { runId, chunk: ControlStreamChunkV1 }
provider_completed      { runId, generation, streamId, completionContent,
                          completionDigest }
continuation_selected   { runId, assessmentId,
                          kind: revise | retry | challenge }
output_release_ack      { runId, streamId, generation, throughSequence,
                          throughByteExclusive, windowDigest }
grant_issued            { grant: ActionGrantV1 }
grant_reserved          { grantId, reservation: ActionReservationV1 }
action_dispatch_outcome { grantId, reservationId, dispatchAttemptId,
                          outcome: dispatched | failed | indeterminate }
message_prepared        { message, attempt: OutboundMessageAttemptV1 }
message_reserved        { messageAttemptId, reservation: MessageReservationV1 }
message_dispatch_outcome{ messageAttemptId, reservationId,
                          messageDispatchAttemptId,
                          outcome: sent | failed | indeterminate }
deadline_fired          { timerKind: run | assessment | grant | message,
                          timerId, timerGeneration }
run_cancelled           { runId, generation, reasonCode }
run_failed              { runId, generation, reasonCode }
```

Every input includes trusted logical time. No reducer reads a host clock.

### Effects

Every ordered effect has `schemaVersion: 1`, effect ID, run ID, generation and
one exact variant:

```text
request_assessment { request: AssessmentRequestV1 }
invoke_provider    { providerRequestDigest, capabilityHandleId }
cancel_provider    { streamId, reasonCode }
release_output     { streamId, fromSequence, throughSequence, fromByte,
                     throughByteExclusive, windowDigest }
invoke_continuation{ kind, sourceAssessmentId, revisedContextEntryId | null }
deliver_challenge  { assessmentId, challengeDigest }
deliver_escalation { assessmentId, reasonCodes }
persist_grant      { grantId, stateGeneration }
dispatch_action    { grantId, actionBindingId,
                     permit: ActionDispatchPermitV1 }
dispatch_message   { messageAttemptId, dispatcherId,
                     permit: MessageDispatchPermitV1 }
emit_receipt       { outcome: accepted | withheld | denied | unavailable }
emit_diagnostic    { diagnostic: ControlDiagnosticV1 }
```

Drivers must snapshot effect inputs before awaiting an external dependency.
Late effects are generation-fenced by run, assessment, buffer or grant head.

## Release-mode state machines

### Off

`off` is represented by not installing a wrapper. A policy cannot select `off`
and simultaneously claim an enforced checkpoint.

### Observe

Observe mode invokes configured assessors and records normalized results but
does not withhold input, output or actions. Its decisions are labeled observed,
never enforced. An application must opt separately into an Action Gateway;
observe mode alone cannot issue an executable grant.

### Buffered

1. negotiate capabilities before provider invocation;
2. accept and assess bounded input;
3. invoke the provider only after an enforced pre-run allow when required;
4. retain all output within the configured buffer;
5. assess the exact final buffer digest;
6. release only after an exact current allow;
7. discard without release on deny, abstain, escalation, timeout, cancellation
   or capacity failure.

Tool calls emitted during buffering remain withheld and require a separate
pre-tool assessment and Action Grant.

### Incremental

1. negotiate incremental assessment and local release interruption;
2. assess the input before provider invocation when configured;
3. add each provider chunk to a bounded pending window;
4. assess the exact pending-window digest and causal sequence;
5. release an accepted prefix in order;
6. on non-allow, prevent all future release and signal cooperative
   cancellation;
7. record exactly how many bytes were released before the terminal decision.

Duplicate or reordered provider chunks cannot advance the release head. A late
assessment cannot release a chunk after cancellation or a newer terminal head.

### Exact stream binding

The model and runtime executors normalize provider text as whole JavaScript
strings, validate it, encode it as UTF-8 and only then assign sequence and byte
positions. They never split or release an incomplete UTF-8 sequence.

```text
ControlStreamV1
  schemaVersion: 1
  streamId
  runId
  generation: positive safe integer
  nextSequence: non-negative safe integer
  releasedThroughSequence: safe integer, initially -1
  receivedBytes: non-negative safe integer
  releasedBytes: non-negative safe integer
  finalDigest: digest | null
  status: open | completed | cancelled | failed

ControlStreamChunkV1
  schemaVersion: 1
  chunkId
  streamId
  generation
  sequence: non-negative safe integer
  fromByte: non-negative safe integer
  throughByteExclusive: positive safe integer
  utf8Bytes: positive safe integer
  content: bounded string
  contentDigest: assessment-target digest

StreamWindowV1
  schemaVersion: 1
  streamId
  generation
  fromSequence
  throughSequence
  fromByte
  throughByteExclusive
  utf8Bytes
  chunkDigests: ordered non-empty array
  windowDigest: stream-window digest
```

A stream assessment binds the entire `StreamWindowV1`, not only text. Release
requires the exact still-pending generation, sequence range, byte range and
digest. Duplicate event delivery is idempotent only for an equal canonical
chunk; reused IDs, sequences or byte positions with different content fail the
run. A window cannot overlap already released or differently assessed bytes.

If token events were observed, `completed.content` must exactly equal their
concatenated string. A mismatch is `stream_content_mismatch`; completion is not
released and the run fails closed. The completion text is never released a
second time. If no token events were observed, bounded `completed.content`
becomes the final output target and follows the configured final assessment.

## Controlled runtime request and provider normalization

The runtime export uses `ControlledAgentRequestV1` and does not implement the
existing `AgentProvider` or `AgentRuntime` interfaces.

```text
ControlledAgentRequestV1
  schemaVersion: 1
  runId
  tenantId
  policyId
  policyVersion
  capabilityHandleId
  agentDefinition: ControlledAgentDefinitionV1
  contextEntryIds: 1..256 ordered unique IDs
  input: bounded string or JSON value
  scope: standalone scope | coordinated scope | null
```

```text
ControlledAgentDefinitionV1
  schemaVersion: 1
  agentId
  name: 1..256 UTF-8 bytes
  description: 0..2,048 UTF-8 bytes | null
  platform: 1..128 ASCII characters
  modelName: 1..256 UTF-8 bytes | null
  instructionContextEntryIds: 0..64 ordered unique IDs
  config: bounded JSON object | null
```

The controlled definition deliberately has no metadata, skills, capabilities
or free-form instructions field. Its instruction IDs must resolve only to the
same run's policy, Objective or local-trusted entries. `config` is authored by
the local application, limited to 65,536 canonical UTF-8 bytes and treated as
provider configuration, never as action/control authority.

`renderControlledAgentRequestV1` creates the exact existing contracts passed to
the provider. It projects `ControlledAgentDefinitionV1` to `AgentDefinition`
using the same ID/name/description/platform/model/config; `instructions` is the
canonical JSON string of `{ schemaVersion: 1, trustedContext: [...] }` in policy,
Objective, local-trusted tier order. It omits capabilities, skills and metadata.

The renderer creates `AgentRunInput` with `mode: invoke`, no conversation ID,
attachments or metadata, and `input` as an ordered `JsonObject[]`. Element zero
is `{ schemaVersion: 1, kind: "agentplat.control.input", content: <input> }`.
Remaining elements are canonical data envelopes for every untrusted context
entry in fixed user, peer, tool, retrieval, provider, assessor tier order; each
contains only schema version, kind, zone, source kind/ID/version, content,
content/provenance digests and created logical time. Caller order is preserved
within a tier. Trusted instruction entries are not duplicated in the ordinary
input. The renderer returns the projected definition, input and one
`provider-request` digest over both. Any rendered definition plus input above
1,048,576 UTF-8 bytes fails before provider invocation.

Credentials, tenant actor and cancellation stay in a construction-bound
execution-context provider. Generic definition metadata, execution-context
policies and request metadata cannot create control authority.

The executor exposes new `ControlledAgentRunEventV1` and
`ControlledAgentRunResultV1` contracts. It never extends `AgentStreamEvent`.
The reference normalizer accepts exactly one `started` event, assigns exact
sequence and UTF-8 byte bounds to string token events, and requires a provider
tool call payload to be the closed `{ id, name, arguments }` shape before it
can become a bounded action target. Tool results are admitted only as
`tool_untrusted` context. Unknown events and malformed payloads fail closed.

A provider completion's public text follows the stream rules above. Generic
`result`, `payload` and `metadata` values are opaque and withheld by default;
they may be released only through a construction-bound, policy-allowlisted,
versioned normalizer that creates a separate bounded untrusted context entry
and assessment target. The final controlled result contains only assessed
output, coarse terminal state and bounded redacted diagnostics.

```text
ControlledAgentRunResultV1
  schemaVersion: 1
  runId
  tenantId
  generation: positive safe integer
  status: completed | denied | abstained | escalated | failed
  output: bounded string | null
  outputDigest: assessment-target digest | null
  releasedBytes: non-negative safe integer
  terminalReasonCode: reason code | null
  diagnostics: bounded ControlDiagnosticV1[]
```

Only assessed/released text can populate `output`; provider result, metadata,
tool payloads, credentials and hidden state have no field in this result.

The controlled event union is structurally compatible with the existing public
`StreamEvent<string, JsonObject>` constraint without changing its default
`AgentStreamEvent` union:

```text
ControlledAgentRunEventV1 =
  { type: control_started, runId, payload:
      { schemaVersion: 1, generation, policyId, policyVersion } }
| { type: control_output_released, runId, content, payload:
      { schemaVersion: 1, generation, streamId, sequence,
        throughByteExclusive, contentDigest } }
| { type: control_action_withheld, runId, payload:
      { schemaVersion: 1, generation, actionDigest, reasonCode } }
| { type: control_completed, runId, content?, payload:
      { schemaVersion: 1, generation, status: completed | denied | abstained |
        escalated, releasedBytes, outputDigest } }
| { type: control_failed, runId, payload:
      { schemaVersion: 1, generation, reasonCode } }
```

All payloads are closed `JsonObject` values. The executor emits exactly one
terminal `control_completed` or `control_failed` event. Public type and tarball
consumers must instantiate `AgentSseEnvelope<ControlledAgentRunEventV1>`, encode
and parse this union while leaving the default SSE generic unchanged.

The runtime export includes `validateControlledAgentRunEventV1` for stateless
closed-shape validation and `createControlledAgentSseValidatorV1()`, which
returns `{ validate(envelope), finish() }`. `validate` is passed to the existing
`parseAgentSseStream` callback and requires a contiguous positive envelope
sequence, one run ID/generation, exact payload keys and monotonic release
sequence/byte heads; it rejects unknown types, malformed payloads and any event
after terminal before delivery. The consumer must call `finish()` after the
`for await` completes; it requires exactly one terminal and rejects EOF without
one. `consumeControlledAgentSseV1` is the reference wrapper that performs both
steps in `try/finally`. Packed recipes use that wrapper or explicitly call both
methods because a TypeScript generic alone is not runtime validation.

## Authority scopes and resolver

The standalone and coordinated variants are exact closed objects:

```text
StandaloneControlScopeV1
  schemaVersion: 1
  kind: standalone
  tenantId
  runId
  agentId
  organizationId: bounded string | null
  workspaceId: bounded string | null
  policyId
  policyVersion

CoordinatedControlScopeV1
  schemaVersion: 1
  kind: coordinated
  tenantId
  runId
  agentId
  policyId
  policyVersion
  meshId
  objectiveId
  objectiveRevision: positive safe integer
  workItemId
  workItemRevision: positive safe integer
  peerId
  instanceId
  assignmentAuthorityId
  assignmentEpoch: positive safe integer
  fencingToken: existing AgentPlat/Mesh ID string
  leaseExpiresAtLogicalMs: positive safe integer
  authorityGeneration: positive safe integer
  objectiveTerminal: boolean
  workTerminal: boolean
```

Coordinated actions require a construction-bound resolver. Its request is:

```text
CoordinatedAuthorityRequestV1
  schemaVersion: 1
  authorityRequestId
  resolverId
  resolverVersion: positive safe integer
  proposedScope: CoordinatedControlScopeV1
  expectedPolicyDigest
  actionDigest
  logicalTimeMs
```

It returns exactly one normalized closed variant:

```text
current
  schemaVersion: 1
  authorityRequestId
  resolverId
  resolverVersion
  expectedPolicyDigest
  actionDigest
  canonicalScope: CoordinatedControlScopeV1
  authorityGeneration
  verifiedAtLogicalMs
  downstreamFenceRequired: boolean

stale | unavailable
  schemaVersion: 1
  authorityRequestId
  resolverId
  resolverVersion
  reasonCode
```

Every copied request and resolver field must match. The canonical scope must
equal the proposal and be non-terminal, unexpired and at least the retained
authority high-water generation. Missing resolver,
malformed response, rollback, timeout or disagreement denies without mutation.
Resolver identity/version is bound when the gateway is constructed; a caller
cannot supply or replace it through request data.

## Action Grants

### Scope

The grant scope is a closed discriminated union.

Standalone scope uses `StandaloneControlScopeV1`. Coordinated scope uses
`CoordinatedControlScopeV1`; no partial or metadata-derived variant exists.

### Grant record

```text
ActionBindingV1
  schemaVersion: 1
  actionBindingId
  actionBindingVersion: positive safe integer
  namespace
  toolId
  operation
  dispatcherId
  dispatcherVersion: positive safe integer
  contextResolverId
  contextResolverVersion: positive safe integer
  fencingMode: local_only | downstream_atomic
  handlerDigest

ActionGrantV1
  schemaVersion: 1
  grantId
  stateGeneration: positive safe integer
  scope: StandaloneControlScopeV1 | CoordinatedControlScopeV1
  scopeDigest
  namespace
  toolId
  operation
  actionBindingId
  actionBindingVersion
  handlerDigest
  inputDigest
  actionDigest
  assessmentRequestId
  assessmentId
  assessmentTargetDigest
  idempotencyKey
  issuedAtLogicalMs
  expiresAtLogicalMs
  singleUse: true
  status: issued | reserved | dispatched | failed | indeterminate | expired
  reservation: ActionReservationV1 | null

ActionReservationV1
  schemaVersion: 1
  reservationId
  dispatchAttemptId
  reservedByGatewayId
  reservedStateGeneration: positive safe integer
  authorityGeneration: positive safe integer | null
  fencingToken: existing AgentPlat/Mesh ID string | null
  reservedAtLogicalMs

ActionDispatchPermitV1
  schemaVersion: 1
  grantId
  reservationId
  dispatchAttemptId
  gatewayId
  scopeDigest
  actionDigest
  idempotencyKey
  authorityGeneration: positive safe integer | null
  fencingToken: existing AgentPlat/Mesh ID string | null
```

One immutable grant therefore binds state generation, exact scope, action and
handler identity, mandatory canonical input, complete action digest, source
pre-tool assessment request/result, idempotency key and trusted lifetime.

Grant expiry is the earliest of issue time plus policy grant TTL, source
assessment expiry, run deadline and coordinated lease expiry. A caller cannot
request or restore a later value.

The input digest is never optional. An action with no arguments binds the
canonical empty object `{}`. The `action` digest covers exact scope digest,
namespace, tool ID, operation, binding ID/version, handler digest and
`action-input` digest. Construction freezes the handler reference and its
identity/version in one `ActionBindingV1`; replacing a registry entry later
cannot redirect an already issued grant.

`ActionDispatcherV1` is a construction-bound interface with ID, version and
`fencingMode`. Its dispatch request contains the frozen `ActionBindingV1`,
bounded canonical input, resolved `ToolInvocationContext` and exact
`ActionDispatchPermitV1`. An `ActionInvocationContextResolverV1`, also bound by
ID/version, derives tenant, organization/workspace, tool and run IDs from the
grant scope and resolves credentials from application memory at invocation
time. Credentials never enter grant/state/snapshot/diagnostic data.

The ToolRegistry helper freezes the discovered handler and calls it with the
resolved context through a `local_only` dispatcher; it never places the permit
or credentials in generic metadata and cannot claim downstream fencing. A
custom `downstream_atomic` dispatcher must pass and atomically validate the
permit's authority generation/fencing token with the external effect. The
handler, dispatcher and context-resolver identity/version all contribute to the
`handler-binding` digest.

```text
ActionInvocationContextRequestV1
  schemaVersion: 1
  resolverId
  resolverVersion
  grantId
  scope
  actionBindingId
  actionBindingVersion
  permit: ActionDispatchPermitV1

ActionInvocationContextResultV1 =
  { schemaVersion: 1, kind: resolved, requestDigest,
    context: { tenant, toolId, runId, credentials } }
| { schemaVersion: 1, kind: unavailable, requestDigest, reasonCode }

ActionDispatchRequestV1
  schemaVersion: 1
  dispatcherId
  dispatcherVersion
  dispatcherDigest
  binding: ActionBindingV1
  input: bounded JSON object
  context: resolved ToolInvocationContext
  permit: ActionDispatchPermitV1

ActionDispatchResultV1 =
  { schemaVersion: 1, kind: dispatched, dispatchAttemptId,
    result: { ok: true, value: bounded JSON value | null } }
| { schemaVersion: 1, kind: rejected, dispatchAttemptId, reasonCode }
| { schemaVersion: 1, kind: indeterminate, dispatchAttemptId, reasonCode }
```

The resolver and dispatcher expose only `resolve(request)` or
`dispatch(request)` respectively. Gateway policy supplies a timeout no greater
than the run deadline. Unknown keys, mismatched IDs/digests, oversized result,
timeout, thrown error or malformed response normalizes to unavailable before
dispatch starts or indeterminate after it may have started. Credentials are a
bounded string map returned only to the gateway/dispatcher and are immediately
discarded after the attempt.

Alpha 3 does not expose reusable grants. A new action requires a new grant ID
and assessment even when the action is semantically similar.

### Grant lifecycle

```text
issued -> reserved -> dispatched
                   -> failed
                   -> indeterminate
issued -> expired
```

Reservation is the local atomic single-use point and occurs before invoking the
dispatcher. The closed `ActionReservationV1` is retained on the grant. A second
reservation is rejected. A handler success produces
`dispatched`; an explicit pre-effect rejection may produce `failed`; any
timeout or error after dispatch may have begun produces `indeterminate`.

`LocalGrantLedger.reserve()` performs check-and-mutate synchronously in one
JavaScript execution turn, before any promise or handler await. Gateways that
share grants must share the same ledger instance; an asynchronous or
multi-process ledger is outside Alpha 3. Restoring a snapshot with `reserved`
state maps it to `indeterminate`, never back to `issued`. A missing current
ledger denies all protected dispatch.

An indeterminate action is not retried automatically. A caller may reconcile it
only through an explicit downstream idempotency/fencing contract and the same
idempotency key. Local single-use means at-most-one gateway dispatch attempt,
not exactly-once external effect.

### Gateway checks

The only protected invocation is:

```text
ActionGateway.invoke
  schemaVersion: 1
  grantId
  input: bounded JSON object, canonical `{}` when absent
  logicalTimeMs
```

The caller does not supply a grant document, action identity, handler,
assessment or authority resolver. The gateway resolves all of them from its
construction-bound registries and retained ledger, canonicalizes the input and
requires exact digest equality.

Before reservation, the gateway checks:

- canonical retained grant exists and is still `issued`;
- trusted local time is before expiry;
- policy and source assessment remain current;
- tenant and action match;
- mandatory input digest matches;
- standalone or coordinated authority resolver accepts the exact scope;
- Objective, Work, lease and run are non-terminal;
- epoch and fencing token are current;
- idempotency head is absent or identical;
- state and diagnostic capacity are available.

The synchronous reserve transition writes the exact reservation and changes the
grant to `reserved`. Immediately before dispatch, the gateway rechecks:

- the grant is still `reserved` at the expected state generation;
- reservation ID, dispatch-attempt ID and gateway ID equal its local values;
- policy, assessment, run, input and idempotency heads remain current;
- the second authority result remains exact, non-terminal and unexpired;
- retained authority generation and fencing token equal the dispatch permit;
- the frozen dispatcher/context-resolver binding digest still matches.

Failure before reservation invokes no handler. Failure after reservation and
before dispatch invokes no handler and terminally changes that reservation to
`failed` for an explicit stale/mismatch outcome or `indeterminate` if the local
state cannot prove dispatch did not begin; it never returns to `issued`.

Idempotency is keyed by `(scopeDigest, idempotencyKey)`. First issuance binds
that key to one action digest and grant. Equal replay returns the retained
grant/outcome and creates no new dispatch; a different action digest is
`grant_idempotency_conflict`. Terminal and indeterminate idempotency heads are
never evicted while their owning scope remains retained.

The final local check and reservation prove authorization only at that instant.
When coordinated authority can advance concurrently, the gateway passes a
closed dispatch permit containing authority generation and fencing token to
the handler. A strong “no stale external effect” claim requires the downstream
system to compare-and-accept that fence atomically with the effect. Without
such a contract Alpha 3 claims only a locally authorized dispatch attempt; a
downstream fence rejection is terminal and an ambiguous response is
indeterminate.

## Outbound message gateway

`pre_message` is enforced only by the explicit outbound gateway. Direct use of
the underlying dispatcher bypasses this opt-in boundary.

```text
OutboundMessageV1
  schemaVersion: 1
  messageId
  runId
  tenantId
  channel
  recipient: bounded string
  mediaType: text | json
  content: bounded string or JSON value
  scope: standalone scope | coordinated scope
  idempotencyKey
  messageDigest

OutboundMessageAttemptV1
  schemaVersion: 1
  messageAttemptId
  messageId
  assessmentRequestId
  assessmentId
  messageDigest
  scopeDigest
  idempotencyKey
  generation: positive safe integer
  dispatcherId
  dispatcherVersion: positive safe integer
  dispatcherDigest
  state: prepared | reserved | sent | failed | indeterminate | expired
  reservation: MessageReservationV1 | null
  reservedAtLogicalMs: safe integer | null
  expiresAtLogicalMs

MessageReservationV1
  schemaVersion: 1
  reservationId
  messageDispatchAttemptId
  reservedByGatewayId
  reservedStateGeneration: positive safe integer
  authorityGeneration: positive safe integer | null
  fencingToken: existing AgentPlat/Mesh ID string | null
  reservedAtLogicalMs

MessageDispatchPermitV1
  schemaVersion: 1
  messageAttemptId
  reservationId
  messageDispatchAttemptId
  gatewayId
  scopeDigest
  messageDigest
  idempotencyKey
  authorityGeneration: positive safe integer | null
  fencingToken: existing AgentPlat/Mesh ID string | null
```

`OutboundMessageGateway.send({ message, logicalTimeMs })` recomputes the digest,
requires an allowed exact channel and consumes one current matching
`pre_message` assessment before synchronously reserving the attempt. Only then
may it await the construction-bound dispatcher. Denial, cancellation, stale
authority, expiry or mismatch produces zero send calls. A synchronous explicit
pre-send rejection becomes `failed`; any ambiguous outcome after the dispatcher
may have started becomes `indeterminate` and is not retried automatically.
`messageInterception: application_only` never claims to intercept messages sent
outside this gateway.

The construction-bound dispatcher has an immutable ID/version/digest and
receives the exact `MessageDispatchPermitV1`. A coordinated
`downstream_atomic` implementation validates the authority generation/fence
atomically with send; a `local_only` dispatcher receives the permit but claims
only a locally authorized attempt. The synchronous reservation is the
linearization point and binds gateway, attempt, dispatcher and authority before
any await. Both a crash before dispatcher start and an ambiguous crash after it
starts restore to `indeterminate`; neither is retried automatically.

```text
OutboundMessageDispatchRequestV1
  schemaVersion: 1
  dispatcherId
  dispatcherVersion
  dispatcherDigest
  message: OutboundMessageV1
  permit: MessageDispatchPermitV1

OutboundMessageDispatchResultV1 =
  { schemaVersion: 1, kind: sent, messageDispatchAttemptId,
    providerMessageId: bounded string | null }
| { schemaVersion: 1, kind: rejected, messageDispatchAttemptId, reasonCode }
| { schemaVersion: 1, kind: indeterminate, messageDispatchAttemptId,
    reasonCode }
```

`OutboundMessageDispatcherV1.dispatch(request)` is its only effectful method.
The gateway applies a timeout no later than the run deadline. Unknown keys,
mismatched binding/attempt/permit, oversized response, thrown error, timeout or
malformed response becomes an explicit rejection only when the dispatcher
proves send did not start; otherwise it becomes indeterminate.

Message-attempt expiry is the earliest of preparation time plus policy message
permit TTL, source assessment expiry, run deadline and coordinated lease expiry.
A caller cannot request or restore a later value.

The state and strict snapshot retain message-attempt and scoped message
idempotency indexes. Equal replay of `(scopeDigest, idempotencyKey,
messageDigest)` returns the retained attempt/outcome without a second send; the
same scoped key with a different message digest is a conflict. Restore maps
`reserved` to `indeterminate`, never `prepared`; an unreserved prepared attempt
may become `expired` at its exclusive deadline. Live, sent and indeterminate
message identity state is not evicted while its owning scope is retained.

## Numeric bounds

Caller limits must be positive safe integers no greater than these hard
ceilings:

| Resource                           | Hard ceiling |
| ---------------------------------- | -----------: |
| context entries per run            |          256 |
| UTF-8 bytes per context entry      |       65,536 |
| total context bytes per run        |    1,048,576 |
| provenance references per entry    |           16 |
| accepted assessments per run       |          128 |
| bytes per normalized assessment    |       65,536 |
| evidence references per assessment |           32 |
| revisions per run                  |            8 |
| retries per run                    |            8 |
| challenges per run                 |            8 |
| provider output chunks per run     |        8,192 |
| UTF-8 bytes per output chunk       |       65,536 |
| pending incremental-window bytes   |      262,144 |
| buffered output bytes per run      |    4,194,304 |
| action-input UTF-8 bytes           |       65,536 |
| outbound-message UTF-8 bytes       |       65,536 |
| dispatch attempts per run          |        1,024 |
| active grants                      |        1,024 |
| retained grant records             |        4,096 |
| active outbound-message attempts   |        1,024 |
| retained outbound-message attempts |        4,096 |
| control diagnostics                |        4,096 |
| total state bytes                  |   16,777,216 |
| run duration milliseconds          |   86,400,000 |
| assessor response timeout ms       |       60,000 |
| assessment TTL milliseconds        |      300,000 |
| Action Grant TTL milliseconds      |      120,000 |
| message permit TTL milliseconds    |      120,000 |

Security state needed for a current run, unexpired grant, idempotency head or
terminal fencing decision is never evicted to admit new work. Capacity applies
backpressure or rejects the new input.

## Security and privacy invariants

1. Untrusted-zone content cannot alter policy, Objective, instructions,
   budgets, release mode, allowed actions or authority.
2. A signature or repeated claim authenticates provenance but cannot promote a
   context zone.
3. No provider is invoked before required capability negotiation and pre-run
   assessment succeed.
4. No output is released before the checkpoint required by its effective
   release mode.
5. Observe mode never satisfies an enforcement requirement.
6. Incremental mode never claims to retract already released bytes.
7. No tool handler is invoked without a current locally retained grant and
   successful atomic reservation.
8. A stale epoch, fencing token, lease, policy, assessment or Objective/Work
   revision authorizes no local dispatch attempt; preventing a race after the
   final local check requires atomic downstream fence validation.
9. Same logical ID with different canonical content is a conflict, never a
   duplicate.
10. State, retries, challenges, buffers, assessments, grants and diagnostics
    are bounded before allocation.
11. Telemetry failure cannot alter a decision; grant-ledger failure blocks
    action dispatch.
12. Diagnostics contain no raw context, output, tool arguments, credentials,
    complete grants or private reasoning.
13. Low-entropy sensitive values use a tenant-keyed correlation digest at the
    driver boundary or are omitted; raw SHA-256 is not exposed as anonymity.
14. Snapshot restoration fails closed on unknown fields, mutable prototypes,
    missing relations, inconsistent counts, invalid transitions or forged
    digests.
15. Import and construction perform no network I/O or global registration.
16. A strict snapshot is sensitive application data and is never emitted as
    telemetry; a redacted projection cannot restore authority.
17. Outbound-message enforcement is claimed only for the explicit gateway and
    consumes an exact single-use `pre_message` assessment.

## Deterministic scenario suite

Reference scripted providers, assessors and action adapters run the production
reducers and wrappers without a live model.

1. **Trusted instructions and hostile data:** peer content imitates a policy,
   budget change and grant; it remains data and produces no authority.
2. **Missing provider control point:** policy requires complete tool
   interception while the provider declares none; provider invocation and tool
   dispatch remain zero.
3. **Buffered withholding:** unsafe output and tool calls are fully buffered,
   denied and never released or dispatched.
4. **Incremental prospective stop:** accepted prefixes release in order; a
   later denial prevents every future chunk and records the exact released
   byte count.
5. **Assessment binding:** an allow assessment reused with another digest,
   zone, policy version, run or checkpoint is rejected without release.
6. **Bounded continuation:** revise, retry and challenge terminate at their
   budgets with the configured fail-closed disposition.
7. **Stale coordinated grant:** an epoch-one grant is consumed after accepted
   recovery to epoch two; it is rejected before dispatch.
8. **Action substitution:** a grant for one operation or input cannot execute
   another operation or mutated arguments.
9. **Concurrent single use:** two consumers reserve one grant; exactly one may
   reach dispatch.
10. **Indeterminate downstream:** a timeout after dispatch marks the grant
    indeterminate and never retries automatically.
11. **Cancellation and late events:** late chunks, assessments and grants
    cannot reopen or release a terminal run.
12. **Capacity saturation:** context, buffer, assessments, grants and
    diagnostics reject new work without evicting current security state.
13. **Quiescent snapshot/restore equivalence:** with no reserved grant/message
    attempt, uninterrupted and restored execution produce identical state,
    effects, diagnostics and chain digest.
14. **Telemetry failure:** a failing sink changes neither disposition nor
    gateway result and receives no sensitive content.
15. **Compatibility:** unwrapped Runtime, Model, Tools, Streaming, Sessions,
    Rooms, Framework and Alpha 2 Mesh scenarios remain byte-for-byte or
    behaviorally unchanged as applicable.
16. **Renderer role separation:** hostile untrusted entries render only as a
    canonical user-data envelope; none become system or developer messages.
17. **Assessor correlation:** unsolicited, wrong-version, stale-generation and
    conflicting assessor results create no release, grant or message permit.
18. **Mandatory argument binding:** a no-argument action binds canonical `{}`;
    omitted, malformed or mutated input cannot dispatch.
19. **Crash after reservation:** restoring a reserved grant yields
    `indeterminate` and never another dispatch attempt.
20. **Idempotency identity:** equal `(scopeDigest, key, actionDigest)` replay
    returns the retained outcome; the same key with another action conflicts.
21. **Clock rollback:** a logical time below the high-water mark changes no
    security state and grants no release or dispatch.
22. **Authority race:** a new authority generation after local reservation is
    rejected by a fencing-aware downstream; without that adapter the evidence
    claims only local authorization.
23. **Streaming normalization:** UTF-8 boundaries, sequence conflicts and a
    completion-text mismatch fail closed without duplicate release.
24. **Message interception:** denial, stale scope or reused assessment produces
    zero dispatcher calls; an ambiguous send becomes indeterminate.
25. **Snapshot confidentiality:** strict state never reaches telemetry and the
    redacted projection cannot be restored.
26. **In-flight restore fencing:** a snapshot containing a reserved grant or
    message attempt restores that record as `indeterminate`; it never reproduces
    the uninterrupted projection or another external attempt.
27. **Dependency rebinding:** changing/missing capability, assessor,
    transformer, resolver, dispatcher or handler binding rejects strict restore.
28. **Controlled SSE terminality:** unknown/malformed/post-terminal events and
    an EOF without exactly one terminal are rejected by the stateful validator.

Each scenario records configuration, seed where scheduling is involved,
policy digest, capability descriptor, ordered decisions and first replay
divergence.

## Implementation increments

### Increment 0: design and contract freeze

- add this implementation plan and the Alpha 3 acceptance checklist;
- add a dedicated inference-control threat model;
- update the release plan, glossary and compatibility policy;
- freeze schemas, state machines, limits, reason codes and non-goals;
- obtain independent architecture, security and release reviews.

Exit criterion: no P0/P1 design ambiguity remains and every later increment has
an executable acceptance boundary.

### Increment 1: release-line guard, package and pure contracts

- first set the root and all existing cataloged manifests to
  `0.3.0-alpha.3`, then create `@agentplat/inference-control` at that same
  version; the repository never contains a publishable 29-package Alpha 2 set;
- add a tested release-line sentinel shared by `verify:release` and
  `publish-packages.mjs`: if the inference-control package is present, root and
  exactly 29 cataloged manifests must all equal `0.3.0-alpha.3`; it runs before
  any release tarball, registry read or mutation;
- register package 29 in the canonical public catalog, update the catalog count
  assertion from 28 to 29, add the root development dependency and refresh the
  frozen lockfile;
- declare root plus `/model`, `/runtime`, `/tools` and `/messages` exports;
- implement closed constants, types, validation, canonical digest inputs,
  limits and strict immutable state restoration;
- implement pure provider-capability negotiation;
- add public TypeScript contracts and negative schema/capacity tests;
- keep all existing packages and behavior unchanged.

Exit criterion: the package packs and imports independently, unknown or
oversized values fail closed, and capability negotiation is deterministic.

### Increment 2: context and policy projection

- implement bounded context admission and canonical provenance;
- implement explicit local promotion records;
- accept immutable local policy versions and Objective narrowing;
- implement run creation, counters, timers and terminal heads;
- prove untrusted content cannot mutate an instruction or authority projection.

Exit criterion: one strict snapshot captures context, policy and run identity,
and identical inputs reproduce the same projection.

### Increment 3: assessments and buffered release

- accept construction-bound normalized assessments;
- enforce exact policy/content/zone/run/authority bindings;
- implement pre-run and post-run checkpoints;
- implement observe and buffered modes;
- implement bounded revise, retry, challenge, abstain, escalate and deny;
- add the explicit `ControlledModelExecutor` and fixed renderer without
  implementing or changing the original adapter interface.

Exit criterion: buffered output and tool calls cannot leave the wrapper before
an exact current allow, while observe mode records but never claims enforcement.

### Increment 4: incremental and controlled runtime streaming

- implement causal chunk IDs, pending windows and released sequence heads;
- implement incremental assessment and prospective release interruption;
- add the explicit controlled request compiler, executor and exact provider
  normalizer without implementing AgentProvider/AgentRuntime;
- expose a new controlled event union instead of extending
  `AgentStreamEvent`;
- preserve SSE generic transport ordering, cancellation and terminality;
- prevent late chunks or assessments from releasing after a terminal head.

Exit criterion: every released byte has an accepted causal checkpoint and an
unwrapped runtime remains unchanged.

### Increment 5: Action Grants and gateway

- implement strict local grant ledger and snapshots;
- issue a grant only from an accepted exact pre-tool assessment;
- implement typed standalone and coordinated authority resolvers;
- atomically reserve single-use grants before handler dispatch;
- bind action, mandatory input digest, binding identity/version, assessment,
  policy, expiry and
  idempotency;
- classify explicit failure versus indeterminate downstream outcome and map a
  restored reservation to indeterminate;
- add the explicit Action Gateway plus helpers that freeze ToolRegistry handler
  bindings without returning an authorized ToolHandler;
- reject provider-native tool enforcement when interception is unavailable.

Exit criterion: no protected handler invocation occurs without one exact
current grant, and concurrent or stale attempts cannot dispatch.

### Increment 6: outbound messages, adversarial and recovery scenarios

- implement the outbound message gateway and construction-bound dispatcher;
- implement all 28 deterministic scenarios with scripted drivers;
- add fault controls for assessor timeout/conflict, ignored cancellation,
  native tool attempts, gateway crash boundaries, policy rotation, stale grant
  delivery, downstream timeout/fence rejection and telemetry failure;
- verify uninterrupted versus strict snapshot/restore equivalence;
- add invariant monitors after every transition;
- report configuration and first replay divergence.

Exit criterion: every security invariant is executable and the scenario suite
terminates within fixed event, time, queue and internal-step bounds.

### Increment 7: packaging and documentation

- add a dedicated tarball consumer for context, buffering, incremental control
  Action Gateway and outbound-message behavior, importing all five package
  entrypoints;
- update the pack verifier's workspace package set and export importer;
- extend the exact-version registry consumer constants, copied scenario,
  package count assertion and tests with the exact new package;
- compile packed declarations with library checking enabled;
- audit root and declared browser import closure;
- update README, changelog, package docs, release channels and release guide;
- rerun unchanged Runtime, Model, Tools, Streaming, Sessions, Rooms, Framework
  and Agent Mesh compatibility gates.

Exit criterion: 29 tarballs install in an isolated consumer and the dedicated
Alpha 3 scenario uses only packed public exports.

### Increment 8: coordinated release

- re-run the tested release-line sentinel before any release tarball, release
  dry-run or registry mutation;
- run the required non-empty external terminology audit;
- run the complete clean build, type, unit, adapter, scenario and pack gates;
- independently review the release diff and publisher safety;
- complete all prepublication `verify:pack` and packed-consumer gates, then a
  no-mutation public-registry dry-run;
- publish missing versions under a commit-specific staging tag;
- compare every registry integrity record to its local tarball;
- promote the complete 29-package set to `next`;
- remove staging tags only after complete promotion;
- run the postpromotion exact-version registry consumer (which is deliberately
  separate from the prepublication pack consumer);
- create annotated tag `v0.3.0-alpha.3` at the verified release commit;
- record workflow, commit, timestamps, rollback targets and integrity ledger.

Exit criterion: every cataloged package exposes the integrity-verified Alpha 3
artifact under `next`, the tag peels to the release commit and the public
checklist contains reproducible evidence.

## Test strategy

### Unit and property coverage

- exhaustive closed-schema parsing and strict snapshot restoration;
- capability-policy negotiation matrix;
- UTF-8 and encoded-byte boundaries;
- context zone and promotion authority;
- assessment binding, expiry, duplicates and conflicts;
- every disposition and budget boundary;
- buffered and incremental release sequencing;
- grant state transitions, authority, concurrency and idempotency;
- redaction and sink-failure behavior;
- deterministic model-based traces for state reducers.

### Compatibility coverage

- existing public `.mts` consumers compile unchanged;
- existing runtime/model/tool behavior is unchanged without wrappers;
- `AgentStreamEvent` remains closed and unchanged;
- Framework retains no inference-control dependency or re-export;
- Sessions and Rooms keep their current orchestration/governance defaults;
- all Alpha 1 and Alpha 2 fixtures and deterministic scenarios remain green;
- package import has no side effects.

### Pack and registry coverage

- all declared package exports import from isolated tarball consumers;
- packed declarations compile with dependency library checking enabled;
- provider-neutral and browser closures contain no undeclared or vendor-only
  dependency;
- dedicated Alpha 3 behavior runs from tarballs before publication;
- exact `0.3.0-alpha.3` registry consumer runs after coordinated promotion.

## Promotion gate

The release is blocked by:

- any uncontrolled protected handler dispatch;
- any pre-assessment buffered release;
- any stale epoch/fence grant dispatch;
- any snapshot that restores an invalid transition or loses current security
  state;
- any capability mismatch that degrades silently;
- any raw sensitive content in diagnostics;
- any existing package regression;
- any catalog, tarball, type, audit, registry integrity or consumer failure;
- any unresolved independent-review P0 or P1 finding.

## Prioritized risks

- **P0 — false enforcement claim:** provider-native tools or released stream
  bytes bypass the wrapper. Mitigate through explicit capability negotiation,
  buffered high-risk output and narrow wrapper claims.
- **P0 — forged or replayed grant:** caller-supplied grant data reaches a
  handler. Mitigate through canonical local ledger lookup, exact bindings,
  atomic reservation and non-evictable live state.
- **P0 — stale external effect:** grant survives Objective, lease, epoch or
  fencing changes. Mitigate through authority revalidation at consumption and
  downstream fencing where available.
- **P1 — context promotion injection:** untrusted content becomes instruction.
  Mitigate through closed zones and explicit versioned local transformers.
- **P1 — resource exhaustion:** context, buffers, assessments, retries or grants
  grow without bound. Mitigate through pre-allocation limits and fail-closed
  backpressure.
- **P1 — sensitive telemetry:** raw content or action data leaks through events.
  Mitigate through schema-closed diagnostics and keyed correlation at the
  driver boundary.
- **P1 — API regression:** closed existing unions or defaults change. Mitigate
  through a new package, wrappers and compile-time compatibility tests.
- **P2 — provider cancellation ambiguity:** remote compute continues after
  local interruption. Mitigate by documenting local release interruption and
  avoiding claims about remote cancellation.
- **P2 — external effect ambiguity:** timeout follows a successful downstream
  effect. Mitigate through `indeterminate`, no automatic retry and explicit
  downstream idempotency/fencing contracts.

## Definition of complete

Alpha 3 is complete only when every applicable item in the acceptance
checklist is checked, linked to reviewed evidence, integrated into public
`main`, published as one coordinated 29-package set, independently consumed
from npm and tagged from the verified release commit.
