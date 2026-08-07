import type { AgentPlatID } from "@agentplat/core";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import type {
  GovernedMissionControlActionV1,
  GovernedMissionControlProposalV1,
  GovernedMissionScopeV1,
} from "./mission-lifecycle-contracts.js";
import {
  ATTESTED_MISSION_CONTROL_STATE_FORMAT_V1,
  type AttestedMissionControlAnchorV1,
  type AttestedMissionControlDecisionRecordV1,
  type AttestedMissionControlDecisionV1,
  type AttestedMissionControlMonotonicAnchorPortV1,
  type AttestedMissionControlPortV1,
  type AttestedMissionControlRuntimeOptionsV1,
  type AttestedMissionControlStateV1,
  type AttestedMissionControlStoreV1,
} from "./attested-mission-control-contracts.js";
import {
  attestedMissionFenceDigestV1,
  createAttestedMissionControlProposalV1,
  createAttestedMissionControlStateV1,
  validateAttestedMissionControlDecisionV1,
  validateAttestedMissionControlPolicyV1,
  validateAttestedMissionControlStateV1,
} from "./attested-mission-control-validation.js";
import { validateGovernedMissionScopeV1 } from "./mission-lifecycle-validation.js";

const SHA = /^sha256:[0-9a-f]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;

interface LoadedState {
  readonly state: AttestedMissionControlStateV1;
  readonly persisted: boolean;
  readonly anchor: AttestedMissionControlAnchorV1 | null;
  readonly expectedRevision: number | null;
  readonly expectedStateDigest: PlanningDigestV1 | null;
  readonly bindingReset: boolean;
}

interface Evaluation {
  readonly proposal: GovernedMissionControlProposalV1;
  readonly sequenceHighWater: number | null;
  readonly activeWindowId: AgentPlatID | null;
  readonly activeWindowExpiresAtLogicalMs: number | null;
  readonly consecutiveHealthySteps: number;
  readonly discontinuity: boolean;
  readonly lastDecisionDigest: PlanningDigestV1 | null;
  readonly recentDecisions: readonly AttestedMissionControlDecisionRecordV1[];
}

/**
 * Durable, content-free adapter for a verified mission-control source. It
 * never executes a control action; every result remains advisory.
 */
export class AttestedMissionControlRuntimeV1 implements AttestedMissionControlPortV1 {
  readonly #options: AttestedMissionControlRuntimeOptionsV1;

