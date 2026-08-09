import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import {
  COORDINATION_CONTROL_SCHEMA_VERSION_V1,
  COORDINATION_CONTROL_STATE_FORMAT_V1,
  type CoordinationControlActionV1,
  type CoordinationControlEvidenceV1,
  type CoordinationControlOutboxRecordV1,
  type CoordinationControlPortV1,
  type CoordinationControlProposalV1,
  type CoordinationControlRuntimeOptionsV1,
  type CoordinationControlSourceHeadV1,
  type CoordinationControlStateV1,
  type CoordinationControlStoreV1,
} from "./coordination-control-contracts.js";
import {
  coordinationControlStateDigestV1,
  createCoordinationControlProposalV1,
  validateCoordinationControlEvidenceV1,
  validateCoordinationControlPolicyV1,
  validateCoordinationControlStateV1,
} from "./coordination-control-validation.js";

/**
 * Deterministic feedback coordinator. This class only persists and delivers
 * bounded advisory proposals; responsibility for approving or executing them
 * remains with the receiving collective subsystem.
 */
export class CoordinationControlRuntimeV1 implements CoordinationControlPortV1 {
  readonly #options: CoordinationControlRuntimeOptionsV1;

  constructor(options: CoordinationControlRuntimeOptionsV1) {
    if (!options || !options.store || !options.evidenceResolution)
      throw new TypeError(
        "coordination control store and evidence resolution are required",
      );
    if (!options.stateKey || !options.coordinationId)
      throw new TypeError("coordination control identity is required");
    this.#options = {
      ...options,
      policy: validateCoordinationControlPolicyV1(options.policy),
    };
    if (
      typeof this.#options.evidenceResolution.registryId !== "string" ||
      !Number.isSafeInteger(this.#options.evidenceResolution.registryVersion) ||
      this.#options.evidenceResolution.registryVersion < 1 ||
      typeof this.#options.evidenceResolution.resolve !== "function"
    )
      throw new TypeError(
        "coordination control evidence resolution port is invalid",
      );
    if (
      this.#options.evidenceResolution.registryDigest !==
      this.#options.policy.sourceRegistryDigest
    )
      throw new TypeError(
        "coordination control evidence registry binding changed",
      );
  }

