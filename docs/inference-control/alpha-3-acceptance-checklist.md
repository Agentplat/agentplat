# Inference Control `0.3.0-alpha.3` acceptance checklist

Status: design freeze accepted. Implementation and release evidence are
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

- [ ] `@agentplat/inference-control` is cataloged, provider-neutral and opt-in;
- [ ] package import performs no network I/O, migration, registration or
      telemetry;
- [ ] root export is browser-safe;
- [ ] adapter subpaths depend only on public AgentPlat contracts;
- [ ] model/runtime integrations use explicit stronger request contracts and do
      not claim to implement existing interfaces that lose zones/provenance;
- [ ] tool protection uses explicit `ActionGateway.invoke`; helpers do not
      return a transparently authorized `ToolHandler`;
- [ ] outbound-message protection uses an explicit gateway and does not claim
      interception of direct dispatcher calls;
- [ ] no vendor SDK is reachable from the new package;
- [ ] existing package versions remain coordinated;
- [ ] Runtime, Model, Tools and Streaming root contracts are unchanged;
- [ ] `AgentStreamEvent` remains unchanged and controlled events use a new
      union;
- [ ] controlled events satisfy `StreamEvent<string, JsonObject>` and compile
      through `AgentSseEnvelope<ControlledAgentRunEventV1>` without changing
      the default SSE generic;
- [ ] the public controlled-event validator rejects unknown/extra/malformed,
      noncontiguous, cross-run and post-terminal SSE events before delivery;
- [ ] the controlled SSE consumer calls validator `finish()` and rejects EOF
      without exactly one terminal event;
- [ ] Sessions fixed orchestration defaults remain unchanged;
- [ ] Rooms governance and persistence behavior remain unchanged;
- [ ] Framework has no dependency on or re-export of the alpha package;
- [ ] Agent Mesh Alpha 1 and Alpha 2 fixtures, reducers and scenarios remain
      green;
- [ ] unwrapped providers, adapters, runtimes and handlers behave exactly as
      before.

## Context zones and provenance

- [ ] zone schema is closed and rejects unknown values;
- [ ] only policy, accepted Objective and configured local-trusted content can
      supply instructions;
- [ ] user, peer, tool, retrieval and provider content remain untrusted data;
- [ ] assessor-produced revisions re-enter as `assessor_untrusted` data;
- [ ] signatures and repetition cannot promote a zone;
- [ ] provenance is immutable and bound to the exact content digest;
- [ ] promotion creates a new entry and preserves its source;
- [ ] only an authorized versioned local transformer can promote content;
- [ ] no transformer can create policy or Objective authority;
- [ ] context counts and encoded bytes are checked before mutation;
- [ ] security-relevant entries are not evicted to admit new work;
- [ ] duplicate entries are idempotent and conflicting ID reuse fails closed;
- [ ] snapshot restore recomputes indexes, counts, digests and relations.
- [ ] the normative renderer maps untrusted zones only to a canonical user-data
      envelope and never to system/developer roles;

## Policy and capabilities

- [ ] policies are immutable, versioned and locally bounded;
- [ ] a remote Objective can narrow but never expand local policy;
- [ ] control capabilities are separate from model feature capabilities;
- [ ] capability negotiation is pure and deterministic;
- [ ] pre-run enforcement requires full input inspection;
- [ ] final output enforcement requires a final assessment boundary;
- [ ] incremental release requires incremental assessment and effective local
      release interruption;
- [ ] application-only tool interception is not described as complete;
- [ ] provider-native tool enforcement fails before provider invocation when
      interception is unavailable;
- [ ] representation access is optional and never inferred from text access;
- [ ] capability descriptors are validated, instance-bound and assurance-rated;
- [ ] high-risk policies reject unverified capability descriptors;
- [ ] allowed capabilities are policy-bound by exact wrapper/descriptor
      identity, version, digest and assurance;
- [ ] final and incremental assessment capabilities negotiate independently;
- [ ] every policy with allowed actions requires a pre-tool assessor binding,
      independent of output risk;
- [ ] observe mode reports observation, not enforcement;
- [ ] missing required capabilities fail closed with stable reasons.

## Assessments and continuations

- [ ] checkpoints are closed to pre-run, stream, post-run, pre-tool and
      pre-message;
- [ ] dispositions are closed to allow, revise, retry, challenge, abstain,
      escalate and deny;
- [ ] the reducer retains a pending request before invoking an assessor;
- [ ] assessments bind request ID/generation, assessor identity/version, policy,
      checkpoint, run, target, zone and provenance;
- [ ] coordinated assessments also bind Objective/Work revisions, epoch and
      fencing token;
- [ ] assessment uncertainty is a bounded integer value;
- [ ] assessment evidence references and encoded bytes are bounded;
- [ ] expired assessments cannot release output or issue grants;
- [ ] an assessment cannot be reused across a different digest, zone, policy,
      run, checkpoint or authority;
- [ ] duplicate assessments are idempotent and conflicting ID reuse fails
      closed;
- [ ] unsolicited, expired, wrong-assessor and stale-generation results create
      no release, grant or message permit;