  constructor(options: AttestedMissionControlRuntimeOptionsV1) {
    if (!options || typeof options !== "object")
      fail("control options are required");
    id(options.stateKey, "control state key");
    id(options.anchorKey, "control anchor key");
    if (
      !options.source ||
      typeof options.source.propose !== "function" ||
      typeof options.source.verify !== "function" ||
      !options.store ||
      typeof options.store.load !== "function" ||
      typeof options.store.save !== "function" ||
      !options.monotonicAnchor ||
      typeof options.monotonicAnchor.load !== "function" ||
      typeof options.monotonicAnchor.save !== "function"
    )
      fail("control ports are required");
    this.#options = {
      ...options,
      policy: validateAttestedMissionControlPolicyV1(options.policy),
    };
  }

  async evaluate(input: {
    readonly scope: GovernedMissionScopeV1;
    readonly logicalTimeMs: number;
    readonly executionObservationDigest: PlanningDigestV1;
  }): Promise<GovernedMissionControlProposalV1> {
    const scope = validateGovernedMissionScopeV1(input.scope);
    const logicalTimeMs = logical(input.logicalTimeMs);
    const executionObservationDigest = sha(
      input.executionObservationDigest,
      "execution observation digest",
    );
    const fenceDigest = attestedMissionFenceDigestV1(scope);
    const fallback = () =>
      this.#safeProposal(
        scope,
        logicalTimeMs,
        `guard-${this.#options.policy.policyId}`,
      );

    let decision: AttestedMissionControlDecisionV1 | null = null;
    let verified = false;
    try {
      decision = validateAttestedMissionControlDecisionV1(
        await this.#options.source.propose({
          scope,
          logicalTimeMs,
          executionObservationDigest,
        }),
      );
      verified =
        (await this.#options.source.verify({
          decision,
          policy: this.#options.policy,
        })) === true;
    } catch {
      decision = null;
      verified = false;
    }

    for (
      let attempt = 0;
      attempt < this.#options.policy.maximumCommitAttempts;
      attempt += 1
    ) {
      const loaded = await this.#load(scope, fenceDigest);
      if (!loaded) return fallback();
      if (logicalTimeMs < loaded.state.logicalTimeHighWaterMs)
        return fallback();
      if (!(await this.#anchorAllows(loaded))) return fallback();
      const evaluation = this.#evaluateDecision({
        state: loaded.state,
        scope,
        fenceDigest,
        logicalTimeMs,
        executionObservationDigest,
        decision,
        verified,
        forceDiscontinuity: loaded.bindingReset,
      });
      const { stateDigest: priorStateDigest, ...priorStateBody } = loaded.state;
      const next = createAttestedMissionControlStateV1({
        ...priorStateBody,
        revision: loaded.state.revision + 1,
        logicalTimeHighWaterMs: logicalTimeMs,
        sequenceHighWater: evaluation.sequenceHighWater,
        activeWindowId: evaluation.activeWindowId,
        activeWindowExpiresAtLogicalMs:
          evaluation.activeWindowExpiresAtLogicalMs,
        consecutiveHealthySteps: evaluation.consecutiveHealthySteps,
        discontinuityCount: evaluation.discontinuity
          ? Math.min(
              Number.MAX_SAFE_INTEGER,
              loaded.state.discontinuityCount + 1,
            )
          : loaded.state.discontinuityCount,
        lastExecutionObservationDigest: executionObservationDigest,
        lastDecisionDigest: evaluation.lastDecisionDigest,
        lastProposal: evaluation.proposal,
        recentDecisions: evaluation.recentDecisions,
        predecessorStateDigest: loaded.persisted
          ? (loaded.expectedStateDigest ?? priorStateDigest)
          : null,
      });
      const saved = await this.#options.store.save({
        state: next,
        expectedRevision: loaded.expectedRevision,
        expectedStateDigest: loaded.expectedStateDigest,
      });
      if (!saved) continue;
      await this.#advanceAnchor(next, loaded.anchor);
      return evaluation.proposal;
    }
    fail("control state contention exceeded the commit budget");
  }

  #evaluateDecision(input: {
    readonly state: AttestedMissionControlStateV1;
    readonly scope: GovernedMissionScopeV1;
    readonly fenceDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
    readonly executionObservationDigest: PlanningDigestV1;
    readonly decision: AttestedMissionControlDecisionV1 | null;
    readonly verified: boolean;
    readonly forceDiscontinuity: boolean;
  }): Evaluation {
    const { state, decision } = input;
    if (!decision || !input.verified)
      return this.#discontinuity(state, input.scope, input.logicalTimeMs, null);

    const expectedSequence =
      state.sequenceHighWater === null
        ? this.#options.policy.initialSequence
        : state.sequenceHighWater < Number.MAX_SAFE_INTEGER
          ? state.sequenceHighWater + 1
          : Number.MAX_SAFE_INTEGER;
    const identityValid =
      decision.scopeDigest === input.scope.scopeDigest &&
      decision.authorityEpoch === input.scope.authorityEpoch &&
      decision.fenceDigest === input.fenceDigest &&
      decision.sourceId === this.#options.policy.sourceId &&
      decision.sourceEpoch === this.#options.policy.sourceEpoch;
    const observationValid =
      decision.executionObservationDigest === input.executionObservationDigest;
    const timeValid =
      decision.windowOpenedAtLogicalMs <= decision.evaluatedAtLogicalMs &&
      decision.evaluatedAtLogicalMs <= input.logicalTimeMs &&
      decision.expiresAtLogicalMs > input.logicalTimeMs &&
      decision.expiresAtLogicalMs - decision.windowOpenedAtLogicalMs <=
        this.#options.policy.maximumWindowMs;
    const sequenceValid = decision.sequence === expectedSequence;
    const sameWindow =
      state.activeWindowId === null ||
      (decision.windowId === state.activeWindowId &&
        decision.expiresAtLogicalMs === state.activeWindowExpiresAtLogicalMs);
    const recorded = state.recentDecisions.find(
      (entry) => entry.sequence === decision.sequence,
    );
    const replayOrEquivocation =
      state.sequenceHighWater !== null &&
      decision.sequence <= state.sequenceHighWater;

    if (
      !identityValid ||
      !observationValid ||
      !timeValid ||
      !sequenceValid ||
      !sameWindow ||
      input.forceDiscontinuity ||
      replayOrEquivocation ||
      (recorded !== undefined &&
        recorded.decisionDigest !== decision.decisionDigest)
    ) {
      const mayAdvance =
        identityValid &&
        decision.sequence >
          (state.sequenceHighWater ??
            this.#options.policy.initialSequence - 1) &&
        decision.sequence - expectedSequence <=
          this.#options.policy.maximumSequenceGap;
      return this.#discontinuity(
        state,
        input.scope,
        input.logicalTimeMs,
        mayAdvance ? decision : null,
      );
    }

    const recentDecisions = this.#appendRecord(state.recentDecisions, decision);
    if (decision.action !== "continue") {
      const proposal = createAttestedMissionControlProposalV1({
        proposalId: decision.proposalId,
        scopeDigest: input.scope.scopeDigest,
        authorityEpoch: input.scope.authorityEpoch,
        action: decision.action,
        evaluatedAtLogicalMs: decision.evaluatedAtLogicalMs,
        expiresAtLogicalMs: decision.expiresAtLogicalMs,
      });
      return {
        proposal,
        sequenceHighWater: decision.sequence,
        activeWindowId: decision.windowId,
        activeWindowExpiresAtLogicalMs: decision.expiresAtLogicalMs,
        consecutiveHealthySteps: 0,
        discontinuity: true,
        lastDecisionDigest: decision.decisionDigest,
        recentDecisions,
      };
    }

    const healthy = Math.min(
      this.#options.policy.requiredHealthySteps,
      state.consecutiveHealthySteps + 1,
    );
    const proposal = createAttestedMissionControlProposalV1({
      proposalId: decision.proposalId,
      scopeDigest: input.scope.scopeDigest,
      authorityEpoch: input.scope.authorityEpoch,
      action:
        healthy >= this.#options.policy.requiredHealthySteps
          ? "continue"
          : this.#options.policy.discontinuityAction,
      evaluatedAtLogicalMs: decision.evaluatedAtLogicalMs,
      expiresAtLogicalMs: decision.expiresAtLogicalMs,
    });
    return {
      proposal,
      sequenceHighWater: decision.sequence,
      activeWindowId: decision.windowId,
      activeWindowExpiresAtLogicalMs: decision.expiresAtLogicalMs,
      consecutiveHealthySteps: healthy,
      discontinuity: false,
      lastDecisionDigest: decision.decisionDigest,
      recentDecisions,
    };
  }

  #discontinuity(
    state: AttestedMissionControlStateV1,
    scope: GovernedMissionScopeV1,
    logicalTimeMs: number,
    acceptedDecision: AttestedMissionControlDecisionV1 | null,
  ): Evaluation {
    const proposalId =
      acceptedDecision?.proposalId ?? `guard-${this.#options.policy.policyId}`;
    return {
      proposal: createAttestedMissionControlProposalV1({
        proposalId,
        scopeDigest: scope.scopeDigest,
        authorityEpoch: scope.authorityEpoch,
        action: this.#options.policy.discontinuityAction,
        evaluatedAtLogicalMs: logicalTimeMs,
        expiresAtLogicalMs: safeExpiry(
          logicalTimeMs,
          this.#options.policy.maximumWindowMs,
        ),
      }),
      sequenceHighWater: acceptedDecision?.sequence ?? state.sequenceHighWater,
      activeWindowId: acceptedDecision?.windowId ?? null,
      activeWindowExpiresAtLogicalMs:
        acceptedDecision?.expiresAtLogicalMs ?? null,
      consecutiveHealthySteps: 0,
      discontinuity: true,
      lastDecisionDigest:
        acceptedDecision?.decisionDigest ?? state.lastDecisionDigest,
      recentDecisions: acceptedDecision
        ? this.#appendRecord(state.recentDecisions, acceptedDecision)
        : state.recentDecisions,
    };
  }

  #appendRecord(
    current: readonly AttestedMissionControlDecisionRecordV1[],
    decision: AttestedMissionControlDecisionV1,
  ): readonly AttestedMissionControlDecisionRecordV1[] {
    const record: AttestedMissionControlDecisionRecordV1 = Object.freeze({
      sequence: decision.sequence,
      windowId: decision.windowId,
      action: decision.action,
      decisionDigest: decision.decisionDigest,
    });
    return Object.freeze(
      [...current, record].slice(
        -this.#options.policy.maximumRetainedDecisions,
      ),
    );
  }

  async #load(
    scope: GovernedMissionScopeV1,
    fenceDigest: PlanningDigestV1,
  ): Promise<LoadedState | null> {
    const stored = await this.#options.store.load(this.#options.stateKey);
    const anchor = await this.#options.monotonicAnchor.load(
      this.#options.anchorKey,
    );
    if (!stored) {
      if (anchor) return null;
      return {
        state: createAttestedMissionControlStateV1({
          format: ATTESTED_MISSION_CONTROL_STATE_FORMAT_V1,
          schemaVersion: 1,
          stateKey: this.#options.stateKey,
          tenantId: scope.tenantId,
          missionId: scope.missionId,
          scopeDigest: scope.scopeDigest,
          authorityEpoch: scope.authorityEpoch,
          fenceDigest,
          policyDigest: this.#options.policy.policyDigest,
          sourceId: this.#options.policy.sourceId,
          sourceEpoch: this.#options.policy.sourceEpoch,
          revision: 0,
          logicalTimeHighWaterMs: 0,
          sequenceHighWater: null,
          activeWindowId: null,
          activeWindowExpiresAtLogicalMs: null,
          consecutiveHealthySteps: 0,
          discontinuityCount: 0,
          lastExecutionObservationDigest: null,
          lastDecisionDigest: null,
          lastProposal: null,
          recentDecisions: [],
          predecessorStateDigest: null,
        }),
        persisted: false,
        anchor,
        expectedRevision: null,
        expectedStateDigest: null,
        bindingReset: false,
      };
    }
    const state = validateAttestedMissionControlStateV1(stored);
    if (
      state.stateKey !== this.#options.stateKey ||
      state.tenantId !== scope.tenantId ||
      state.missionId !== scope.missionId
    )
      return null;
    if (
      state.recentDecisions.length >
      this.#options.policy.maximumRetainedDecisions
    )
      return null;
    const bindingReset =
      state.scopeDigest !== scope.scopeDigest ||
      state.authorityEpoch !== scope.authorityEpoch ||
      state.fenceDigest !== fenceDigest ||
      state.policyDigest !== this.#options.policy.policyDigest ||
      state.sourceId !== this.#options.policy.sourceId ||
      state.sourceEpoch !== this.#options.policy.sourceEpoch;
    if (!bindingReset)
      return {
        state,
        persisted: true,
        anchor,
        expectedRevision: state.revision,
        expectedStateDigest: state.stateDigest,
        bindingReset: false,
      };
    return {
      state: createAttestedMissionControlStateV1({
        format: ATTESTED_MISSION_CONTROL_STATE_FORMAT_V1,
        schemaVersion: 1,
        stateKey: this.#options.stateKey,
        tenantId: scope.tenantId,
        missionId: scope.missionId,
        scopeDigest: scope.scopeDigest,
        authorityEpoch: scope.authorityEpoch,
        fenceDigest,
        policyDigest: this.#options.policy.policyDigest,
        sourceId: this.#options.policy.sourceId,
        sourceEpoch: this.#options.policy.sourceEpoch,
        revision: state.revision,
        logicalTimeHighWaterMs: state.logicalTimeHighWaterMs,
        sequenceHighWater: null,
        activeWindowId: null,
        activeWindowExpiresAtLogicalMs: null,
        consecutiveHealthySteps: 0,
        discontinuityCount: state.discontinuityCount,
        lastExecutionObservationDigest: null,
        lastDecisionDigest: null,
        lastProposal: null,
        recentDecisions: [],
        predecessorStateDigest: state.stateDigest,
      }),
      persisted: true,
      anchor,
      expectedRevision: state.revision,
      expectedStateDigest: state.stateDigest,
      bindingReset: true,
    };
  }

  async #anchorAllows(loaded: LoadedState): Promise<boolean> {
    const anchor = loaded.anchor;
    if (!anchor) return true;
    if (
      loaded.expectedRevision === null ||
      loaded.expectedStateDigest === null ||
      anchor.stateRevision > loaded.expectedRevision
    )
      return false;
    if (
      anchor.stateRevision === loaded.expectedRevision &&
      anchor.stateDigest !== loaded.expectedStateDigest
    )
      return false;
    if (anchor.logicalTimeHighWaterMs > loaded.state.logicalTimeHighWaterMs)
      return false;
    // State is written before its witness. A lagging anchor is advanced to the
    // newly committed state by #advanceAnchor, including after crash recovery.
    return true;
  }

  async #advanceAnchor(
    state: AttestedMissionControlStateV1,
    previous: AttestedMissionControlAnchorV1 | null,
  ): Promise<void> {
    if (
      await this.#options.monotonicAnchor.save({
        anchorKey: this.#options.anchorKey,
        anchor: this.#anchor(state),
        expectedRevision: previous?.stateRevision ?? null,
        expectedStateDigest: previous?.stateDigest ?? null,
      })
    )
      return;
    const current = await this.#options.monotonicAnchor.load(
      this.#options.anchorKey,
    );
    if (
      current &&
      (current.stateRevision > state.revision ||
        (current.stateRevision === state.revision &&
          current.stateDigest === state.stateDigest))
    )
      return;
    fail("control monotonic anchor update failed");
  }

  #anchor(
    state: AttestedMissionControlStateV1,
  ): AttestedMissionControlAnchorV1 {
    return Object.freeze({
      stateRevision: state.revision,
      stateDigest: state.stateDigest,
      logicalTimeHighWaterMs: state.logicalTimeHighWaterMs,
    });
  }

  #safeProposal(
    scope: GovernedMissionScopeV1,
    logicalTimeMs: number,
    proposalId: string,
  ): GovernedMissionControlProposalV1 {
    return createAttestedMissionControlProposalV1({
      proposalId,
      scopeDigest: scope.scopeDigest,
      authorityEpoch: scope.authorityEpoch,
      action: this.#options.policy.discontinuityAction,
      evaluatedAtLogicalMs: logicalTimeMs,
      expiresAtLogicalMs: safeExpiry(
        logicalTimeMs,
        this.#options.policy.maximumWindowMs,
      ),
    });
  }
}

