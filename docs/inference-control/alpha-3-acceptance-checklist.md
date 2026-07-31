# Inference Control `0.3.0-alpha.3` acceptance checklist

Status: candidate implementation and public gates verified. Coordinated
publication, independent registry verification and release tagging are
pending.

This checklist is the release contract for local inference and action
enforcement. A box is checked only when its evidence is reproducible from the
reviewed public commit. Registry and Git mutations are checked only after
independent verification.

## Candidate

- version: `0.3.0-alpha.3`;
- distribution tag: `next`;
- Git tag: `v0.3.0-alpha.3`;
- new package: `@agentplat/inference-control`;
- coordinated package count: 29;
- state and grant schema version: `1`;
- compatibility baseline: `v0.3.0-alpha.2`;
- release commit: not assigned;
- coordinated publication completion: not assigned.

## Design baseline

- [x] implementation plan is approved;
- [x] dedicated threat model covers every new trust boundary;
- [x] package, export and dependency boundaries are frozen;
- [x] context zones, promotion rules and provenance are frozen;
- [x] provider control capabilities and negotiation are closed;
- [x] policy, assessment, state, input and effect schemas are closed;
- [x] state/snapshot topology, reducer variants, effect variants and dependency
      binding records have exact keys and relations;
- [x] standalone/coordinated scopes and authority resolver request/results are
      exact and construction-bound;
- [x] release modes and checkpoint state machines are frozen;
- [x] Action Grant and gateway state machines are frozen;
- [x] outbound-message gateway and attempt state machine are frozen;
- [x] numeric limits and stable reason codes are frozen;
- [x] local-ledger and durability limitations are explicit;
- [x] Alpha 4 evidence/trust and Alpha 5 durability scope remain deferred;
- [x] independent architecture, security and release reviews have no unresolved
      P0 or P1 finding.

## Package and compatibility

- [x] `@agentplat/inference-control` is cataloged, provider-neutral and opt-in;
- [x] package import performs no network I/O, migration, registration or
      telemetry;
- [x] root export is browser-safe;
- [x] adapter subpaths depend only on public AgentPlat contracts;
- [x] model/runtime integrations use explicit stronger request contracts and do
      not claim to implement existing interfaces that lose zones/provenance;
- [x] tool protection uses explicit `ActionGateway.invoke`; helpers do not
      return a transparently authorized `ToolHandler`;
- [x] outbound-message protection uses an explicit gateway and does not claim
      interception of direct dispatcher calls;
- [x] no vendor SDK is reachable from the new package;
- [x] existing package versions remain coordinated;
- [x] Runtime, Model, Tools and Streaming root contracts are unchanged;
- [x] `AgentStreamEvent` remains unchanged and controlled events use a new
      union;
- [x] controlled events satisfy `StreamEvent<string, JsonObject>` and compile
      through `AgentSseEnvelope<ControlledAgentRunEventV1>` without changing
      the default SSE generic;
- [x] the public controlled-event validator rejects unknown/extra/malformed,
      noncontiguous, cross-run and post-terminal SSE events before delivery;
- [x] the controlled SSE consumer calls validator `finish()` and rejects EOF
      without exactly one terminal event;
- [x] Sessions fixed orchestration defaults remain unchanged;
- [x] Rooms governance and persistence behavior remain unchanged;
- [x] Framework has no dependency on or re-export of the alpha package;
- [x] Agent Mesh Alpha 1 and Alpha 2 fixtures, reducers and scenarios remain
      green;
- [x] unwrapped providers, adapters, runtimes and handlers behave exactly as
      before.

## Context zones and provenance

- [x] zone schema is closed and rejects unknown values;
- [x] only policy, accepted Objective and configured local-trusted content can
      supply instructions;
- [x] user, peer, tool, retrieval and provider content remain untrusted data;
- [x] assessor-produced revisions re-enter as `assessor_untrusted` data;
- [x] signatures and repetition cannot promote a zone;
- [x] provenance is immutable and bound to the exact content digest;
- [x] promotion creates a new entry and preserves its source;
- [x] only an authorized versioned local transformer can promote content;
- [x] no transformer can create policy or Objective authority;
- [x] context counts and encoded bytes are checked before mutation;
- [x] security-relevant entries are not evicted to admit new work;
- [x] duplicate entries are idempotent and conflicting ID reuse fails closed;
- [x] snapshot restore recomputes indexes, counts, digests and relations.
- [x] the normative renderer maps untrusted zones only to a canonical user-data
      envelope and never to system/developer roles;

## Policy and capabilities