- [ ] revise, retry and challenge each consume a finite explicit budget;
- [ ] exhausted budgets terminate with the configured fail-closed disposition;
- [ ] assessors are external drivers whose output is normalized before reducer
      invocation;
- [ ] the pure reducer performs no provider, storage, network, clock, randomness
      or telemetry operation.

## Output release

- [ ] off behavior requires no wrapper and changes no existing defaults;
- [ ] observe mode never withholds or claims enforcement;
- [ ] buffered mode releases no output or tool call before exact final allow;
- [ ] buffer overflow fails closed without partial release;
- [ ] high-risk output always uses buffered mode;
- [ ] incremental mode releases accepted causal prefixes in order;
- [ ] incremental denial prevents every future release;
- [ ] incremental diagnostics record exact released bytes without raw content;
- [ ] released output is never described as retractable;
- [ ] duplicated or reordered chunks do not advance the release head twice;
- [ ] stream assessments bind exact generation, sequence range, UTF-8 byte
      range and window digest;
- [ ] completed content equals observed token concatenation or fails closed and
      is never released twice;
- [ ] cancellation and terminal states fence late chunks and assessments;
- [ ] stream abort is described as local release interruption, not guaranteed
      remote-compute cancellation;
- [ ] controlled streams preserve SSE ordering, cancellation and exactly one
      terminal control outcome.

## Action Grants

- [ ] the gateway resolves grants from its local ledger by ID;
- [ ] caller-supplied grant documents and metadata grant no authority;
- [ ] Alpha 3 grants are single-use;
- [ ] standalone scope binds tenant, run, agent and policy;
- [ ] coordinated scope additionally binds Mesh, Objective, Work, peer,
      instance, epoch, fencing token, authority and lease;
- [ ] coordinated scope uses Mesh-compatible `workItemId` and string
      `fencingToken` without semantic conversion;
- [ ] authority resolution uses one exact construction-bound request/result
      contract and rejects missing, malformed, rollback or stale responses;
- [ ] grant action namespace, tool, operation, binding identity/version,
      handler digest and mandatory input digest are immutable;
- [ ] no-argument actions bind the canonical empty object `{}`;
- [ ] grants bind one accepted current pre-tool assessment request and result;
- [ ] issue and expiry use trusted local time and an exclusive deadline;
- [ ] grant and idempotency IDs have exact duplicate/conflict behavior;
- [ ] current policy and authority are revalidated at consumption;
- [ ] Objective cancellation/revision, Work terminality, lease expiry, newer
      epoch or different fence rejects consumption;
- [ ] live and unexpired grant security state is not evicted;
- [ ] ledger saturation blocks new grants rather than weakening validation.

## Action Gateway

- [ ] reservation is the atomic local single-use point and occurs before
      handler invocation;
- [ ] gateway input is closed to grant ID, bounded JSON object and trusted time;
- [ ] action, handler, assessment and resolver cannot be caller-supplied;
- [ ] synchronous ledger reservation binds reservation, dispatch-attempt,
      gateway and authority-generation IDs before any await;
- [ ] post-reservation checks require the exact reserved record/generation,
      never the earlier issued state;
- [ ] construction-bound dispatcher/context resolver supplies derived tenant,
      run/tool context and ephemeral credentials without metadata authority;
- [ ] context-resolver and action-dispatch request/result/error/timeout shapes
      are closed and digest-correlated;
- [ ] concurrent reservations allow at most one dispatch attempt;
- [ ] missing, expired, consumed, mismatched or stale grants invoke no handler;
- [ ] mutated action or input fails before handler invocation;
- [ ] explicit pre-effect rejection becomes failed;
- [ ] timeout or ambiguous error after dispatch begins becomes indeterminate;
- [ ] indeterminate outcomes are not retried automatically;
- [ ] restoring a reserved grant yields indeterminate, never issued;
- [ ] idempotency is scoped by `(scopeDigest, idempotencyKey)`, exact replay
      returns retained state and changed action conflicts;
- [ ] downstream retry requires an explicit idempotency or fencing contract and
      the same key;
- [ ] local single-use is documented as at-most-one dispatch attempt, not
      exactly-once external effect;
- [ ] a grant-ledger commit failure blocks dispatch;
- [ ] telemetry failure cannot reverse or authorize a dispatch;
- [ ] wrappers protect only calls that pass through their exact boundary.
- [ ] strong no-stale external-effect claims require atomic downstream fence
      validation; otherwise evidence claims only local dispatch authorization;

## Outbound Message Gateway

- [ ] channel, recipient, content, scope and message digest are closed/bounded;
- [ ] message attempts bind dispatcher identity/version/digest, idempotency key,
      reservation, owner, attempt, authority generation and fence;
- [ ] message-dispatch request/result/error/timeout shapes are closed and
      attempt-correlated;
- [ ] one exact current single-use pre-message assessment is consumed;
- [ ] reservation occurs synchronously before the dispatcher can start;
- [ ] deny, expiry, cancellation, stale authority or mismatch produces zero
      dispatcher calls;