  async evaluate(input: {
    readonly logicalTimeMs: number;
    readonly evidence: readonly CoordinationControlEvidenceV1[];
  }): Promise<CoordinationControlProposalV1> {
    logicalTime(input.logicalTimeMs);
    for (
      let attempt = 0;
      attempt < this.#options.policy.limits.maximumCommitAttempts;
      attempt += 1
    ) {
      const existing = await this.#load();
      const state = existing ?? this.#initialState();
      this.#assertStateBinding(state);
      if (input.logicalTimeMs < state.logicalTimeHighWaterMs)
        throw new TypeError("coordination control logical time rollback");
      const analysis = await this.#analyse(
        input.evidence,
        input.logicalTimeMs,
        state,
      );
      const proposal = createCoordinationControlProposalV1({
        schemaVersion: COORDINATION_CONTROL_SCHEMA_VERSION_V1,
        proposalId: `${this.#options.coordinationId}.proposal.${state.revision + 1}`,
        scope: analysis.scope,
        action: this.#stabilize(
          analysis.action,
          analysis.recovered,
          state,
          input.logicalTimeMs,
        ),
        reasonCodes: analysis.reasons,
        evidenceDigests: analysis.evidenceDigests,
        evaluatedAtLogicalMs: input.logicalTimeMs,
        expiresAtLogicalMs:
          input.logicalTimeMs +
          this.#options.policy.limits.maximumProposalTtlMs,
        advisoryOnly: true,
      });
      const pending = state.outbox.filter(
        (entry) => entry.status === "pending",
      );
      if (pending.length >= this.#options.policy.limits.maximumOutboxRecords)
        throw new Error(
          "coordination control pending outbox capacity exhausted",
        );
      const deliveredCapacity =
        this.#options.policy.limits.maximumOutboxRecords - pending.length - 1;
      const settled =
        deliveredCapacity === 0
          ? []
          : state.outbox
              .filter((entry) => entry.status !== "pending")
              .slice(-deliveredCapacity);
      const retained = [
        ...settled,
        ...pending,
        { proposal, status: "pending" as const },
      ];
      const next = this.#state(state, {
        logicalTimeHighWaterMs: Math.max(
          state.logicalTimeHighWaterMs,
          input.logicalTimeMs,
        ),
        sourceHeads: analysis.sourceHeads,
        lastProposal: proposal,
        lastActionAtLogicalMs:
          state.lastProposal?.action === proposal.action
            ? state.lastActionAtLogicalMs
            : input.logicalTimeMs,
        outbox: retained,
      });
      if (
        await this.#save({
          state: next,
          expectedRevision: existing ? existing.revision : null,
          expectedStateDigest: existing ? existing.stateDigest : null,
        })
      )
        return proposal;
    }
    throw new Error(
      "coordination control state commit contention exceeded limit",
    );
  }

  /** Delivers at most one durable proposal. Proposal IDs are stable across a CAS retry. */
  async dispatchPending(
    logicalTimeMs: number,
  ): Promise<CoordinationControlProposalV1 | null> {
    logicalTime(logicalTimeMs);
    if (!this.#options.dispatch) return null;
    for (
      let attempt = 0;
      attempt < this.#options.policy.limits.maximumCommitAttempts;
      attempt += 1
    ) {
      const state = await this.#load();
      if (!state) return null;
      this.#assertStateBinding(state);
      if (logicalTimeMs < state.logicalTimeHighWaterMs)
        throw new TypeError("coordination control logical time rollback");
      const record = state.outbox.find((entry) => entry.status === "pending");
      if (!record) return null;
      if (record.proposal.expiresAtLogicalMs <= logicalTimeMs) {
        const outbox = state.outbox.map((entry) =>
          entry.proposal.proposalId === record.proposal.proposalId
            ? { ...entry, status: "expired" as const }
            : entry,
        );
        const next = this.#state(state, {
          logicalTimeHighWaterMs: Math.max(
            state.logicalTimeHighWaterMs,
            logicalTimeMs,
          ),
          outbox,
        });
        if (
          await this.#save({
            state: next,
            expectedRevision: state.revision,
            expectedStateDigest: state.stateDigest,
          })
        )
          return null;
        continue;
      }
      const delivered =
        (
          await this.#options.dispatch.dispatch({
            proposal: record.proposal,
          })
        ).status === "delivered";
      if (!delivered) return null;
      const outbox = state.outbox.map((entry) =>
        entry.proposal.proposalId === record.proposal.proposalId
          ? { ...entry, status: "delivered" as const }
          : entry,
      );
      const next = this.#state(state, {
        logicalTimeHighWaterMs: Math.max(
          state.logicalTimeHighWaterMs,
          logicalTimeMs,
        ),
        outbox,
      });
      if (
        await this.#save({
          state: next,
          expectedRevision: state.revision,
          expectedStateDigest: state.stateDigest,
        })
      )
        return record.proposal;
    }
    throw new Error(
      "coordination control delivery commit contention exceeded limit",
    );
  }

  async #analyse(
    rawEvidence: readonly CoordinationControlEvidenceV1[],
    now: number,
    state: CoordinationControlStateV1,
  ): Promise<{
    readonly action: CoordinationControlActionV1;
    readonly reasons: readonly string[];
    readonly evidenceDigests: readonly PlanningDigestV1[];
    readonly sourceHeads: readonly CoordinationControlSourceHeadV1[];
    readonly scope: CoordinationControlEvidenceV1["scope"];
    readonly healthy: boolean;
    readonly recovered: boolean;
  }> {
    const fallbackScope = state.lastProposal?.scope ?? {
      tenantId: "unknown",
      coordinationId: this.#options.coordinationId,
      missionIntentId: "unknown",
      teamId: null,
      workItemId: null,
    };
    const seen = new Map<string, CoordinationControlEvidenceV1>();
    const invalid: string[] = [];
    const decoded: CoordinationControlEvidenceV1[] = [];
    for (const raw of rawEvidence) {
      let evidence: CoordinationControlEvidenceV1;
      try {
        evidence = validateCoordinationControlEvidenceV1(raw);
      } catch {
        invalid.push("invalid_evidence");
        continue;
      }
      decoded.push(evidence);
    }
    for (const evidence of decoded.sort(
      (left, right) =>
        left.sourceId.localeCompare(right.sourceId) ||
        left.sourceRevision - right.sourceRevision ||
        left.evidenceDigest.localeCompare(right.evidenceDigest),
    )) {
      if (evidence.scope.coordinationId !== this.#options.coordinationId) {
        invalid.push("scope_mismatch");
        continue;
      }
      const binding = this.#options.policy.sourceBindings.find(
        (item) => item.sourceId === evidence.sourceId,
      );
      if (
        !binding ||
        binding.sourceVersion !== evidence.sourceVersion ||
        binding.sourceImplementationDigest !==
          evidence.sourceImplementationDigest
      ) {
        invalid.push("unbound_source");
        continue;
      }
      let resolved;
      try {
        resolved = await this.#options.evidenceResolution.resolve({ evidence });
      } catch {
        invalid.push("source_resolution_failed");
        continue;
      }
      if (
        resolved === null ||
        resolved.sourceId !== evidence.sourceId ||
        resolved.sourceVersion !== evidence.sourceVersion ||
        resolved.sourceImplementationDigest !==
          evidence.sourceImplementationDigest
      ) {
        invalid.push("source_authentication_failed");
        continue;
      }
      if (
        now < evidence.observedAtLogicalMs ||
        now >= evidence.expiresAtLogicalMs ||
        now - evidence.observedAtLogicalMs >
          this.#options.policy.freshnessWindowMs
      ) {
        invalid.push("stale_evidence");
        continue;
      }
      const prior = state.sourceHeads.find(
        (head) => head.sourceId === evidence.sourceId,
      );
      if (prior && evidence.sourceRevision < prior.sourceRevision) {
        invalid.push("source_rollback");
        continue;
      }
      if (
        prior &&
        evidence.sourceRevision === prior.sourceRevision &&
        (evidence.sourceRecordDigest !== prior.sourceRecordDigest ||
          evidence.evidenceDigest !== prior.evidenceDigest)
      ) {
        invalid.push("source_equivocation");
        continue;
      }
      const duplicate = seen.get(evidence.sourceId);
      if (
        duplicate &&
        (duplicate.sourceRecordDigest !== evidence.sourceRecordDigest ||
          duplicate.evidenceDigest !== evidence.evidenceDigest)
      ) {
        invalid.push("source_equivocation");
        continue;
      }
      seen.set(evidence.sourceId, evidence);
    }
    const evidence = [...seen.values()].sort((a, b) =>
      a.sourceId.localeCompare(b.sourceId),
    );
    const scope = evidence[0]?.scope ?? fallbackScope;
    if (
      invalid.length ||
      evidence.length < this.#options.policy.minimumEvidenceSources ||
      !sameScope(evidence, scope)
    ) {
      return {
        action: "pause_dispatch",
        reasons: Object.freeze(
          [
            ...new Set(invalid.length ? invalid : ["missing_fresh_evidence"]),
          ].sort(),
        ),
        evidenceDigests: Object.freeze(
          evidence.map((item) => item.evidenceDigest),
        ),
        sourceHeads: state.sourceHeads,
        scope,
        healthy: false,
        recovered: false,
      };
    }
    const aggregate = (
      key: keyof Pick<
        CoordinationControlEvidenceV1,
        | "roleAlignmentBps"
        | "roleCoherenceBps"
        | "contextIntegrityBps"
        | "contextUncertaintyBps"
        | "trustBps"
        | "capabilityBps"
        | "executionHealthBps"
        | "teamHealthBps"
        | "outcomeConfidenceBps"
      >,
    ) => Math.min(...evidence.map((item) => item[key] as number));
    const threshold = this.#options.policy.thresholds;
    const reasons: string[] = [];
    let action: CoordinationControlActionV1 = "continue";
    if (
      aggregate("contextIntegrityBps") < threshold.minimumContextIntegrityBps ||
      aggregate("contextUncertaintyBps") >
        threshold.maximumContextUncertaintyBps ||
      aggregate("outcomeConfidenceBps") < threshold.minimumOutcomeConfidenceBps
    ) {
      action = "request_replanning";
      reasons.push("context_or_outcome_degraded");
    } else if (
      aggregate("trustBps") < threshold.minimumTrustBps ||
      aggregate("capabilityBps") < threshold.minimumCapabilityBps
    ) {
      action = "restrict_participation";
      reasons.push("trust_or_capability_restricted");
    } else if (
      aggregate("roleAlignmentBps") < threshold.minimumRoleAlignmentBps ||
      aggregate("roleCoherenceBps") < threshold.minimumRoleCoherenceBps
    ) {
      action = "request_role_transition";
      reasons.push("role_alignment_degraded");
    } else if (
      aggregate("executionHealthBps") < threshold.minimumExecutionHealthBps
    ) {
      action = "request_work_reassignment";
      reasons.push("execution_health_degraded");
    } else if (aggregate("teamHealthBps") < threshold.minimumTeamHealthBps) {
      action = "request_team_adaptation";
      reasons.push("team_health_degraded");
    } else reasons.push("evidence_within_policy");
    const heads = new Map(
      state.sourceHeads.map((head) => [head.sourceId, head]),
    );
    for (const item of evidence)
      heads.set(item.sourceId, {
        sourceId: item.sourceId,
        sourceRevision: item.sourceRevision,
        sourceRecordDigest: item.sourceRecordDigest,
        evidenceDigest: item.evidenceDigest,
      });
    const sourceHeads = [...heads.values()].sort((a, b) =>
      a.sourceId.localeCompare(b.sourceId),
    );
    const hysteresis = this.#options.policy.hysteresisBps;
    const recovered =
      aggregate("roleAlignmentBps") >=
        threshold.minimumRoleAlignmentBps + hysteresis &&
      aggregate("roleCoherenceBps") >=
        threshold.minimumRoleCoherenceBps + hysteresis &&
      aggregate("contextIntegrityBps") >=
        threshold.minimumContextIntegrityBps + hysteresis &&
      aggregate("contextUncertaintyBps") <=
        threshold.maximumContextUncertaintyBps - hysteresis &&
      aggregate("trustBps") >= threshold.minimumTrustBps + hysteresis &&
      aggregate("capabilityBps") >=
        threshold.minimumCapabilityBps + hysteresis &&
      aggregate("executionHealthBps") >=
        threshold.minimumExecutionHealthBps + hysteresis &&
      aggregate("teamHealthBps") >=
        threshold.minimumTeamHealthBps + hysteresis &&
      aggregate("outcomeConfidenceBps") >=
        threshold.minimumOutcomeConfidenceBps + hysteresis;
    return {
      action,
      reasons: Object.freeze(reasons),
      evidenceDigests: Object.freeze(
        evidence.map((item) => item.evidenceDigest),
      ),
      sourceHeads: Object.freeze(sourceHeads),
      scope,
      healthy: action === "continue",
      recovered,
    };
  }

  #stabilize(
    action: CoordinationControlActionV1,
    recovered: boolean,
    state: CoordinationControlStateV1,
    now: number,
  ): CoordinationControlActionV1 {
    if (action === "pause_dispatch") return action;
    const prior = state.lastProposal;
    if (!prior || prior.action === action) return action;
    const lastAt = state.lastActionAtLogicalMs;
    if (lastAt !== null && now - lastAt < this.#options.policy.cooldownMs)
      return prior.action;
    if (prior.action !== "continue" && action === "continue" && !recovered)
      return prior.action;
    return action;
  }

  #initialState(): CoordinationControlStateV1 {
    const body = {
      format: COORDINATION_CONTROL_STATE_FORMAT_V1,
      schemaVersion: 1 as const,
      stateKey: this.#options.stateKey,
      coordinationId: this.#options.coordinationId,
      policyDigest: this.#options.policy.policyDigest,
      revision: 0,
      logicalTimeHighWaterMs: 0,
      sourceHeads: Object.freeze([]),
      lastProposal: null,
      lastActionAtLogicalMs: null,
      outbox: Object.freeze([]),
      predecessorStateDigest: null,
    };
    return Object.freeze({
      ...body,
      stateDigest: coordinationControlStateDigestV1(body),
    });
  }
  #state(
    previous: CoordinationControlStateV1,
    changes: Partial<
      Omit<
        CoordinationControlStateV1,
        | "format"
        | "schemaVersion"
        | "stateKey"
        | "coordinationId"
        | "policyDigest"
        | "revision"
        | "predecessorStateDigest"
        | "stateDigest"
      >
    >,
  ): CoordinationControlStateV1 {
    const body = {
      ...previous,
      ...changes,
      revision: previous.revision + 1,
      predecessorStateDigest: previous.stateDigest,
    };
    const { stateDigest: _stateDigest, ...unsigned } = body;
    return Object.freeze({
      ...unsigned,
      stateDigest: coordinationControlStateDigestV1(unsigned),
    });
  }
  #assertStateBinding(state: CoordinationControlStateV1): void {
    if (
      state.format !== COORDINATION_CONTROL_STATE_FORMAT_V1 ||
      state.schemaVersion !== 1 ||
      state.stateKey !== this.#options.stateKey ||
      state.coordinationId !== this.#options.coordinationId ||
      state.policyDigest !== this.#options.policy.policyDigest
    )
      throw new TypeError("coordination control state binding changed");
  }
  async #load(): Promise<CoordinationControlStateV1 | null> {
    const loaded = await this.#options.store.load(this.#options.stateKey);
    return loaded === null ? null : validateCoordinationControlStateV1(loaded);
  }
  async #save(input: {
    readonly state: CoordinationControlStateV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean> {
    return this.#options.store.save({
      ...input,
      state: validateCoordinationControlStateV1(input.state),
    });
  }
}