- [x] policies are immutable, versioned and locally bounded;
- [x] a remote Objective can narrow but never expand local policy;
- [x] control capabilities are separate from model feature capabilities;
- [x] capability negotiation is pure and deterministic;
- [x] pre-run enforcement requires full input inspection;
- [x] final output enforcement requires a final assessment boundary;
- [x] incremental release requires incremental assessment and effective local
      release interruption;
- [x] application-only tool interception is not described as complete;
- [x] provider-native tool enforcement fails before provider invocation when
      interception is unavailable;
- [x] representation access is optional and never inferred from text access;
- [x] capability descriptors are validated, instance-bound and assurance-rated;
- [x] high-risk policies reject unverified capability descriptors;
- [x] allowed capabilities are policy-bound by exact wrapper/descriptor
      identity, version, digest and assurance;
- [x] final and incremental assessment capabilities negotiate independently;
- [x] every policy with allowed actions requires a pre-tool assessor binding,
      independent of output risk;
- [x] observe mode reports observation, not enforcement;
- [x] missing required capabilities fail closed with stable reasons.

## Assessments and continuations

- [x] checkpoints are closed to pre-run, stream, post-run, pre-tool and
      pre-message;
- [x] dispositions are closed to allow, revise, retry, challenge, abstain,
      escalate and deny;
- [x] the reducer retains a pending request before invoking an assessor;
- [x] assessments bind request ID/generation, assessor identity/version, policy,
      checkpoint, run, target, zone and provenance;
- [x] coordinated assessments also bind Objective/Work revisions, epoch and
      fencing token;
- [x] assessment uncertainty is a bounded integer value;
- [x] assessment evidence references and encoded bytes are bounded;
- [x] expired assessments cannot release output or issue grants;
- [x] an assessment cannot be reused across a different digest, zone, policy,
      run, checkpoint or authority;
- [x] duplicate assessments are idempotent and conflicting ID reuse fails
      closed;
- [x] unsolicited, expired, wrong-assessor and stale-generation results create
      no release, grant or message permit;
- [x] revise, retry and challenge each consume a finite explicit budget;
- [x] exhausted budgets terminate with the configured fail-closed disposition;
- [x] assessors are external drivers whose output is normalized before reducer
      invocation;
- [x] the pure reducer performs no provider, storage, network, clock, randomness
      or telemetry operation.

## Output release

- [x] off behavior requires no wrapper and changes no existing defaults;
- [x] observe mode never withholds or claims enforcement;
- [x] buffered mode releases no output or tool call before exact final allow;
- [x] buffer overflow fails closed without partial release;
- [x] high-risk output always uses buffered mode;
- [x] incremental mode releases accepted causal prefixes in order;
- [x] incremental denial prevents every future release;
- [x] incremental diagnostics record exact released bytes without raw content;
- [x] released output is never described as retractable;
- [x] duplicated or reordered chunks do not advance the release head twice;
- [x] stream assessments bind exact generation, sequence range, UTF-8 byte
      range and window digest;
- [x] completed content equals observed token concatenation or fails closed and
      is never released twice;
- [x] cancellation and terminal states fence late chunks and assessments;
- [x] stream abort is described as local release interruption, not guaranteed
      remote-compute cancellation;
- [x] controlled streams preserve SSE ordering, cancellation and exactly one
      terminal control outcome.

## Action Grants

- [x] the gateway resolves grants from its local ledger by ID;
- [x] caller-supplied grant documents and metadata grant no authority;
- [x] Alpha 3 grants are single-use;
- [x] standalone scope binds tenant, run, agent and policy;
- [x] coordinated scope additionally binds Mesh, Objective, Work, peer,
      instance, epoch, fencing token, authority and lease;
- [x] coordinated scope uses Mesh-compatible `workItemId` and string
      `fencingToken` without semantic conversion;
- [x] authority resolution uses one exact construction-bound request/result
      contract and rejects missing, malformed, rollback or stale responses;
- [x] grant action namespace, tool, operation, binding identity/version,
      handler digest and mandatory input digest are immutable;
- [x] no-argument actions bind the canonical empty object `{}`;
- [x] grants bind one accepted current pre-tool assessment request and result;
- [x] issue and expiry use trusted local time and an exclusive deadline;
- [x] grant and idempotency IDs have exact duplicate/conflict behavior;
- [x] current policy and authority are revalidated at consumption;
- [x] Objective cancellation/revision, Work terminality, lease expiry, newer
      epoch or different fence rejects consumption;
- [x] live and unexpired grant security state is not evicted;
- [x] ledger saturation blocks new grants rather than weakening validation.