export class InMemoryAttestedMissionControlStoreV1 implements AttestedMissionControlStoreV1 {
  readonly #states = new Map<AgentPlatID, AttestedMissionControlStateV1>();

  async load(
    stateKey: AgentPlatID,
  ): Promise<AttestedMissionControlStateV1 | null> {
    return this.#states.get(stateKey) ?? null;
  }

  async save(input: {
    readonly state: AttestedMissionControlStateV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean> {
    const state = validateAttestedMissionControlStateV1(input.state);
    const current = this.#states.get(state.stateKey) ?? null;
    if (
      (current?.revision ?? null) !== input.expectedRevision ||
      (current?.stateDigest ?? null) !== input.expectedStateDigest
    )
      return false;
    this.#states.set(state.stateKey, state);
    return true;
  }
}

export class InMemoryAttestedMissionControlMonotonicAnchorV1 implements AttestedMissionControlMonotonicAnchorPortV1 {
  readonly #anchors = new Map<AgentPlatID, AttestedMissionControlAnchorV1>();

  async load(
    anchorKey: AgentPlatID,
  ): Promise<AttestedMissionControlAnchorV1 | null> {
    return this.#anchors.get(anchorKey) ?? null;
  }

  async save(input: {
    readonly anchorKey: AgentPlatID;
    readonly anchor: AttestedMissionControlAnchorV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean> {
    const current = this.#anchors.get(input.anchorKey) ?? null;
    if (
      (current?.stateRevision ?? null) !== input.expectedRevision ||
      (current?.stateDigest ?? null) !== input.expectedStateDigest ||
      input.anchor.stateRevision < (current?.stateRevision ?? -1) ||
      input.anchor.logicalTimeHighWaterMs <
        (current?.logicalTimeHighWaterMs ?? -1)
    )
      return false;
    this.#anchors.set(input.anchorKey, Object.freeze({ ...input.anchor }));
    return true;
  }
}

function safeExpiry(logicalTimeMs: number, maximumWindowMs: number): number {
  if (logicalTimeMs >= Number.MAX_SAFE_INTEGER)
    fail("control logical time cannot be advanced");
  return Math.min(Number.MAX_SAFE_INTEGER, logicalTimeMs + maximumWindowMs);
}
function logical(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail("control logical time is invalid");
  return value as number;
}
function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !ID.test(value)) fail(`${label} is invalid`);
  return value;
}
function sha(value: unknown, label: string): PlanningDigestV1 {
  if (typeof value !== "string" || !SHA.test(value))
    fail(`${label} is invalid`);
  return value as PlanningDigestV1;
}
function fail(message: string): never {
  throw new TypeError(message);
}