- [ ] ambiguous send becomes indeterminate and is not retried automatically;
- [ ] equal scoped replay returns retained state, changed content conflicts and
      restore maps reserved to indeterminate;
- [ ] direct dispatcher access is documented outside the opt-in boundary;

## Security and privacy

- [ ] invalid or oversized input cannot reach a reducer;
- [ ] tenant and scope isolation fail before mutation;
- [ ] no stale assignment authorizes output release or an action;
- [ ] raw prompts, context, output, arguments, credentials, full grants and
      private reasoning are absent from diagnostics;
- [ ] strict restorable snapshots are classified as sensitive, never emitted to
      telemetry and disabled from persistence by default;
- [ ] redacted support projections cannot restore state or authority;
- [ ] low-entropy sensitive values are omitted or use a tenant-keyed
      correlation digest;
- [ ] exact reason codes stay local and external receipts are coarsened;
- [ ] diagnostic queues and bytes are bounded;
- [ ] sink failure does not change a decision;
- [ ] strict restore rejects unknown fields, forged digests, missing relations,
      invalid counts and impossible transitions;
- [ ] strict restore exactly rebinds every capability, assessor, transformer,
      action dispatcher/context resolver, authority resolver and message
      dispatcher identity/version/digest or fails closed;
- [ ] capability registry register/resolve/rebind operations accept only exact
      descriptor and wrapper-instance identity/digest;
- [ ] state required for authority, idempotency or terminal fencing is never
      silently pruned;
- [ ] no documentation claims universal safety, truth, remote cancellation or
      exactly-once effects.

## Deterministic scenarios

- [ ] hostile peer content remains data and cannot rewrite policy or grants;
- [ ] missing tool interception denies before provider invocation;
- [ ] buffered unsafe output produces zero released bytes and zero dispatches;
- [ ] incremental control releases only accepted prefixes and stops future
      release after denial;
- [ ] assessment reuse across a changed binding fails closed;
- [ ] continuation budgets terminate deterministically;
- [ ] a grant from a stale epoch/fence produces zero downstream dispatches;
- [ ] action or argument substitution fails closed;
- [ ] no-argument actions require the canonical empty-input digest;
- [ ] concurrent grant use produces at most one dispatch attempt;
- [ ] a restored reserved grant is indeterminate and cannot dispatch;
- [ ] identical scoped idempotency replay does not redispatch and changed action
      conflicts;
- [ ] authority advance during dispatch is rejected by a fencing-aware
      downstream and evidence is weaker when no such adapter exists;
- [ ] ambiguous downstream timeout becomes indeterminate without auto-retry;
- [ ] logical-time rollback mutates no security state;
- [ ] unsolicited, wrong-assessor and stale-generation results produce no
      protected effect;
- [ ] untrusted context renders only as a user-data envelope;
- [ ] UTF-8 chunk boundaries, sequence conflicts and completion mismatch fail
      closed without duplicate release;
- [ ] controlled SSE rejects malformed/post-terminal events and EOF without one
      exact terminal event;
- [ ] denied, stale or replayed outbound messages produce zero send calls;
- [ ] strict snapshot content never reaches telemetry and redacted evidence
      cannot restore authority;
- [ ] cancellation fences late chunks, assessments and grants;
- [ ] capacity saturation preserves current security state;
- [ ] quiescent uninterrupted and snapshot/restored runs produce identical
      projections, effects and digests;
- [ ] in-flight reserved grants/messages restore as indeterminate and never
      dispatch/send again;
- [ ] changed or missing construction dependencies reject strict restore;
- [ ] telemetry failure changes no decision and leaks no content;
- [ ] existing package and Alpha 2 behavior remains unchanged;
- [ ] identical scenario inputs reproduce the same configuration and trace
      digests;
- [ ] one controlled change reports the first replay divergence;
- [ ] every scenario terminates within event, queue, time and internal-step
      bounds.

## Public candidate gates

- [ ] all 29 cataloged manifests use fixed version `0.3.0-alpha.3`;
- [ ] frozen install and lockfile verification pass;
- [ ] public source, generated output and exact tarball audits pass;
- [ ] build and public TypeScript checks pass;
- [ ] unit, adapter, compatibility and security tests pass;
- [ ] deterministic Alpha 3 and unchanged Mesh scenarios pass;
- [ ] every tarball passes content audit and isolated export import;
- [ ] inference-control tarball consumer imports root, model, runtime, tools and
      messages entrypoints;
- [ ] packed types and runtime fixtures exercise controlled-event SSE
      encode/decode interoperability;
- [ ] packed TypeScript declarations compile with library checking enabled;
- [ ] dedicated packed inference-control consumer passes;
- [ ] unchanged aggregate functional tarball consumer passes;
- [ ] external terminology gate passes with its required non-empty private
      denylist;
- [ ] independent review reports zero unresolved P0/P1 findings.

## Release-environment gates

- [ ] use a repository-scoped npm publisher credential or Trusted Publishing
      workflow;
- [ ] run from the reviewed commit on a clean `main` checkout;
- [ ] repository never contains a publishable 29-package Alpha 2 set;
- [ ] a tested shared sentinel requires root plus exactly 29 manifests at Alpha
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