## Action Gateway

- [x] reservation is the atomic local single-use point and occurs before
      handler invocation;
- [x] gateway input is closed to grant ID, bounded JSON object and trusted time;
- [x] action, handler, assessment and resolver cannot be caller-supplied;
- [x] synchronous ledger reservation binds reservation, dispatch-attempt,
      gateway and authority-generation IDs before any await;
- [x] post-reservation checks require the exact reserved record/generation,
      never the earlier issued state;
- [x] construction-bound dispatcher/context resolver supplies derived tenant,
      run/tool context and ephemeral credentials without metadata authority;
- [x] context-resolver and action-dispatch request/result/error/timeout shapes
      are closed and digest-correlated;
- [x] concurrent reservations allow at most one dispatch attempt;
- [x] missing, expired, consumed, mismatched or stale grants invoke no handler;
- [x] mutated action or input fails before handler invocation;
- [x] explicit pre-effect rejection becomes failed;
- [x] timeout or ambiguous error after dispatch begins becomes indeterminate;
- [x] indeterminate outcomes are not retried automatically;
- [x] restoring a reserved grant yields indeterminate, never issued;
- [x] idempotency is scoped by `(scopeDigest, idempotencyKey)`, exact replay
      returns retained state and changed action conflicts;
- [x] downstream retry requires an explicit idempotency or fencing contract and
      the same key;
- [x] local single-use is documented as at-most-one dispatch attempt, not
      exactly-once external effect;
- [x] a grant-ledger commit failure blocks dispatch;
- [x] telemetry failure cannot reverse or authorize a dispatch;
- [x] wrappers protect only calls that pass through their exact boundary.
- [x] strong no-stale external-effect claims require atomic downstream fence
      validation; otherwise evidence claims only local dispatch authorization;

## Outbound Message Gateway

- [x] channel, recipient, content, scope and message digest are closed/bounded;
- [x] message attempts bind dispatcher identity/version/digest, idempotency key,
      reservation, owner, attempt, authority generation and fence;
- [x] message-dispatch request/result/error/timeout shapes are closed and
      attempt-correlated;
- [x] one exact current single-use pre-message assessment is consumed;
- [x] reservation occurs synchronously before the dispatcher can start;
- [x] deny, expiry, cancellation, stale authority or mismatch produces zero
      dispatcher calls;
- [x] ambiguous send becomes indeterminate and is not retried automatically;
- [x] equal scoped replay returns retained state, changed content conflicts and
      restore maps reserved to indeterminate;
- [x] direct dispatcher access is documented outside the opt-in boundary;

## Security and privacy

- [x] invalid or oversized input cannot reach a reducer;
- [x] tenant and scope isolation fail before mutation;
- [x] no stale assignment authorizes output release or an action;
- [x] raw prompts, context, output, arguments, credentials, full grants and
      private reasoning are absent from diagnostics;
- [x] strict restorable snapshots are classified as sensitive, never emitted to
      telemetry and disabled from persistence by default;
- [x] redacted support projections cannot restore state or authority;
- [x] low-entropy sensitive values are omitted or use a tenant-keyed
      correlation digest;
- [x] exact reason codes stay local and external receipts are coarsened;
- [x] diagnostic queues and bytes are bounded;
- [x] sink failure does not change a decision;
- [x] strict restore rejects unknown fields, forged digests, missing relations,
      invalid counts and impossible transitions;
- [x] strict restore exactly rebinds every capability, assessor, transformer,
      action dispatcher/context resolver, authority resolver and message
      dispatcher identity/version/digest or fails closed;
- [x] capability registry register/resolve/rebind operations accept only exact
      descriptor and wrapper-instance identity/digest;
- [x] state required for authority, idempotency or terminal fencing is never
      silently pruned;
- [x] no documentation claims universal safety, truth, remote cancellation or
      exactly-once effects.

## Deterministic scenarios

- [x] hostile peer content remains data and cannot rewrite policy or grants;
- [x] missing tool interception denies before provider invocation;
- [x] buffered unsafe output produces zero released bytes and zero dispatches;
- [x] incremental control releases only accepted prefixes and stops future
      release after denial;
- [x] assessment reuse across a changed binding fails closed;
- [x] continuation budgets terminate deterministically;
- [x] a grant from a stale epoch/fence produces zero downstream dispatches;
- [x] action or argument substitution fails closed;
- [x] no-argument actions require the canonical empty-input digest;
- [x] concurrent grant use produces at most one dispatch attempt;
- [x] a restored reserved grant is indeterminate and cannot dispatch;
- [x] identical scoped idempotency replay does not redispatch and changed action
      conflicts;
