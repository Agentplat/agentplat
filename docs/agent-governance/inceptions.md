# Persistent inceptions and assessments (source preview)

Objective 4 provides authenticated intake and append-only assessment records.
These recording APIs do not by themselves enable execution or invoke a model.
The [qualified mission composition](missions.md) now consumes them. An application
supplies an authorized assessor (human or agent), whose judgment is recorded with
its evaluator reference, explanation, uncertainty and evidence. The future control
loop will invoke assessors and consume these records under execution policy.

## Intake and provenance

`AgentInceptionServiceV1` consumes an inception store, the governance store,
`getRoomState`, an `AgentInceptionAccessV1<Context>` host port and an optional clock.
It supports `submit`, `assess`, `get` and paginated `history`.

```ts
const inception = await inceptions.submit(credentials, {
  agentId: "retention-agent",
  roomId: "retention-room",
  inceptionId: "onboarding-idea",
  sourceMessageId: persistedMessageId,
  expectedGovernanceRevision: 0,
});
```

The source must already be a message in that tenant/Room, and the target agent
must be a participant. The service snapshots content, source role and attributed
participant from storage; it never trusts a caller-supplied author or replacement
content. `submittedBy` is the independently authenticated principal and is distinct
from the source message's participant attribution. A message's attribution alone
is not verified identity. Artifacts or external contributions can be introduced
through a Room message that references their context.

The current governed configuration must use `purpose`. Suspended configuration
permits these inert records; this does not resume or dispatch the agent. Existing
instruction agents retain their input path. Automatic conversion of every message
and autonomous assessment scheduling remain part of the later integration loop.

The access port separately authorizes `submit`, `assess` and `read` for the
agent/Room/inception. It receives source/evidence references, and `evaluatorRef`
for assessments, so the host can enforce participant, data-access and assessor
policy. Owner identity does not automatically authorize supplying agent judgments.
Read permission grants access to retained inception content and assessment history.
Missing credentials or authorization failure denies access. Raw HTTP tenant headers
never supply the authenticated principal.

## Assessment contract

```ts
const assessment = await inceptions.assess(assessorCredentials, {
  agentId: "retention-agent", roomId: "retention-room",
  inceptionId: "onboarding-idea", assessmentId: "review-1",
  expectedGovernanceRevision: 0, expectedAssessmentRevision: -1,
  evaluatorRef: "retention-assessor-v1",
  disposition: "reformulated",
  explanation: "The onboarding problem is relevant, but the suggested rollout is too broad.",
  uncertainty: "Evidence currently covers only one customer cohort.",
  reformulation: "Prepare a bounded experiment proposal before changing onboarding.",
  evidence: [{ kind: "artifact", id: reportId, versionId: reportVersionId }],
  proposedWork: [{ proposalId: "experiment-plan", description: "Draft the experiment proposal" }],
});
// assessment.executionAuthorized === false
```

All five dispositions are supported: `adopted`, `reformulated`, `rejected`,
`needs_evidence`, `deferred`. Every assessment requires a nonempty explanation
and uncertainty statement. Reformulation requires replacement text; other outcomes
use `null`. Only adopted/reformulated outcomes may include inert work proposals.
An adopted information contribution may legitimately have no work proposal.

Evidence is a bounded list of Room messages or exact artifact versions. The
service resolves them within the authorized tenant/Room and records content-bound
digests. Changing the current artifact version does not reinterpret old evidence.
An empty list is allowed and does not imply evidence sufficiency. Host policy and
the assessor own empirical judgment; successful persistence proves no semantic
alignment. No private reasoning trace is required.

Each receipt carries the current governance ID/revision/epoch/configuration digest
and definition revision, authenticated assessor, evaluator reference, timestamp,
request digest and assessment digest. It links to the previous assessment digest.
`proposedWork` entries are descriptions whose durable identity is scoped by the
assessment digest and proposal ID. They are not Room tasks, grants, approvals,
issued work or authorized effects. Later materialization must preserve this lineage
and independently pass current authority checks.

## Concurrency, history and replay

The inception ID is the intake idempotency key within a tenant/agent. The assessment
ID is scoped additionally to its inception. Exact retries return the immutable
original result; reusing an ID for different input or principal conflicts.
Replays may return historical governance bindings. Consumers must not interpret
a historical adopted assessment as currently valid execution authority.

Assessment revisions start at zero (`expectedAssessmentRevision: -1`) and use CAS.
Reassessment appends; it never edits a previous result. A current purpose change
requires a new evaluation against the new governance revision while preserving
history. Input and result storage are bounded; history supports exclusive revision
cursors and a maximum page size of 1000.

Both adapters atomically check governance at write time, beyond the service's
initial read. The memory adapter uses a synchronous check on its paired
`InMemoryAgentGovernanceStoreV1`. PostgreSQL locks the governance row `FOR SHARE`
for the transaction, serializing against configuration changes. A governance
change that commits first prevents the stale assessment/intake from committing.
A change after an assessment commits makes that receipt historical; it never
retroactively deletes it. Assessment head advancement and receipt insertion commit
or roll back together. Exact concurrent retries have one durable result.

## Adapters and HTTP

- `InMemoryAgentInceptionStoreV1(governanceMemoryStore)` is ephemeral.
- `PostgresAgentInceptionStoreV1(pool, { schema })` uses migration 014 and must
  share the governance schema. Intake and receipts are protected from UPDATE and
  DELETE; a separate CAS head tracks the latest assessment. Migration rollback
  removes inception data only with the existing explicit data-loss controls.
- `createRoomsApp({ service, agentInceptions })` adds independently authenticated
  endpoints under `/rooms/:roomId/agents/:agentId/inceptions`:
  `POST /` submits a source message, `GET /:inceptionId` reads intake,
  `POST /:inceptionId/assessments` records judgment, and
  `GET /:inceptionId/assessments?afterRevision=-1&limit=100` reads history.

No new model, scheduler, execution worker or approval authority is installed by
these exports. Standalone purpose execution remains blocked; use the qualified mission composition.

## Validation evidence

Shared memory/PostgreSQL scenarios exercise all dispositions, authenticated roles,
source/evidence scope, immutable artifact versions, CAS and exact retry races,
reassessment after purpose changes, and governance changes between read and commit.
They assert that assessments create no tasks, runs or approvals and do not mutate
purpose. PostgreSQL additionally covers pool reopen, immutable-history protection,
head rollback on receipt conflict, and migration 014 rollback/reapply. HTTP and
public-type tests cover the exposed boundary. These are local software checks.
