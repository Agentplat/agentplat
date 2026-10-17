# Persistent agent composition: source implementation

Status: opt-in source implementation, 2026-10-17. No release or deployment claim.
The [design](persistent-agent-learning-design.md) separates framework work from
consumer and specialized-service work. Only AgentPlat was changed here.

## Implemented boundaries

| Need | Implementation |
| --- | --- |
| Personal/shared memory and stable-agent subjects | `MemoryRevisionServiceV1`, mandatory `MemoryRevisionAccessV1`, separate subject/audience. |
| Correction, validity, retention and history | Immutable `MemoryRevisionV1`, CAS head, predecessor digest, operation replay, retirement and authorized historical reads. |
| Durable memory/audit | `PostgresMemoryRevisionStoreV1` atomically commits head and immutable revision/audit record. Independent opt-in migration ledger. |
| Context/tool evidence | `resolveMemoryRevisionSnapshotV1` and `registerMemoryRevisionReadToolV1` use the same service view; snapshot carries exact revision/digest references. |
| Legacy retrieval consistency | `readableRoomMemory` shared by `BoundedContextBuilder` and standard Room memory search. |
| Controlled definition selection/reversal | `AgentDefinitionChangeServiceV1` consumes an exact approved artifact, validates evaluator evidence, and executes the existing governance `mode` command. |
| Background work/review | Existing workflows, PostgreSQL and optional Temporal remain authoritative. Runnable composition in `examples/persistent-agent-learning.mjs`. |

No new cron, vector engine, notification sender, domain ontology or mutable skill
registry was introduced. Existing outcomes, approval gates, attention and usage
contracts remain unchanged. Consumer skill authoring, organization membership,
source collection, evaluator adjudication and notification delivery stay external.

## Memory integration

```ts
import {
  MemoryRevisionServiceV1,
  resolveMemoryRevisionSnapshotV1,
} from '@agentplat/rooms';
import {
  PostgresMemoryRevisionStoreV1,
  runMemoryRevisionMigrations,
} from '@agentplat/rooms-postgres';

await runMemoryRevisionMigrations(pool, { schema: 'agents', createSchema: true });
const memory = new MemoryRevisionServiceV1(
  new PostgresMemoryRevisionStoreV1(pool, { schema: 'agents' }),
  access, // authenticate credentials; authorize every operation against current policy
);
const snapshot = await resolveMemoryRevisionSnapshotV1(memory, credentials, ids);
// Include authorized entries in model context and persist references in an evidence artifact.
```

`authenticate` returns the existing `TenantContext` with a verified actor ID.
Personal memory is restricted to that actor. Shared audiences require the host's
mandatory `authorize` implementation to verify organization/workspace membership.
This release does not implement impersonation or delegated personal-memory reads.
A background host must provide appropriate verified credentials; untrusted owner
IDs from prompts/tool arguments are not credentials.

`append` accepts a stable memory ID, operation ID, expected revision (`null` on
creation), subject, audience, JSON content, evidence references, observation and
validity timestamps, status and reason. It binds the authenticated actor and server
recording time. Repeating identical input/actor replays the original revision;
reusing operation identity with different input conflicts. Replaying an operation
that returns a revision rechecks historical read permission and retention; it
cannot recover content that current reads must withhold. Concurrent competing
revisions have a single winner. Subjects are immutable; changing audience requires
write and explicit share authorization on both old and new audiences.

`read(credentials, id)` returns only the current active, valid, retained revision.
`read(credentials, id, revision)` is a separate historical operation: it requires
permission on both the current and historical audience and respects retention.
Publishing a shared correction does not expose an older personal revision.
Retirement removes the record from current retrieval; history remains available
under policy until retention expires. Retention filtering is not physical erasure.
The host owns deletion, backup retention and historical execution-snapshot policy.

`resolve` is bounded to 128 unique IDs, each append input to 64 KiB, and evidence lists
to 64 entries. Discovery/indexing belongs to the host; the service does not expose
an unfiltered cross-user list or vector search. Resolution is per record, not a
transactional snapshot across all IDs. Store exact returned revision references.
Reads reject a concurrent head/audience change instead of returning a revision
authorized against an obsolete head, and recheck time at completion. Sharing policy
is rechecked at write admission. JSON inputs reject cycles, sparse arrays and
excessive depth so persisted JSON and its digest retain the same meaning.
The append-only revision rows are also audit events, readable by revision; they
are not automatically published to a remote event bus.