- [x] authority advance during dispatch is rejected by a fencing-aware
      downstream and evidence is weaker when no such adapter exists;
- [x] ambiguous downstream timeout becomes indeterminate without auto-retry;
- [x] logical-time rollback mutates no security state;
- [x] unsolicited, wrong-assessor and stale-generation results produce no
      protected effect;
- [x] untrusted context renders only as a user-data envelope;
- [x] UTF-8 chunk boundaries, sequence conflicts and completion mismatch fail
      closed without duplicate release;
- [x] controlled SSE rejects malformed/post-terminal events and EOF without one
      exact terminal event;
- [x] denied, stale or replayed outbound messages produce zero send calls;
- [x] strict snapshot content never reaches telemetry and redacted evidence
      cannot restore authority;
- [x] cancellation fences late chunks, assessments and grants;
- [x] capacity saturation preserves current security state;
- [x] quiescent uninterrupted and snapshot/restored runs produce identical
      projections, effects and digests;
- [x] in-flight reserved grants/messages restore as indeterminate and never
      dispatch/send again;
- [x] changed or missing construction dependencies reject strict restore;
- [x] telemetry failure changes no decision and leaks no content;
- [x] existing package and Alpha 2 behavior remains unchanged;
- [x] identical scenario inputs reproduce the same configuration and trace
      digests;
- [x] one controlled change reports the first replay divergence;
- [x] every scenario terminates within event, queue, time and internal-step
      bounds.

## Public candidate gates

- [x] all 29 cataloged manifests use fixed version `0.3.0-alpha.3`;
- [x] frozen install and lockfile verification pass;
- [x] public source, generated output and exact tarball audits pass;
- [x] build and public TypeScript checks pass;
- [x] unit, adapter, compatibility and security tests pass;
- [x] deterministic Alpha 3 and unchanged Mesh scenarios pass;
- [x] every tarball passes content audit and isolated export import;
- [x] inference-control tarball consumer imports root, model, runtime, tools and
      messages entrypoints;
- [x] packed types and runtime fixtures exercise controlled-event SSE
      encode/decode interoperability;
- [x] packed TypeScript declarations compile with library checking enabled;
- [x] dedicated packed inference-control consumer passes;
- [x] unchanged aggregate functional tarball consumer passes;
- [x] external terminology gate passes with its required non-empty private
      denylist;
- [x] independent review reports zero unresolved P0/P1 findings.

### Candidate evidence

- `pnpm install --frozen-lockfile && pnpm check` passed from the candidate
  worktree: public audit, clean build, public type checks, 408 unit test cases
  (412 including nested subtests, with six declared TODOs), adapter suites, 28
  bounded inference-control scenarios, 29-package release verification and the
  tarball gate;
- a second `audit:public` and `verify:pack` run with a required non-empty
  external denylist passed, audited all 29 tarballs, imported 37 exports,
  compiled packed declarations and executed the dedicated inference-control,
  unchanged aggregate and Mesh recovery consumers;
- independent architecture, security/adversarial-scenario and
  release/compatibility reaudits each reported zero unresolved P0/P1 findings.

## Release-environment gates

- [x] use a repository-scoped npm publisher credential or Trusted Publishing
      workflow;
- [ ] run from the reviewed commit on a clean `main` checkout;
- [x] repository never contains a publishable 29-package Alpha 2 set;
- [x] a tested shared sentinel requires root plus exactly 29 manifests at Alpha
      3 before release verify, dry-run, registry read or publish;
- [ ] record current `next` rollback targets for all 29 packages;
- [ ] complete the no-mutation publish dry-run with `NPM_DIST_TAG=next`;
- [ ] confirm the candidate is absent or registry-equivalent for every package;
- [ ] publish missing packages under the commit-specific staging tag;
- [ ] verify registry SHA-512 metadata against every local tarball;
- [ ] promote the complete coordinated package set to `next`;
- [ ] remove candidate staging tags only after complete promotion;
- [ ] install exact versions in an independent clean registry consumer;
- [ ] execute the exact-version inference-control registry scenario;
- [ ] create and push `v0.3.0-alpha.3` at the verified release commit;
- [ ] record workflow URL, commit, publication time, rollback targets and
      registry integrity ledger.

## Definition of accepted

Alpha 3 is accepted only when every applicable item above is checked and linked
to reproducible evidence. A failed enforcement or authorization invariant
blocks release. A provider lacking a required control capability is expected to
fail closed; availability is never restored by weakening the policy.