export class InMemoryCoordinationControlStoreV1 implements CoordinationControlStoreV1 {
  readonly #states = new Map<string, CoordinationControlStateV1>();
  async load(stateKey: string): Promise<CoordinationControlStateV1 | null> {
    const state = this.#states.get(stateKey);
    return state
      ? validateCoordinationControlStateV1(structuredClone(state))
      : null;
  }
  async save(input: {
    readonly state: CoordinationControlStateV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean> {
    const state = validateCoordinationControlStateV1(input.state);
    const existing = this.#states.get(state.stateKey);
    if (
      (input.expectedRevision === null &&
        (existing || input.expectedStateDigest !== null)) ||
      (input.expectedRevision !== null &&
        (!existing ||
          existing.revision !== input.expectedRevision ||
          existing.stateDigest !== input.expectedStateDigest))
    )
      return false;
    this.#states.set(state.stateKey, structuredClone(state));
    return true;
  }
}

function sameScope(
  evidence: readonly CoordinationControlEvidenceV1[],
  scope: CoordinationControlEvidenceV1["scope"],
): boolean {
  return evidence.every(
    (item) =>
      item.scope.tenantId === scope.tenantId &&
      item.scope.coordinationId === scope.coordinationId &&
      item.scope.missionIntentId === scope.missionIntentId &&
      item.scope.teamId === scope.teamId &&
      item.scope.workItemId === scope.workItemId,
  );
}
function logicalTime(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError("logical time must be non-negative");
}