The PostgreSQL migration uses its own `@agentplat/room-memory-revisions` ledger,
leaving the legacy Room migration head unchanged. Use
`getMemoryRevisionMigrationStatus` for checksum/status verification. Destructive
rollback requires `memoryRevisionRollbackConfirmation`, expected migration version
and explicit `allowDataLoss`; it removes all revisions in that opt-in schema.
Store constructors perform no I/O. Store ports are trusted internal infrastructure,
not authenticated public endpoints.

For legacy memory, both context and tools now check tenant, participant, scope
policy and expiry. Standard search can return role/artifact/organization memory
only when the same context read policy permits it. Missing/invalid `retainUntil`
on an `until` record is excluded. Inject the same clock into builder/tool options
when deterministic time is needed.

## Controlled instruction changes

1. Create a new immutable definition revision with the existing registry. Pin
   composed instructions/skill references in that revision. Publishing it makes
   it eligible for selection; it does not activate governed execution.
2. Create a Room artifact of type `agent.definition.change.v1`. Its JSON content
   conforms to `AgentDefinitionChangeV1`: exact agent, base/candidate revision IDs
   and digests, evaluation reference and reason.
3. Use existing Room human approval for that artifact version.
4. Call `AgentDefinitionChangeServiceV1.apply` with authenticated owner credentials,
   exact artifact/approval, operation identity and expected governance revision.
5. The service verifies the base/candidate and a mandatory evaluator port receipt,
   then invokes existing governance. Successful selection remains suspended.
6. Use existing `prepare_activation`/`activate` with qualified execution admission.
   A reverse proposal selecting a previous published compatible definition follows
   the same review path; old permissions and external effects are not restored.

The host supplies `authenticate` using the same verified principal source as
`AgentGovernanceServiceV1`. Owner identity is checked before loading proposal
content. Governance still independently authenticates and authorizes the command.
The evaluation port must authenticate its canonical record and rubric, return
matching base/candidate digests and evaluation reference, and expire evidence.
A boolean claimed by the model is not evaluator evidence.

The helper derives a stable governance operation ID from tenant, agent and logical
operation ID. Governance binds it to the candidate and expected revision; exact
retries replay its receipt and conflicting operation reuse fails. Keep the approved
proposal/request reference in the calling workflow evidence for audit correlation.
The optional governance `mode.review` binding records the exact artifact version,
approval, evaluation reference and proposal digest in immutable operation history;
changing that binding under the same operation identity conflicts. Existing owner
commands without this optional review field remain compatible. The helper reloads
the proposal/approval after evaluation and rechecks expiration before admission. Stale governance revisions
conflict. New artifact content requires a new exact approval. The helper does not
create a distributed transaction across Rooms, evaluation and governance stores:
checks are admission-time checks and governance CAS fences the final configuration
write. Hosts requiring atomic cross-domain revocation must provide that stronger
coordination separately. The existing owners remain the authority boundaries.

## Verification and adoption

Run the local composition without providers or network calls:

```sh
node examples/persistent-agent-learning.mjs
node --test tests/rooms-memory-revisions.test.mjs tests/rooms-definition-change.test.mjs tests/persistent-agent-learning.test.mjs
AGENTPLAT_POSTGRES_TEST=1 PGDATABASE=postgres node --test packages/rooms-postgres/tests/memory-revisions.test.mjs
```

The PostgreSQL test creates and removes its own unique schema. It exercises the
same memory scenarios as the in-memory adapter, reopens the pool, and checks
migration status, rollback rejection and rollback/reapply. Test database access
must be configured explicitly in CI.

Existing workflow conformance tests cover waits, cancellation, fencing and
uncertain effects. The composition example is intentionally in-memory; it proves
API composition, not restart durability or model quality. Adoption must pin exact
package artifacts, apply the opt-in migration, connect verified identity/evaluator
ports and run the appropriate durable integration checks. No consumer deployment
or production readiness is implied by local tests.

Local verification on 2026-10-17: affected package builds and public TypeScript
contract checks passed; 152 Room/workflow/composition tests passed; both new
PostgreSQL adapter tests passed, including coexistence with the Room migration
ledger, reopen, rollback and reapply. Platform-boundary checks and whitespace
checks passed. These results apply to this local dirty checkout, not a release.

A subsequent [25-package source preview verification](../releases/persistent-memory-source-preview-20261017.md)
validated isolated/frozen consumer installation, exact packaged bytes, strict
public types and a PostgreSQL cross-conversation fixture. Follow the
[consumer integration and migration guide](../getting-started/persistent-memory-consumer.md)
for the bundle format, replay command, error semantics and remaining host work.

The [contract review and clean-commit npm/pnpm verification](../reviews/persistent-memory-20261017.md)
records the latest fixes, scoped branch and reproducible bundle.
