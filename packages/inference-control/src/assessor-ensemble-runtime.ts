import {
  HETEROGENEOUS_ASSESSOR_ENSEMBLE_STATE_FORMAT_V1,
  type AssessorEnsembleMonotonicAnchorV1,
  type AssessorEnsembleOperationGateRequestV1,
  type AssessorEnsembleOperationGateResultV1,
  type AssessorEnsemblePortV1,
  type AssessorEnsembleRequestV1,
  type AssessorEnsembleStateStoreV1,
  type AssessorEnsembleStateV1,
  type AssessorEnsembleVerdictV1,
  type AssessorEnsembleVoteV1,
  type AssessorEnsembleMemberDescriptorV1,
  type AssessorEnsemblePolicyV1,
} from "./assessor-ensemble-contracts.js";
import {
  assertAssessorEnsembleMemberDescriptorV1,
  assertAssessorEnsemblePolicyV1,
  assertAssessorEnsembleVoteV1,
  createAssessorEnsembleRequestV1,
  createAssessorEnsembleVerdictV1,
  digestAssessorEnsembleStateV1,
  digestAssessorEnsembleV1,
} from "./assessor-ensemble-validation.js";

export const ASSESSOR_ENSEMBLE_LIMITS_V1 = Object.freeze({
  maximumReasonCodes: 32,
  maximumEvidenceDigests: 32,
  maximumMembers: 256,
});
const keyFor = (bindingDigest: string) => `assessor-ensemble:${bindingDigest}`;
export class InMemoryAssessorEnsembleStateStoreV1
  implements AssessorEnsembleStateStoreV1, AssessorEnsembleMonotonicAnchorV1
{
  private readonly records = new Map<string, AssessorEnsembleStateV1>();
  private readonly anchors = new Map<
    string,
    { revision: number; logicalTimeHighWaterMs: number; stepHighWater: number }
  >();
  async read(key: string) {
    return this.records.get(key) ?? null;
  }
  async readAnchor(key: string) {
    return this.anchors.get(key) ?? null;
  }
  async compareAndSet(input: {
    stateKey: string;
    expectedRevision: number | null;
    expectedStateDigest: string | null;
    next: AssessorEnsembleStateV1;
  }): Promise<boolean> {
    const prior = this.records.get(input.stateKey) ?? null;
    if (
      (prior?.revision ?? null) !== input.expectedRevision ||
      (prior?.stateDigest ?? null) !== input.expectedStateDigest
    )
      return false;
    this.records.set(input.stateKey, input.next);
    this.anchors.set(input.stateKey, {
      revision: input.next.revision,
      logicalTimeHighWaterMs: input.next.logicalTimeHighWaterMs,
      stepHighWater: input.next.stepHighWater,
    });
    return true;
  }
}
export interface HeterogeneousAssessorEnsembleRuntimeOptionsV1 {
  readonly bindingDigest: string;
  readonly policy: AssessorEnsemblePolicyV1;
  readonly members: readonly AssessorEnsemblePortV1[];
  readonly store?: AssessorEnsembleStateStoreV1;
  readonly monotonicAnchor?: AssessorEnsembleMonotonicAnchorV1;
}
type Prepared = {
  state: AssessorEnsembleStateV1;
  request: AssessorEnsembleRequestV1;
};
export class HeterogeneousAssessorEnsembleRuntimeV1 {
  readonly store: AssessorEnsembleStateStoreV1;
  readonly anchor: AssessorEnsembleMonotonicAnchorV1;
  readonly memberSetDigest: string;
  constructor(readonly options: HeterogeneousAssessorEnsembleRuntimeOptionsV1) {
    if (!/^sha256:[0-9a-f]{64}$/.test(options.bindingDigest))
      throw new TypeError("bindingDigest_must_be_digest");
    assertAssessorEnsemblePolicyV1(options.policy);
    if (
      !options.members.length ||
      options.members.length >
        Math.min(
          options.policy.maximumMembers,
          ASSESSOR_ENSEMBLE_LIMITS_V1.maximumMembers,
        )
    )
      throw new RangeError("invalid_ensemble_member_count");
    const ids = new Set<string>();
    for (const member of options.members) {
      assertAssessorEnsembleMemberDescriptorV1(member.descriptor);
      if (ids.has(member.descriptor.assessorId))
        throw new TypeError("duplicate_assessor_id");
      ids.add(member.descriptor.assessorId);
    }
    this.memberSetDigest = digestAssessorEnsembleV1(
      "member-set",
      options.members.map((m) => m.descriptor.descriptorDigest).sort(),
    );
    this.store = options.store ?? new InMemoryAssessorEnsembleStateStoreV1();
    this.anchor =
      options.monotonicAnchor ??
      (this.store as unknown as AssessorEnsembleMonotonicAnchorV1);
    if (typeof this.anchor.readAnchor !== "function")
      throw new TypeError("external_monotonic_anchor_required");
  }
  get bindingDigest(): string {
    return this.options.bindingDigest;
  }
  get policyDigest(): string {
    return this.options.policy.policyDigest;
  }
  async verifyVerdict(input: {
    readonly requestDigest: string;
    readonly verdictDigest: string;
  }): Promise<boolean> {
    const stateKey = keyFor(this.options.bindingDigest);
    const state = await this.store.read(stateKey);
    await this.assertState(state, stateKey);
    return Boolean(
      state?.lastInvocation?.requestDigest === input.requestDigest &&
      state.lastInvocation.verdict.requestDigest === input.requestDigest &&
      state.lastInvocation.verdict.verdictDigest === input.verdictDigest,
    );
  }
  async assess(
    input: Omit<
      AssessorEnsembleRequestV1,
      "schemaVersion" | "policyDigest" | "bindingDigest" | "requestDigest"
    >,
  ): Promise<{
    verdict: AssessorEnsembleVerdictV1;
    state: AssessorEnsembleStateV1;
  }> {
    const request = createAssessorEnsembleRequestV1({
      ...input,
      schemaVersion: 1,
      bindingDigest: this.options.bindingDigest,
      policyDigest: this.options.policy.policyDigest,
    });
    const prepared = await this.prepare(request);
    if ("verdict" in prepared) return prepared;
    const votes = await Promise.all(
      this.eligibleMembers(request).map((member) => this.ask(member, request)),
    );
    const verdict = this.decide(request, votes);
    return { verdict, state: await this.finish(prepared, verdict) };
  }
  async gateOperation(
    input: AssessorEnsembleOperationGateRequestV1,
  ): Promise<AssessorEnsembleOperationGateResultV1> {
    if (input.bindingDigest !== this.options.bindingDigest)
      throw new TypeError("operation_binding_mismatch");
    const { verdict, state } = await this.assess({
      invocationId: input.invocationId,
      signalDigest: input.signalDigest,
      executionDomain: input.kind,
      surface: input.kind,
      modalities: input.modalities,
      step: input.step,
      logicalTimeMs: input.logicalTimeMs,
    });
    return { allowed: verdict.decision === "allow", verdict, state };
  }
  private async prepare(
    request: AssessorEnsembleRequestV1,
  ): Promise<
    | Prepared
    | { verdict: AssessorEnsembleVerdictV1; state: AssessorEnsembleStateV1 }
  > {
    const stateKey = keyFor(this.options.bindingDigest);
    for (
      let attempt = 0;
      attempt < this.options.policy.maximumCasAttempts;
      attempt++
    ) {
      const current = await this.store.read(stateKey);
      await this.assertState(current, stateKey);
      if (current?.lastInvocation?.requestDigest === request.requestDigest)
        return { verdict: current.lastInvocation.verdict, state: current };
      if (current?.activeInvocation) {
        if (current.activeInvocation.requestDigest === request.requestDigest)
          return { state: current, request };
        return {
          verdict: this.unresolved(
            request,
            [],
            this.options.members.map((m) => m.descriptor.assessorId),
          ),
          state: current,
        };
      }
      if (
        request.step > this.options.policy.maximumStep ||
        request.logicalTimeMs > this.options.policy.maximumLogicalTimeMs ||
        (current &&
          (request.step <= current.stepHighWater ||
            request.logicalTimeMs <= current.logicalTimeHighWaterMs))
      )
        throw new RangeError("assessor_ensemble_replay_or_bound_rejected");
      const revision = (current?.revision ?? 0) + 1;
      const unsigned = {
        format: HETEROGENEOUS_ASSESSOR_ENSEMBLE_STATE_FORMAT_V1,
        schemaVersion: 1 as const,
        stateKey,
        bindingDigest: this.options.bindingDigest,
        policyDigest: this.options.policy.policyDigest,
        memberSetDigest: this.memberSetDigest,
        revision,
        logicalTimeHighWaterMs: Math.max(
          current?.logicalTimeHighWaterMs ?? 0,
          request.logicalTimeMs,
        ),
        stepHighWater: Math.max(current?.stepHighWater ?? 0, request.step),
        activeInvocation: {
          invocationId: request.invocationId,
          requestDigest: request.requestDigest,
          step: request.step,
          executionDomain: request.executionDomain,
          logicalTimeMs: request.logicalTimeMs,
        },
        lastInvocation: current?.lastInvocation ?? null,
      };
      const next = {
        ...unsigned,
        stateDigest: digestAssessorEnsembleStateV1(unsigned),
      } as AssessorEnsembleStateV1;
      if (
        await this.store.compareAndSet({
          stateKey,
          expectedRevision: current?.revision ?? null,
          expectedStateDigest: current?.stateDigest ?? null,
          next,
        })
      )
        return { state: next, request };
    }
    throw new Error("assessor_ensemble_cas_exhausted");
  }
  private async finish(
    prepared: Prepared,
    verdict: AssessorEnsembleVerdictV1,
  ): Promise<AssessorEnsembleStateV1> {
    const { state, request } = prepared;
    const unsigned = {
      ...state,
      revision: state.revision + 1,
      activeInvocation: null,
      lastInvocation: {
        invocationId: request.invocationId,
        requestDigest: request.requestDigest,
        step: request.step,
        executionDomain: request.executionDomain,
        verdict,
      },
    };
    const { stateDigest: _ignored, ...withoutDigest } = unsigned;
    const next = {
      ...withoutDigest,
      stateDigest: digestAssessorEnsembleStateV1(withoutDigest),
    } as AssessorEnsembleStateV1;
    if (
      !(await this.store.compareAndSet({
        stateKey: state.stateKey,
        expectedRevision: state.revision,
        expectedStateDigest: state.stateDigest,
        next,
      }))
    ) {
      const settled = await this.store.read(state.stateKey);
      await this.assertState(settled, state.stateKey);
      if (
        settled?.lastInvocation?.requestDigest === request.requestDigest &&
        settled.lastInvocation.verdict.verdictDigest === verdict.verdictDigest
      )
        return settled;
      throw new Error("assessor_ensemble_finish_conflict");
    }
    return next;
  }
  private async ask(
    member: AssessorEnsemblePortV1,
    request: AssessorEnsembleRequestV1,
  ): Promise<AssessorEnsembleVoteV1 | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("assessor_timeout")),
          this.options.policy.assessorTimeoutMs,
        );
      });
      const vote = await Promise.race([
        Promise.resolve(member.assess(request)),
        timeout,
      ]);
      assertAssessorEnsembleVoteV1(vote);
      const d = member.descriptor;
      if (
        vote.requestDigest !== request.requestDigest ||
        vote.assessorId !== d.assessorId ||
        vote.assessorVersion !== d.assessorVersion ||
        vote.assessorImplementationDigest !== d.assessorImplementationDigest ||
        vote.independenceGroup !== d.independenceGroup
      )
        return null;
      return vote;
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  private decide(
    request: AssessorEnsembleRequestV1,
    raw: readonly (AssessorEnsembleVoteV1 | null)[],
  ): AssessorEnsembleVerdictV1 {
    const votes = raw
      .filter((value): value is AssessorEnsembleVoteV1 => value !== null)
      .sort((a, b) => a.assessorId.localeCompare(b.assessorId));
    const covering = this.eligibleMembers(request);
    const missing = covering
      .map((m) => m.descriptor.assessorId)
      .filter((id) => !votes.some((vote) => vote.assessorId === id))
      .sort();
    const coverageComplete =
      this.options.policy.requiredSurfaces.every(
        (surface) =>
          new Set(
            this.options.members
              .filter((member) => member.descriptor.surfaces.includes(surface))
              .map((member) => member.descriptor.independenceGroup),
          ).size >= this.options.policy.minimumIndependenceGroups,
      ) &&
      this.options.policy.requiredModalities.every(
        (modality) =>
          new Set(
            this.options.members
              .filter((member) =>
                member.descriptor.modalities.includes(modality),
              )
              .map((member) => member.descriptor.independenceGroup),
          ).size >= this.options.policy.minimumIndependenceGroups,
      ) &&
      covering.length > 0;
    const byGroup = new Map<string, AssessorEnsembleVoteV1[]>();
    for (const vote of votes) {
      const group = byGroup.get(vote.independenceGroup) ?? [];
      group.push(vote);
      byGroup.set(vote.independenceGroup, group);
    }
    const chosen = new Map<string, AssessorEnsembleVoteV1>();
    let groupConflict = false;
    for (const [group, groupVotes] of byGroup) {
      const decisions = new Set(groupVotes.map((vote) => vote.decision));
      if (decisions.size !== 1 || decisions.has("unresolved")) {
        groupConflict = true;
        continue;
      }
      const first = [...groupVotes].sort((a, b) =>
        a.assessorId.localeCompare(b.assessorId),
      )[0];
      if (first) chosen.set(group, first);
    }
    const counted = [...chosen.values()].sort((a, b) =>
      a.assessorId.localeCompare(b.assessorId),
    );
    const hasQuorum =
      coverageComplete &&
      counted.length >= this.options.policy.minimumVotes &&
      chosen.size >= this.options.policy.minimumIndependenceGroups;
    const decisions = new Set(counted.map((vote) => vote.decision));
    const decision =
      groupConflict || !hasQuorum || decisions.size !== 1
        ? "unresolved"
        : (counted[0]?.decision ?? "unresolved");
    return createAssessorEnsembleVerdictV1({
      schemaVersion: 1,
      requestDigest: request.requestDigest,
      decision,
      votes,
      countedAssessorIds: counted.map((vote) => vote.assessorId),
      countedIndependenceGroups: [...chosen.keys()].sort(),
      missingAssessorIds: missing,
      coverageComplete,
    });
  }
  private unresolved(
    request: AssessorEnsembleRequestV1,
    votes: readonly AssessorEnsembleVoteV1[],
    missing: readonly string[],
  ): AssessorEnsembleVerdictV1 {
    return createAssessorEnsembleVerdictV1({
      schemaVersion: 1,
      requestDigest: request.requestDigest,
      decision: "unresolved",
      votes,
      countedAssessorIds: [],
      countedIndependenceGroups: [],
      missingAssessorIds: [...missing].sort(),
      coverageComplete: false,
    });
  }
  private eligibleMembers(
    request: AssessorEnsembleRequestV1,
  ): readonly AssessorEnsemblePortV1[] {
    return this.options.members.filter(
      (member) =>
        member.descriptor.surfaces.includes(request.surface) &&
        request.modalities.every((modality) =>
          member.descriptor.modalities.includes(modality),
        ),
    );
  }
  private async assertState(
    state: AssessorEnsembleStateV1 | null,
    key: string,
  ): Promise<void> {
    if (!state) return;
    const { stateDigest, ...unsigned } = state;
    if (
      state.format !== HETEROGENEOUS_ASSESSOR_ENSEMBLE_STATE_FORMAT_V1 ||
      state.stateKey !== key ||
      state.bindingDigest !== this.options.bindingDigest ||
      state.policyDigest !== this.options.policy.policyDigest ||
      state.memberSetDigest !== this.memberSetDigest ||
      stateDigest !== digestAssessorEnsembleStateV1(unsigned)
    )
      throw new TypeError("assessor_ensemble_state_invalid");
    const anchor = await this.anchor.readAnchor(key);
    if (
      anchor &&
      (state.revision < anchor.revision ||
        state.logicalTimeHighWaterMs < anchor.logicalTimeHighWaterMs ||
        state.stepHighWater < anchor.stepHighWater)
    )
      throw new TypeError("assessor_ensemble_rollback_detected");
  }
}
