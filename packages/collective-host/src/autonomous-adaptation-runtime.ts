import { collectiveQuorumDigestV1 } from "@agentplat/collective-quorum/crypto";
import type { SparseFinalityCertificateV2 } from "@agentplat/collective-quorum/sparse-agreement";

import {
  DistributedCollectiveProtocolRuntimeV1,
  type DistributedCollectiveMessageV1,
} from "./distributed-collective-protocol.js";

export type AutonomousAdaptationDomainV1 =
  "mission" | "strategy" | "role" | "team";
export type AutonomousMissionSignalKindV1 =
  | "objective_progress"
  | "semantic_drift"
  | "execution_failure"
  | "peer_unavailable"
  | "resource_pressure"
  | "environment_change"
  | "safety_intervention";

export interface AutonomousMissionSignalV1 {
  readonly schemaVersion: 1;
  readonly signalId: string;
  readonly missionId: string;
  readonly sourcePeerId: string;
  readonly sourceInstanceId: string;
  readonly sourceKeyId: string;
  readonly membershipConfigurationDigest: string;
  readonly sourceIndependenceGroupId: string;
  readonly kind: AutonomousMissionSignalKindV1;
  readonly severityBasisPoints: number;
  readonly confidenceBasisPoints: number;
  readonly subjectDigest: string;
  readonly evidenceDigests: readonly string[];
  readonly observedAtLogicalMs: number;
  readonly signalDigest: string;
}

export interface AutonomousAdaptationPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly minimumSeverityBasisPoints: number;
  readonly minimumConfidenceBasisPoints: number;
  readonly minimumIndependentSources: number;
  readonly observationWindowMs: number;
  readonly domainCooldownMs: Readonly<
    Record<AutonomousAdaptationDomainV1, number>
  >;
  readonly maximumActionsPerCycle: number;
  readonly maximumEvidenceDigestsPerSignal: number;
  readonly maximumRetainedSignals: number;
  readonly maximumRetainedDecisions: number;
  readonly maximumCommitAttempts: number;
  readonly policyDigest: string;
}

export interface AutonomousAdaptationActionV1 {
  readonly schemaVersion: 1;
  readonly actionId: string;
  readonly domain: AutonomousAdaptationDomainV1;
  readonly subjectId: string;
  readonly predecessorDigest: string;
  readonly candidateDigest: string;
  readonly rollbackDigest: string;
  readonly authorityCeilingDigest: string;
  readonly evidenceDigests: readonly string[];
  readonly expectedBenefitBasisPoints: number;
  readonly maximumRiskBasisPoints: number;
  readonly actionDigest: string;
}

export interface AutonomousAdaptationPlannerPortV1 {
  readonly domain: AutonomousAdaptationDomainV1;
  propose(input: {
    readonly cycleId: string;
    readonly missionId: string;
    readonly signals: readonly AutonomousMissionSignalV1[];
    readonly currentStateDigest: string;
    readonly policyDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<AutonomousAdaptationActionV1 | null>;
}

export interface AutonomousAdaptationSignalAdmissionPortV1 {
  admit(input: {
    readonly signal: AutonomousMissionSignalV1;
    readonly issuerInstanceId: string;
    readonly issuerKeyId: string;
    readonly membershipConfigurationDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
}

export interface AutonomousAdaptationSafetyPortV1 {
  evaluate(input: {
    readonly cycleId: string;
    readonly actions: readonly AutonomousAdaptationActionV1[];
    readonly signals: readonly AutonomousMissionSignalV1[];
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly disposition: "allow" | "deny" | "abstain";
    readonly reasonCodes: readonly string[];
    readonly evidenceDigests: readonly string[];
    readonly decisionDigest: string;
  }>;
}

export interface AutonomousAdaptationFinalityPortV1 {
  certify(input: {
    readonly cycleId: string;
    readonly bundleDigest: string;
    readonly actionDigests: readonly string[];
    readonly signalDigests: readonly string[];
    readonly safetyDecisionDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<SparseFinalityCertificateV2 | null>;
  verify(input: {
    readonly certificate: SparseFinalityCertificateV2;
    readonly bundleDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
}

export interface AutonomousAdaptationActuatorPortV1 {
  /** Durable lookup for an apply that may have completed before its caller observed the receipt. */
  reconcileApply(input: {
    readonly idempotencyKey: string;
    readonly action: AutonomousAdaptationActionV1;
    readonly certificate: SparseFinalityCertificateV2;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly applied: boolean;
    readonly resultingDigest: string;
    readonly receiptDigest: string;
  } | null>;
  /** Atomically claims the idempotency key, compares predecessor, applies, and durably records its receipt. */
  apply(input: {
    readonly idempotencyKey: string;
    readonly action: AutonomousAdaptationActionV1;
    readonly certificate: SparseFinalityCertificateV2;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly applied: boolean;
    readonly resultingDigest: string;
    readonly receiptDigest: string;
  }>;
  /** Durable lookup for a rollback that may have completed before journaling. */
  reconcileRollback(input: {
    readonly idempotencyKey: string;
    readonly action: AutonomousAdaptationActionV1;
    readonly appliedReceiptDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly rolledBack: boolean;
    readonly resultingDigest: string;
    readonly receiptDigest: string;
  } | null>;
  /** Atomically claims the rollback key, compares candidate state, rolls back, and records its receipt. */
  rollback(input: {
    readonly idempotencyKey: string;
    readonly action: AutonomousAdaptationActionV1;
    readonly appliedReceiptDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly rolledBack: boolean;
    readonly resultingDigest: string;
    readonly receiptDigest: string;
  }>;
}

export interface AutonomousAdaptationDecisionV1 {
  readonly schemaVersion: 1;
  readonly cycleId: string;
  readonly status:
    | "idle"
    | "safety_rejected"
    | "finality_unavailable"
    | "applied"
    | "rolled_back"
    | "superseded";
  readonly signalDigests: readonly string[];
  readonly actionDigests: readonly string[];
  readonly bundleDigest: string | null;
  readonly safetyDecisionDigest: string | null;
  readonly finalityCertificateDigest: string | null;
  readonly appliedActionDigests: readonly string[];
  readonly rollbackReceiptDigests: readonly string[];
  readonly reasonCodes: readonly string[];
  readonly logicalTimeMs: number;
  readonly decisionDigest: string;
}

export interface AutonomousAdaptationProcessedSignalWatermarkV1 {
  readonly sourcePeerId: string;
  readonly sourceInstanceId: string;
  readonly sourceKeyId: string;
  readonly observedAtLogicalMs: number;
  /** Exact signals consumed at the high-water coordinate. */
  readonly signalDigestsAtLogicalMs: readonly string[];
}

export interface AutonomousAdaptationSagaActionV1 {
  readonly action: AutonomousAdaptationActionV1;
  readonly phase: "prepared" | "applied" | "rolled_back" | "completed";
  readonly applyReceiptDigest: string | null;
  readonly rollbackReceiptDigest: string | null;
}

export interface AutonomousAdaptationSagaV1 {
  readonly cycleId: string;
  readonly phase: "prepared" | "compensating" | "superseded" | "completed";
  readonly currentStateDigest: string;
  readonly signals: readonly AutonomousMissionSignalV1[];
  readonly signalDigests: readonly string[];
  readonly bundleDigest: string;
  readonly safetyDecisionDigest: string;
  readonly certificate: SparseFinalityCertificateV2;
  readonly actions: readonly AutonomousAdaptationSagaActionV1[];
  readonly logicalTimeMs: number;
  readonly decisionDigest: string | null;
}

export interface AutonomousAdaptationStateV1 {
  readonly schemaVersion: 1;
  readonly runtimeId: string;
  readonly missionId: string;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly retainedSignals: readonly AutonomousMissionSignalV1[];
  readonly processedSignalDigests: readonly string[];
  /** Causal tombstones; unlike lexical digest truncation these cannot reopen replayed signals. */
  readonly processedSignalWatermarks: readonly AutonomousAdaptationProcessedSignalWatermarkV1[];
  /** Durable effect authority and receipts for incomplete or retained cycles. */
  readonly adaptationSagas: readonly AutonomousAdaptationSagaV1[];
  readonly domainLastAppliedLogicalMs: Readonly<
    Record<AutonomousAdaptationDomainV1, number | null>
  >;
  readonly decisions: readonly AutonomousAdaptationDecisionV1[];
  readonly previousStateDigest: string | null;
  readonly stateDigest: string;
}

export interface AutonomousAdaptationStoreV1 {
  load(runtimeId: string): Promise<AutonomousAdaptationStateV1 | null>;
  save(
    state: AutonomousAdaptationStateV1,
    expectedRevision: number | null,
  ): Promise<boolean>;
}

/**
 * Explicit restart-continuity capability. Reference compositions require this
 * nominal wrapper instead of silently accepting the process-local default.
 */
export interface RestartDurableAutonomousAdaptationStoreV1 extends AutonomousAdaptationStoreV1 {}

const restartDurableAdaptationStoresV1 = new WeakSet<object>();

export function declareRestartDurableAutonomousAdaptationStoreV1(
  store: AutonomousAdaptationStoreV1,
): RestartDurableAutonomousAdaptationStoreV1 {
  const load = captureMethod<AutonomousAdaptationStoreV1["load"]>(
    store,
    "load",
    "store.load",
  );
  const save = captureMethod<AutonomousAdaptationStoreV1["save"]>(
    store,
    "save",
    "store.save",
  );
  const declared = Object.freeze({ load, save });
  restartDurableAdaptationStoresV1.add(declared);
  return declared;
}

export function isRestartDurableAutonomousAdaptationStoreV1(
  value: unknown,
): value is RestartDurableAutonomousAdaptationStoreV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    restartDurableAdaptationStoresV1.has(value)
  );
}

export class InMemoryAutonomousAdaptationStoreV1 implements AutonomousAdaptationStoreV1 {
  readonly #states = new Map<string, AutonomousAdaptationStateV1>();
  async load(runtimeId: string): Promise<AutonomousAdaptationStateV1 | null> {
    const state = this.#states.get(runtimeId);
    return state ? freeze(state) : null;
  }
  async save(
    state: AutonomousAdaptationStateV1,
    expectedRevision: number | null,
  ): Promise<boolean> {
    const current = this.#states.get(state.runtimeId);
    if (
      (expectedRevision === null &&
        (current !== undefined || state.revision !== 0)) ||
      (expectedRevision !== null &&
        (!current ||
          current.revision !== expectedRevision ||
          state.revision !== expectedRevision + 1))
    )
      return false;
    this.#states.set(state.runtimeId, freeze(state));
    return true;
  }
}

interface AutonomousAdaptationRuntimeInvokersV1 {
  readonly initialize: (
    logicalTimeMs?: number,
  ) => Promise<AutonomousAdaptationStateV1>;
  readonly publishSignal: (input: {
    readonly signal: AutonomousMissionSignalV1;
    readonly lifetime: number;
    readonly fanout?: number;
    /** Stable binding of the enclosing durable command, when present. */
    readonly commandBindingDigest?: string;
  }) => Promise<void>;
  readonly runCycle: (input: {
    readonly cycleId: string;
    readonly logicalTimeMs: number;
  }) => Promise<AutonomousAdaptationDecisionV1>;
  readonly load: () => Promise<AutonomousAdaptationStateV1>;
}

const autonomousAdaptationRuntimeInvokersV1 = new WeakMap<
  object,
  AutonomousAdaptationRuntimeInvokersV1
>();

/** Durable observe-decide-certify-enact loop with bounded autonomous changes. */
export class AutonomousAdaptationRuntimeV1 {
  readonly #runtimeId: string;
  readonly #missionId: string;
  readonly #policy: AutonomousAdaptationPolicyV1;
  readonly #crypto: Crypto;
  readonly #protocolScope: Readonly<{
    localPeerId: string;
    localInstanceId: string;
    localKeyId: string;
    membershipConfigurationDigest: string;
  }>;
  readonly #protocolPublish: DistributedCollectiveProtocolRuntimeV1["publish"];
  readonly #protocolMessages: DistributedCollectiveProtocolRuntimeV1["messages"];
  readonly #currentStateDigest: () => Promise<string>;
  readonly #admitSignal: AutonomousAdaptationSignalAdmissionPortV1["admit"];
  readonly #planners: ReadonlyMap<
    AutonomousAdaptationDomainV1,
    AutonomousAdaptationPlannerPortV1["propose"]
  >;
  readonly #evaluateSafety: AutonomousAdaptationSafetyPortV1["evaluate"];
  readonly #certifyFinality: AutonomousAdaptationFinalityPortV1["certify"];
  readonly #verifyFinality: AutonomousAdaptationFinalityPortV1["verify"];
  readonly #reconcileApplyAction: AutonomousAdaptationActuatorPortV1["reconcileApply"];
  readonly #applyAction: AutonomousAdaptationActuatorPortV1["apply"];
  readonly #reconcileRollbackAction: AutonomousAdaptationActuatorPortV1["reconcileRollback"];
  readonly #rollbackAction: AutonomousAdaptationActuatorPortV1["rollback"];
  readonly #loadState: AutonomousAdaptationStoreV1["load"];
  readonly #saveState: AutonomousAdaptationStoreV1["save"];
  #policyVerification: Promise<AutonomousAdaptationPolicyV1> | null = null;
  declare readonly initialize: AutonomousAdaptationRuntimeInvokersV1["initialize"];
  declare readonly publishSignal: AutonomousAdaptationRuntimeInvokersV1["publishSignal"];
  declare readonly runCycle: AutonomousAdaptationRuntimeInvokersV1["runCycle"];
  declare readonly load: AutonomousAdaptationRuntimeInvokersV1["load"];

  constructor(
    readonly options: {
      readonly runtimeId: string;
      readonly missionId: string;
      readonly protocol: DistributedCollectiveProtocolRuntimeV1;
      readonly currentStateDigest: () => Promise<string>;
      readonly signalAdmission: AutonomousAdaptationSignalAdmissionPortV1;
      readonly policy: AutonomousAdaptationPolicyV1;
      readonly planners: readonly AutonomousAdaptationPlannerPortV1[];
      readonly safety: AutonomousAdaptationSafetyPortV1;
      readonly finality: AutonomousAdaptationFinalityPortV1;
      readonly actuator: AutonomousAdaptationActuatorPortV1;
      readonly store?: AutonomousAdaptationStoreV1;
      readonly crypto?: Crypto;
    },
  ) {
    const runtimeId = options.runtimeId;
    const missionId = options.missionId;
    const protocol = options.protocol;
    const currentStateDigest = options.currentStateDigest;
    const signalAdmission = options.signalAdmission;
    const policy = options.policy;
    const configuredPlanners = options.planners;
    const safety = options.safety;
    const finality = options.finality;
    const actuator = options.actuator;
    const configuredStore = options.store;
    const configuredCrypto = options.crypto;
    identifier(runtimeId, "runtimeId");
    identifier(missionId, "missionId");
    this.#runtimeId = runtimeId;
    this.#missionId = missionId;
    this.#crypto = captureDigestCrypto(configuredCrypto);
    this.#policy = validateAutonomousAdaptationPolicyV1(policy);
    if (!protocol || typeof currentStateDigest !== "function")
      throw new TypeError("autonomous adaptation ports are required");
    const protocolOptions = protocol.options;
    const localPeerId = protocolOptions.localPeerId;
    const localInstanceId = protocolOptions.localInstanceId;
    const localKeyId = protocolOptions.authenticity.localKeyId;
    const membershipConfigurationDigest =
      protocolOptions.membershipConfigurationDigest;
    const protocolPublish = captureMethod<
      DistributedCollectiveProtocolRuntimeV1["publish"]
    >(protocol, "publish", "protocol.publish");
    const protocolMessages = captureMethod<
      DistributedCollectiveProtocolRuntimeV1["messages"]
    >(protocol, "messages", "protocol.messages");
    const admitSignal = captureMethod<
      AutonomousAdaptationSignalAdmissionPortV1["admit"]
    >(signalAdmission, "admit", "signalAdmission.admit");
    const evaluateSafety = captureMethod<
      AutonomousAdaptationSafetyPortV1["evaluate"]
    >(safety, "evaluate", "safety.evaluate");
    const certifyFinality = captureMethod<
      AutonomousAdaptationFinalityPortV1["certify"]
    >(finality, "certify", "finality.certify");
    const verifyFinality = captureMethod<
      AutonomousAdaptationFinalityPortV1["verify"]
    >(finality, "verify", "finality.verify");
    const reconcileApplyAction = captureMethod<
      AutonomousAdaptationActuatorPortV1["reconcileApply"]
    >(actuator, "reconcileApply", "actuator.reconcileApply");
    const applyAction = captureMethod<
      AutonomousAdaptationActuatorPortV1["apply"]
    >(actuator, "apply", "actuator.apply");
    const reconcileRollbackAction = captureMethod<
      AutonomousAdaptationActuatorPortV1["reconcileRollback"]
    >(actuator, "reconcileRollback", "actuator.reconcileRollback");
    const rollbackAction = captureMethod<
      AutonomousAdaptationActuatorPortV1["rollback"]
    >(actuator, "rollback", "actuator.rollback");
    const planners = new Map(
      configuredPlanners.map((planner) => {
        const domain = planner?.domain;
        return [
          domain,
          captureMethod<AutonomousAdaptationPlannerPortV1["propose"]>(
            planner,
            "propose",
            `planner.${String(domain)}.propose`,
          ),
        ] as const;
      }),
    );
    if (
      planners.size !== 4 ||
      (["mission", "strategy", "role", "team"] as const).some(
        (domain) => !planners.has(domain),
      )
    )
      throw new TypeError(
        "one autonomous adaptation planner per domain is required",
      );
    this.#planners = planners;
    const store = configuredStore ?? new InMemoryAutonomousAdaptationStoreV1();
    this.#loadState = captureMethod<AutonomousAdaptationStoreV1["load"]>(
      store,
      "load",
      "store.load",
    );
    this.#saveState = captureMethod<AutonomousAdaptationStoreV1["save"]>(
      store,
      "save",
      "store.save",
    );
    this.#protocolPublish = protocolPublish;
    this.#protocolMessages = protocolMessages;
    this.#currentStateDigest = currentStateDigest;
    this.#admitSignal = admitSignal;
    this.#evaluateSafety = evaluateSafety;
    this.#certifyFinality = certifyFinality;
    this.#verifyFinality = verifyFinality;
    this.#reconcileApplyAction = reconcileApplyAction;
    this.#applyAction = applyAction;
    this.#reconcileRollbackAction = reconcileRollbackAction;
    this.#rollbackAction = rollbackAction;
    this.#protocolScope = Object.freeze({
      localPeerId,
      localInstanceId,
      localKeyId,
      membershipConfigurationDigest,
    });
    Object.defineProperty(this, "options", {
      value: Object.freeze({
        runtimeId,
        missionId,
        protocol,
        currentStateDigest,
        signalAdmission,
        policy: this.#policy,
        planners: Object.freeze([...configuredPlanners]),
        safety,
        finality,
        actuator,
        store,
        crypto: configuredCrypto,
      }),
      writable: false,
      configurable: false,
      enumerable: true,
    });
    const invokers: AutonomousAdaptationRuntimeInvokersV1 = Object.freeze({
      initialize: (logicalTimeMs = 0) => this.#initialize(logicalTimeMs),
      publishSignal: (
        input: Parameters<
          AutonomousAdaptationRuntimeInvokersV1["publishSignal"]
        >[0],
      ) => this.#publishSignal(input),
      runCycle: (
        input: Parameters<AutonomousAdaptationRuntimeInvokersV1["runCycle"]>[0],
      ) => this.#runCycle(input),
      load: () => this.#load(),
    });
    autonomousAdaptationRuntimeInvokersV1.set(this, invokers);
    Object.defineProperties(this, {
      initialize: immutableMethod(invokers.initialize),
      publishSignal: immutableMethod(invokers.publishSignal),
      runCycle: immutableMethod(invokers.runCycle),
      load: immutableMethod(invokers.load),
    });
  }

  async #initialize(logicalTimeMs = 0): Promise<AutonomousAdaptationStateV1> {
    await this.#verifyPolicy();
    integer(logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    const state = await this.#state({
      schemaVersion: 1,
      runtimeId: this.#runtimeId,
      missionId: this.#missionId,
      revision: 0,
      logicalTimeHighWaterMs: logicalTimeMs,
      retainedSignals: [],
      processedSignalDigests: [],
      processedSignalWatermarks: [],
      adaptationSagas: [],
      domainLastAppliedLogicalMs: {
        mission: null,
        strategy: null,
        role: null,
        team: null,
      },
      decisions: [],
      previousStateDigest: null,
    });
    if (!(await this.#saveState(state, null))) return this.#load();
    return state;
  }

  async #publishSignal(input: {
    readonly signal: AutonomousMissionSignalV1;
    readonly lifetime: number;
    readonly fanout?: number;
    readonly commandBindingDigest?: string;
  }): Promise<void> {
    await this.#verifyPolicy();
    const signal = await validateSignal(input.signal, this.#crypto);
    if (input.commandBindingDigest !== undefined)
      digest(input.commandBindingDigest, "commandBindingDigest");
    if (
      signal.missionId !== this.#missionId ||
      signal.sourcePeerId !== this.#protocolScope.localPeerId ||
      signal.sourceInstanceId !== this.#protocolScope.localInstanceId ||
      signal.sourceKeyId !== this.#protocolScope.localKeyId ||
      signal.membershipConfigurationDigest !==
        this.#protocolScope.membershipConfigurationDigest
    )
      throw new TypeError("autonomous mission signal is outside this mission");
    if (
      signal.evidenceDigests.length >
        this.#policy.maximumEvidenceDigestsPerSignal ||
      !(await this.#admitSignal({
        signal,
        issuerInstanceId: signal.sourceInstanceId,
        issuerKeyId: signal.sourceKeyId,
        membershipConfigurationDigest: signal.membershipConfigurationDigest,
        logicalTimeMs: signal.observedAtLogicalMs,
      }))
    )
      throw new TypeError("autonomous mission signal source is not admitted");
    await this.#protocolPublish({
      cycleId: `adaptation:${signal.missionId}`,
      streamId: `mission-signal:${signal.sourcePeerId}`,
      kind: "mission.signal",
      payload: signal,
      logicalTimeMs: signal.observedAtLogicalMs,
      lifetime: input.lifetime,
      ...(input.fanout === undefined ? {} : { fanout: input.fanout }),
      ...(input.commandBindingDigest === undefined
        ? {}
        : { commandBindingDigest: input.commandBindingDigest }),
    });
  }

  async #runCycle(input: {
    readonly cycleId: string;
    readonly logicalTimeMs: number;
  }): Promise<AutonomousAdaptationDecisionV1> {
    await this.#verifyPolicy();
    identifier(input.cycleId, "cycleId");
    integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    let state = await this.#load();
    if (input.logicalTimeMs < state.logicalTimeHighWaterMs)
      throw new Error("autonomous adaptation logical time rollback");
    const completed = state.decisions.find(
      (item) => item.cycleId === input.cycleId,
    );
    if (completed) return completed;
    const incompleteSaga = state.adaptationSagas.find(
      (saga) => saga.phase !== "completed",
    );
    if (incompleteSaga) {
      const reconciled = await this.#reconcileSaga(incompleteSaga.cycleId);
      if (incompleteSaga.cycleId === input.cycleId) return reconciled;
      state = await this.#load();
      if (input.logicalTimeMs < state.logicalTimeHighWaterMs)
        throw new Error("autonomous adaptation logical time rollback");
    }
    const messages = await this.#protocolMessages({
      cycleId: `adaptation:${this.#missionId}`,
      kind: "mission.signal",
      throughLogicalTimeMs: input.logicalTimeMs,
    });
    const discovered = await validSignals(
      messages,
      this.#missionId,
      this.#policy.maximumEvidenceDigestsPerSignal,
      this.#admitSignal,
      this.#crypto,
    );
    const retainedSignals = mergeSignals(
      state.retainedSignals,
      discovered,
      this.#policy.maximumRetainedSignals,
    ).filter(
      (signal) =>
        signal.observedAtLogicalMs >=
        Math.max(0, input.logicalTimeMs - this.#policy.observationWindowMs),
    );
    const processed = new Set(state.processedSignalDigests);
    const eligible = retainedSignals.filter(
      (signal) =>
        !processed.has(signal.signalDigest) &&
        !signalAtOrBeforeProcessedWatermark(
          signal,
          state.processedSignalWatermarks,
        ) &&
        signal.severityBasisPoints >= this.#policy.minimumSeverityBasisPoints &&
        signal.confidenceBasisPoints >=
          this.#policy.minimumConfidenceBasisPoints,
    );
    const independentGroups = new Set(
      eligible.map((signal) => signal.sourceIndependenceGroupId),
    );
    if (
      eligible.length === 0 ||
      independentGroups.size < this.#policy.minimumIndependentSources
    ) {
      const decision = await createDecision(
        {
          cycleId: input.cycleId,
          status: "idle",
          signalDigests: eligible.map((item) => item.signalDigest).sort(),
          actionDigests: [],
          bundleDigest: null,
          safetyDecisionDigest: null,
          finalityCertificateDigest: null,
          appliedActionDigests: [],
          rollbackReceiptDigests: [],
          reasonCodes: [
            eligible.length === 0
              ? "no_new_adaptation_signal"
              : "independent_signal_quorum_unavailable",
          ],
          logicalTimeMs: input.logicalTimeMs,
        },
        this.#crypto,
      );
      return this.#commit(
        state,
        retainedSignals,
        [],
        decision,
        {},
        input.logicalTimeMs,
      );
    }

    const currentStateDigest = await this.#currentStateDigest();
    digest(currentStateDigest, "currentStateDigest");
    const proposals = await Promise.all(
      (["mission", "strategy", "role", "team"] as const).map(async (domain) => {
        const last = state.domainLastAppliedLogicalMs[domain];
        if (
          last !== null &&
          input.logicalTimeMs - last < this.#policy.domainCooldownMs[domain]
        )
          return null;
        const proposal = await this.#planners.get(domain)!({
          cycleId: input.cycleId,
          missionId: this.#missionId,
          signals: eligible,
          currentStateDigest,
          policyDigest: this.#policy.policyDigest,
          logicalTimeMs: input.logicalTimeMs,
        });
        if (proposal && proposal.domain !== domain)
          throw new TypeError(
            `autonomous adaptation planner returned the wrong domain: ${domain}`,
          );
        return proposal;
      }),
    );
    const actions: AutonomousAdaptationActionV1[] = [];
    for (const proposal of proposals) {
      if (!proposal) continue;
      actions.push(await validateAction(proposal, this.#crypto));
    }
    actions.sort(
      (left, right) =>
        left.domain.localeCompare(right.domain) ||
        left.actionDigest.localeCompare(right.actionDigest),
    );
    if (actions.length > this.#policy.maximumActionsPerCycle)
      throw new RangeError("autonomous adaptation action budget exceeded");
    let expectedPredecessorDigest = currentStateDigest;
    for (const action of actions) {
      if (action.predecessorDigest !== expectedPredecessorDigest)
        throw new TypeError(
          "autonomous adaptation action chain has a stale predecessor",
        );
      expectedPredecessorDigest = action.candidateDigest;
    }
    if (actions.length === 0) {
      const decision = await createDecision(
        {
          cycleId: input.cycleId,
          status: "idle",
          signalDigests: eligible.map((item) => item.signalDigest).sort(),
          actionDigests: [],
          bundleDigest: null,
          safetyDecisionDigest: null,
          finalityCertificateDigest: null,
          appliedActionDigests: [],
          rollbackReceiptDigests: [],
          reasonCodes: ["no_bounded_adaptation_available"],
          logicalTimeMs: input.logicalTimeMs,
        },
        this.#crypto,
      );
      return this.#commit(
        state,
        retainedSignals,
        eligible,
        decision,
        {},
        input.logicalTimeMs,
      );
    }
    const safety = await this.#evaluateSafety({
      cycleId: input.cycleId,
      actions,
      signals: eligible,
      logicalTimeMs: input.logicalTimeMs,
    });
    if (!["allow", "deny", "abstain"].includes(safety.disposition))
      throw new TypeError(
        "autonomous adaptation safety disposition is invalid",
      );
    const safetyReasonCodes = canonicalReasonCodes(
      safety.reasonCodes,
      "safety.reasonCodes",
    );
    const safetyEvidenceDigests = canonicalDigestList(
      safety.evidenceDigests,
      "safety.evidenceDigests",
    );
    const expectedSafetyDecisionDigest = await collectiveQuorumDigestV1(
      {
        domain: "autonomous-adaptation-safety-decision-v1",
        body: {
          cycleId: input.cycleId,
          missionId: this.#missionId,
          policyDigest: this.#policy.policyDigest,
          currentStateDigest,
          signalDigests: eligible.map((item) => item.signalDigest).sort(),
          actionDigests: actions.map((item) => item.actionDigest),
          disposition: safety.disposition,
          reasonCodes: safetyReasonCodes,
          evidenceDigests: safetyEvidenceDigests,
          logicalTimeMs: input.logicalTimeMs,
        },
      },
      this.#crypto,
    );
    if (safety.decisionDigest !== expectedSafetyDecisionDigest)
      throw new TypeError(
        "autonomous adaptation safety decision digest is invalid",
      );
    const bundleDigest = await collectiveQuorumDigestV1(
      {
        domain: "autonomous-adaptation-bundle-v1",
        body: {
          cycleId: input.cycleId,
          missionId: this.#missionId,
          policyDigest: this.#policy.policyDigest,
          currentStateDigest,
          signalDigests: eligible.map((item) => item.signalDigest).sort(),
          actionDigests: actions.map((item) => item.actionDigest),
          safetyDecisionDigest: safety.decisionDigest,
          logicalTimeMs: input.logicalTimeMs,
        },
      },
      this.#crypto,
    );
    if (safety.disposition !== "allow") {
      const decision = await createDecision(
        {
          cycleId: input.cycleId,
          status: "safety_rejected",
          signalDigests: eligible.map((item) => item.signalDigest).sort(),
          actionDigests: actions.map((item) => item.actionDigest),
          bundleDigest,
          safetyDecisionDigest: safety.decisionDigest,
          finalityCertificateDigest: null,
          appliedActionDigests: [],
          rollbackReceiptDigests: [],
          reasonCodes: safetyReasonCodes,
          logicalTimeMs: input.logicalTimeMs,
        },
        this.#crypto,
      );
      return this.#commit(
        state,
        retainedSignals,
        eligible,
        decision,
        {},
        input.logicalTimeMs,
      );
    }
    const certificate = await this.#certifyFinality({
      cycleId: input.cycleId,
      bundleDigest,
      actionDigests: actions.map((item) => item.actionDigest),
      signalDigests: eligible.map((item) => item.signalDigest).sort(),
      safetyDecisionDigest: safety.decisionDigest,
      logicalTimeMs: input.logicalTimeMs,
    });
    if (
      !certificate ||
      certificate.proposalDigest !== bundleDigest ||
      !(await this.#verifyFinality({
        certificate,
        bundleDigest,
        logicalTimeMs: input.logicalTimeMs,
      }))
    ) {
      const decision = await createDecision(
        {
          cycleId: input.cycleId,
          status: "finality_unavailable",
          signalDigests: eligible.map((item) => item.signalDigest).sort(),
          actionDigests: actions.map((item) => item.actionDigest),
          bundleDigest,
          safetyDecisionDigest: safety.decisionDigest,
          finalityCertificateDigest: null,
          appliedActionDigests: [],
          rollbackReceiptDigests: [],
          reasonCodes: ["adaptation_finality_unavailable"],
          logicalTimeMs: input.logicalTimeMs,
        },
        this.#crypto,
      );
      return this.#commit(
        state,
        retainedSignals,
        [],
        decision,
        {},
        input.logicalTimeMs,
      );
    }
    await this.#reserveSaga({
      observedStateDigest: state.stateDigest,
      cycleId: input.cycleId,
      currentStateDigest,
      signals: eligible,
      bundleDigest,
      safetyDecisionDigest: safety.decisionDigest,
      certificate,
      actions,
      logicalTimeMs: input.logicalTimeMs,
    });
    return this.#reconcileSaga(input.cycleId);
  }

  async #reserveSaga(input: {
    readonly observedStateDigest: string;
    readonly cycleId: string;
    readonly currentStateDigest: string;
    readonly signals: readonly AutonomousMissionSignalV1[];
    readonly bundleDigest: string;
    readonly safetyDecisionDigest: string;
    readonly certificate: SparseFinalityCertificateV2;
    readonly actions: readonly AutonomousAdaptationActionV1[];
    readonly logicalTimeMs: number;
  }): Promise<AutonomousAdaptationSagaV1> {
    let result: AutonomousAdaptationSagaV1 | null = null;
    await this.#mutateState(input.logicalTimeMs, async (current) => {
      const completed = current.decisions.find(
        (decision) => decision.cycleId === input.cycleId,
      );
      if (completed)
        throw new Error("autonomous adaptation cycle is already completed");
      const existing = current.adaptationSagas.find(
        (saga) => saga.cycleId === input.cycleId,
      );
      if (existing) {
        if (
          existing.bundleDigest !== input.bundleDigest ||
          existing.currentStateDigest !== input.currentStateDigest
        )
          throw new TypeError("autonomous adaptation saga binding changed");
        result = existing;
        return current;
      }
      if (current.adaptationSagas.some((saga) => saga.phase !== "completed"))
        throw new Error(
          "another autonomous adaptation cycle requires reconciliation",
        );
      if (current.stateDigest !== input.observedStateDigest)
        throw new Error(
          "autonomous adaptation state changed before authority reservation",
        );
      const saga = freeze<AutonomousAdaptationSagaV1>({
        cycleId: input.cycleId,
        phase: "prepared",
        currentStateDigest: input.currentStateDigest,
        signals: input.signals,
        signalDigests: input.signals
          .map((signal) => signal.signalDigest)
          .sort(),
        bundleDigest: input.bundleDigest,
        safetyDecisionDigest: input.safetyDecisionDigest,
        certificate: input.certificate,
        actions: input.actions.map((action) => ({
          action,
          phase: "prepared" as const,
          applyReceiptDigest: null,
          rollbackReceiptDigest: null,
        })),
        logicalTimeMs: input.logicalTimeMs,
        decisionDigest: null,
      });
      result = saga;
      return this.#nextState(
        current,
        {
          adaptationSagas: [...current.adaptationSagas, saga],
        },
        input.logicalTimeMs,
      );
    });
    if (!result)
      throw new Error("autonomous adaptation saga reservation failed");
    return result;
  }

  async #reconcileSaga(
    cycleId: string,
  ): Promise<AutonomousAdaptationDecisionV1> {
    for (;;) {
      const state = await this.#load();
      const completed = state.decisions.find(
        (decision) => decision.cycleId === cycleId,
      );
      if (completed) return completed;
      const saga = state.adaptationSagas.find(
        (candidate) => candidate.cycleId === cycleId,
      );
      if (!saga) throw new Error("autonomous adaptation saga is unavailable");
      if (saga.phase === "completed")
        throw new TypeError("completed adaptation saga lacks its decision");
      if (saga.phase === "superseded")
        return this.#completeSaga(saga, "superseded");
      if (saga.phase === "compensating") {
        const target = [...saga.actions]
          .reverse()
          .find((entry) => entry.phase === "applied");
        if (!target) {
          const rollbackDigest = await this.#currentStateDigest();
          digest(rollbackDigest, "currentStateDigest");
          const expectedRollbackDigest =
            saga.actions[0]?.action.rollbackDigest ?? saga.currentStateDigest;
          if (rollbackDigest !== expectedRollbackDigest) {
            await this.#markSagaSuperseded(saga);
            continue;
          }
          return this.#completeSaga(saga, "rolled_back");
        }
        const rollbackIdempotencyKey = `${cycleId}:rollback:${target.action.actionDigest}`;
        const rollbackInput = {
          idempotencyKey: rollbackIdempotencyKey,
          action: target.action,
          appliedReceiptDigest: target.applyReceiptDigest!,
          logicalTimeMs: saga.logicalTimeMs,
        };
        let rollback = await this.#reconcileRollbackAction(rollbackInput);
        if (!rollback) {
          const rollbackPredecessorDigest = await this.#currentStateDigest();
          digest(rollbackPredecessorDigest, "currentStateDigest");
          if (rollbackPredecessorDigest !== target.action.candidateDigest) {
            await this.#markSagaSuperseded(saga);
            continue;
          }
          try {
            rollback = await this.#rollbackAction(rollbackInput);
          } catch {
            rollback = await this.#reconcileRollbackAction(rollbackInput);
            if (!rollback)
              throw new Error("adaptation rollback outcome is unavailable");
          }
        }
        if (
          !(await validRollbackReceipt({
            receipt: rollback,
            idempotencyKey: rollbackIdempotencyKey,
            action: target.action,
            appliedReceiptDigest: target.applyReceiptDigest!,
            logicalTimeMs: saga.logicalTimeMs,
            crypto: this.#crypto,
          })) ||
          !rollback.rolledBack ||
          rollback.resultingDigest !== target.action.rollbackDigest
        )
          throw new TypeError(
            "autonomous adaptation rollback receipt is invalid",
          );
        await this.#updateSagaAction(
          saga,
          target.action.actionDigest,
          "applied",
          {
            phase: "rolled_back",
            rollbackReceiptDigest: rollback.receiptDigest,
          },
        );
        continue;
      }
      const target = saga.actions.find((entry) => entry.phase === "prepared");
      if (!target) {
        const finalDigest = await this.#currentStateDigest();
        digest(finalDigest, "currentStateDigest");
        const expectedFinalDigest = saga.actions.at(-1)?.action.candidateDigest;
        if (!expectedFinalDigest || finalDigest !== expectedFinalDigest) {
          await this.#markSagaSuperseded(saga);
          continue;
        }
        return this.#completeSaga(saga, "applied");
      }
      let receipt: Awaited<
        ReturnType<AutonomousAdaptationActuatorPortV1["apply"]>
      > | null = null;
      const applyIdempotencyKey = `${cycleId}:${target.action.actionDigest}`;
      const applyInput = {
        idempotencyKey: applyIdempotencyKey,
        action: target.action,
        certificate: saga.certificate,
        logicalTimeMs: saga.logicalTimeMs,
      };
      receipt = await this.#reconcileApplyAction(applyInput);
      if (!receipt) {
        const actualPredecessorDigest = await this.#currentStateDigest();
        digest(actualPredecessorDigest, "currentStateDigest");
        if (actualPredecessorDigest !== target.action.predecessorDigest) {
          await this.#markSagaSuperseded(saga);
          continue;
        }
        try {
          receipt = await this.#applyAction({
            idempotencyKey: applyInput.idempotencyKey,
            action: target.action,
            certificate: saga.certificate,
            logicalTimeMs: saga.logicalTimeMs,
          });
        } catch {
          receipt = await this.#reconcileApplyAction(applyInput);
        }
      }
      if (
        !receipt ||
        !(await validApplyReceipt({
          receipt,
          idempotencyKey: applyIdempotencyKey,
          action: target.action,
          certificate: saga.certificate,
          logicalTimeMs: saga.logicalTimeMs,
          crypto: this.#crypto,
        })) ||
        !receipt.applied ||
        receipt.resultingDigest !== target.action.candidateDigest
      ) {
        await this.#markSagaCompensating(saga);
        continue;
      }
      await this.#updateSagaAction(
        saga,
        target.action.actionDigest,
        "prepared",
        {
          phase: "applied",
          applyReceiptDigest: receipt.receiptDigest,
        },
      );
    }
  }

  async #markSagaCompensating(
    observed: AutonomousAdaptationSagaV1,
  ): Promise<void> {
    await this.#mutateState(observed.logicalTimeMs, async (current) => {
      const saga = current.adaptationSagas.find(
        (candidate) => candidate.cycleId === observed.cycleId,
      );
      if (!saga || saga.phase === "completed") return current;
      if (saga.phase === "compensating") return current;
      return this.#replaceSaga(
        current,
        freeze({ ...saga, phase: "compensating" as const }),
        observed.logicalTimeMs,
      );
    });
  }

  async #markSagaSuperseded(
    observed: AutonomousAdaptationSagaV1,
  ): Promise<void> {
    await this.#mutateState(observed.logicalTimeMs, async (current) => {
      const saga = current.adaptationSagas.find(
        (candidate) => candidate.cycleId === observed.cycleId,
      );
      if (!saga || saga.phase === "completed" || saga.phase === "superseded")
        return current;
      return this.#replaceSaga(
        current,
        freeze({ ...saga, phase: "superseded" as const }),
        observed.logicalTimeMs,
      );
    });
  }

  async #updateSagaAction(
    observed: AutonomousAdaptationSagaV1,
    actionDigest: string,
    expectedPhase: AutonomousAdaptationSagaActionV1["phase"],
    patch: Partial<AutonomousAdaptationSagaActionV1>,
  ): Promise<void> {
    await this.#mutateState(observed.logicalTimeMs, async (current) => {
      const saga = current.adaptationSagas.find(
        (candidate) => candidate.cycleId === observed.cycleId,
      );
      if (!saga || saga.phase === "completed") return current;
      const action = saga.actions.find(
        (entry) => entry.action.actionDigest === actionDigest,
      );
      if (!action) throw new TypeError("adaptation saga action is unavailable");
      if (action.phase !== expectedPhase) return current;
      const nextSaga = freeze({
        ...saga,
        actions: saga.actions.map((entry) =>
          entry.action.actionDigest === actionDigest
            ? { ...entry, ...patch }
            : entry,
        ),
      });
      return this.#replaceSaga(current, nextSaga, observed.logicalTimeMs);
    });
  }

  async #completeSaga(
    observed: AutonomousAdaptationSagaV1,
    outcome: "applied" | "rolled_back" | "superseded",
  ): Promise<AutonomousAdaptationDecisionV1> {
    let result: AutonomousAdaptationDecisionV1 | null = null;
    await this.#mutateState(observed.logicalTimeMs, async (current) => {
      const existing = current.decisions.find(
        (decision) => decision.cycleId === observed.cycleId,
      );
      if (existing) {
        result = existing;
        return current;
      }
      const saga = current.adaptationSagas.find(
        (candidate) => candidate.cycleId === observed.cycleId,
      );
      if (!saga || saga.phase === "completed")
        throw new TypeError("adaptation saga completion binding is invalid");
      const appliedEntries = saga.actions.filter(
        (entry) =>
          entry.applyReceiptDigest !== null &&
          (entry.phase === "applied" || entry.phase === "rolled_back"),
      );
      const applied = outcome === "applied";
      if (
        applied
          ? saga.actions.some((entry) => entry.phase !== "applied")
          : outcome === "rolled_back" &&
            saga.actions.some((entry) => entry.phase === "applied")
      )
        throw new TypeError("adaptation saga is not terminal");
      if (outcome === "superseded" && saga.phase !== "superseded")
        throw new TypeError("adaptation saga supersession is not durable");
      const decision = await createDecision(
        {
          cycleId: saga.cycleId,
          status: outcome,
          signalDigests: saga.signalDigests,
          actionDigests: saga.actions.map((entry) => entry.action.actionDigest),
          bundleDigest: saga.bundleDigest,
          safetyDecisionDigest: saga.safetyDecisionDigest,
          finalityCertificateDigest: saga.certificate.certificateDigest,
          appliedActionDigests: appliedEntries.map(
            (entry) => entry.action.actionDigest,
          ),
          rollbackReceiptDigests: saga.actions
            .flatMap((entry) =>
              entry.rollbackReceiptDigest ? [entry.rollbackReceiptDigest] : [],
            )
            .sort(),
          reasonCodes: [
            outcome === "applied"
              ? "bounded_adaptation_applied"
              : outcome === "rolled_back"
                ? "adaptation_application_failed"
                : "adaptation_superseded_by_successor",
          ],
          logicalTimeMs: saga.logicalTimeMs,
        },
        this.#crypto,
      );
      const completedSaga = freeze<AutonomousAdaptationSagaV1>({
        ...saga,
        phase: "completed",
        actions: saga.actions.map((entry) =>
          applied ? { ...entry, phase: "completed" as const } : entry,
        ),
        decisionDigest: decision.decisionDigest,
      });
      result = decision;
      const appliedTimes =
        outcome !== "rolled_back"
          ? Object.fromEntries(
              appliedEntries.map((entry) => [
                entry.action.domain,
                saga.logicalTimeMs,
              ]),
            )
          : {};
      return this.#nextState(
        current,
        {
          retainedSignals: mergeSignals(
            current.retainedSignals,
            saga.signals,
            this.#policy.maximumRetainedSignals,
          ),
          processedSignalDigests: mergeProcessedSignalDigests(
            current.processedSignalDigests,
            saga.signals,
            this.#policy.maximumRetainedSignals,
          ),
          processedSignalWatermarks: mergeProcessedSignalWatermarks(
            current.processedSignalWatermarks,
            saga.signals,
          ),
          domainLastAppliedLogicalMs: {
            ...current.domainLastAppliedLogicalMs,
            ...appliedTimes,
          },
          decisions: [...current.decisions, decision].slice(
            -this.#policy.maximumRetainedDecisions,
          ),
          adaptationSagas: current.adaptationSagas
            .map((candidate) =>
              candidate.cycleId === saga.cycleId ? completedSaga : candidate,
            )
            .slice(-this.#policy.maximumRetainedDecisions),
        },
        saga.logicalTimeMs,
      );
    });
    if (!result)
      throw new Error("autonomous adaptation saga completion failed");
    return result;
  }

  async #mutateState(
    logicalTimeMs: number,
    mutate: (
      current: AutonomousAdaptationStateV1,
    ) => Promise<AutonomousAdaptationStateV1>,
  ): Promise<AutonomousAdaptationStateV1> {
    for (
      let attempt = 0;
      attempt < this.#policy.maximumCommitAttempts;
      attempt += 1
    ) {
      const current = await this.#load();
      if (logicalTimeMs < current.logicalTimeHighWaterMs)
        throw new Error("autonomous adaptation logical time rollback");
      const next = await mutate(current);
      if (next === current) return current;
      if (await this.#saveState(next, current.revision)) return next;
    }
    throw new Error("autonomous adaptation commit contention exhausted");
  }

  #replaceSaga(
    current: AutonomousAdaptationStateV1,
    saga: AutonomousAdaptationSagaV1,
    logicalTimeMs: number,
  ): Promise<AutonomousAdaptationStateV1> {
    return this.#nextState(
      current,
      {
        adaptationSagas: current.adaptationSagas.map((candidate) =>
          candidate.cycleId === saga.cycleId ? saga : candidate,
        ),
      },
      logicalTimeMs,
    );
  }

  #nextState(
    current: AutonomousAdaptationStateV1,
    patch: Partial<AutonomousAdaptationStateV1>,
    logicalTimeMs: number,
  ): Promise<AutonomousAdaptationStateV1> {
    return this.#state({
      ...current,
      ...patch,
      revision: current.revision + 1,
      logicalTimeHighWaterMs: Math.max(
        current.logicalTimeHighWaterMs,
        logicalTimeMs,
      ),
      previousStateDigest: current.stateDigest,
    });
  }

  async #load(): Promise<AutonomousAdaptationStateV1> {
    await this.#verifyPolicy();
    const state = await this.#loadState(this.#runtimeId);
    if (!state)
      throw new Error("autonomous adaptation runtime is not initialized");
    const { stateDigest, ...body } = state;
    if (
      (await collectiveQuorumDigestV1(
        { domain: "autonomous-adaptation-state-v1", body },
        this.#crypto,
      )) !== stateDigest
    )
      throw new TypeError("autonomous adaptation state digest is invalid");
    if (
      state.schemaVersion !== 1 ||
      state.runtimeId !== this.#runtimeId ||
      state.missionId !== this.#missionId
    )
      throw new TypeError("autonomous adaptation state binding is invalid");
    integer(state.revision, "revision", 0, Number.MAX_SAFE_INTEGER);
    integer(
      state.logicalTimeHighWaterMs,
      "logicalTimeHighWaterMs",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    if ((state.revision === 0) !== (state.previousStateDigest === null))
      throw new TypeError("autonomous adaptation state lineage is invalid");
    if (state.previousStateDigest !== null)
      digest(state.previousStateDigest, "previousStateDigest");
    if (
      state.retainedSignals.length > this.#policy.maximumRetainedSignals ||
      state.processedSignalDigests.length >
        this.#policy.maximumRetainedSignals ||
      state.decisions.length > this.#policy.maximumRetainedDecisions ||
      state.adaptationSagas.length >
        this.#policy.maximumRetainedDecisions + 1 ||
      state.processedSignalWatermarks.length > 1_000_000
    )
      throw new RangeError("autonomous adaptation durable capacity exceeded");
    if (
      new Set(state.retainedSignals.map((item) => item.signalDigest)).size !==
        state.retainedSignals.length ||
      new Set(state.decisions.map((item) => item.cycleId)).size !==
        state.decisions.length
    )
      throw new TypeError(
        "autonomous adaptation durable identity is duplicated",
      );
    for (const signal of state.retainedSignals) {
      const valid = await validateSignal(signal, this.#crypto);
      if (
        valid.missionId !== this.#missionId ||
        valid.observedAtLogicalMs > state.logicalTimeHighWaterMs ||
        valid.evidenceDigests.length >
          this.#policy.maximumEvidenceDigestsPerSignal ||
        !(await this.#admitSignal({
          signal: valid,
          issuerInstanceId: valid.sourceInstanceId,
          issuerKeyId: valid.sourceKeyId,
          membershipConfigurationDigest: valid.membershipConfigurationDigest,
          logicalTimeMs: valid.observedAtLogicalMs,
        }))
      )
        throw new TypeError(
          "autonomous adaptation persisted signal is not admitted",
        );
    }
    canonicalDigestList(state.processedSignalDigests, "processedSignalDigests");
    const watermarkKeys = new Set<string>();
    for (const watermark of state.processedSignalWatermarks) {
      identifier(watermark.sourcePeerId, "watermark.sourcePeerId");
      identifier(watermark.sourceInstanceId, "watermark.sourceInstanceId");
      identifier(watermark.sourceKeyId, "watermark.sourceKeyId");
      integer(
        watermark.observedAtLogicalMs,
        "watermark.observedAtLogicalMs",
        0,
        state.logicalTimeHighWaterMs,
      );
      if (watermark.signalDigestsAtLogicalMs.length === 0)
        throw new TypeError(
          "autonomous adaptation watermark signal set is empty",
        );
      canonicalDigestList(
        watermark.signalDigestsAtLogicalMs,
        "watermark.signalDigestsAtLogicalMs",
      );
      const key = signalSourceKey(watermark);
      if (watermarkKeys.has(key))
        throw new TypeError("autonomous adaptation watermark is duplicated");
      watermarkKeys.add(key);
    }
    let incompleteSagas = 0;
    const sagaCycles = new Set<string>();
    for (const saga of state.adaptationSagas) {
      identifier(saga.cycleId, "saga.cycleId");
      if (sagaCycles.has(saga.cycleId))
        throw new TypeError("autonomous adaptation saga is duplicated");
      sagaCycles.add(saga.cycleId);
      if (
        !["prepared", "compensating", "superseded", "completed"].includes(
          saga.phase,
        )
      )
        throw new TypeError("autonomous adaptation saga phase is invalid");
      if (saga.phase !== "completed") incompleteSagas += 1;
      digest(saga.currentStateDigest, "saga.currentStateDigest");
      canonicalDigestList(saga.signalDigests, "saga.signalDigests");
      digest(saga.bundleDigest, "saga.bundleDigest");
      digest(saga.safetyDecisionDigest, "saga.safetyDecisionDigest");
      integer(
        saga.logicalTimeMs,
        "saga.logicalTimeMs",
        0,
        state.logicalTimeHighWaterMs,
      );
      digest(saga.certificate.certificateDigest, "saga.certificateDigest");
      digest(saga.certificate.proposalDigest, "saga.certificateProposalDigest");
      if (saga.certificate.proposalDigest !== saga.bundleDigest)
        throw new TypeError("autonomous adaptation saga certificate changed");
      const validatedSignals = await Promise.all(
        saga.signals.map((signal) => validateSignal(signal, this.#crypto)),
      );
      const signalDigests = validatedSignals
        .map((signal) => signal.signalDigest)
        .sort();
      if (
        signalDigests.length !== saga.signalDigests.length ||
        signalDigests.some(
          (signalDigest, index) => signalDigest !== saga.signalDigests[index],
        )
      )
        throw new TypeError("autonomous adaptation saga signals changed");
      const actionDigests = new Set<string>();
      for (const entry of saga.actions) {
        await validateAction(entry.action, this.#crypto);
        if (actionDigests.has(entry.action.actionDigest))
          throw new TypeError(
            "autonomous adaptation saga action is duplicated",
          );
        actionDigests.add(entry.action.actionDigest);
        if (
          !["prepared", "applied", "rolled_back", "completed"].includes(
            entry.phase,
          )
        )
          throw new TypeError(
            "autonomous adaptation saga action phase is invalid",
          );
        if (
          (entry.applyReceiptDigest === null) !==
          (entry.phase === "prepared")
        )
          throw new TypeError(
            "autonomous adaptation saga apply receipt binding is invalid",
          );
        if (entry.applyReceiptDigest !== null)
          digest(entry.applyReceiptDigest, "saga.applyReceiptDigest");
        if (
          (entry.rollbackReceiptDigest === null) !==
          (entry.phase !== "rolled_back")
        )
          throw new TypeError(
            "autonomous adaptation saga rollback binding is invalid",
          );
        if (entry.rollbackReceiptDigest !== null)
          digest(entry.rollbackReceiptDigest, "saga.rollbackReceiptDigest");
      }
      if ((saga.phase === "completed") !== (saga.decisionDigest !== null))
        throw new TypeError("autonomous adaptation saga completion is invalid");
      if (saga.decisionDigest !== null)
        digest(saga.decisionDigest, "saga.decisionDigest");
    }
    if (incompleteSagas > 1)
      throw new TypeError("multiple autonomous adaptation sagas are active");
    for (const domain of ["mission", "strategy", "role", "team"] as const) {
      const value = state.domainLastAppliedLogicalMs[domain];
      if (value !== null)
        integer(
          value,
          `domainLastAppliedLogicalMs.${domain}`,
          0,
          state.logicalTimeHighWaterMs,
        );
    }
    for (const decision of state.decisions) {
      await validateDecision(decision, this.#crypto);
      if (decision.logicalTimeMs > state.logicalTimeHighWaterMs)
        throw new TypeError(
          "autonomous adaptation decision is ahead of durable time",
        );
    }
    return state;
  }

  async #commit(
    initial: AutonomousAdaptationStateV1,
    retainedSignals: readonly AutonomousMissionSignalV1[],
    processedSignals: readonly AutonomousMissionSignalV1[],
    decision: AutonomousAdaptationDecisionV1,
    appliedTimes: Partial<Record<AutonomousAdaptationDomainV1, number>>,
    logicalTimeMs: number,
  ): Promise<AutonomousAdaptationDecisionV1> {
    let current = initial;
    for (
      let attempt = 0;
      attempt < this.#policy.maximumCommitAttempts;
      attempt += 1
    ) {
      if (current.decisions.some((item) => item.cycleId === decision.cycleId))
        return current.decisions.find(
          (item) => item.cycleId === decision.cycleId,
        )!;
      const next = await this.#state({
        ...current,
        revision: current.revision + 1,
        logicalTimeHighWaterMs: Math.max(
          current.logicalTimeHighWaterMs,
          logicalTimeMs,
        ),
        retainedSignals: mergeSignals(
          current.retainedSignals,
          retainedSignals,
          this.#policy.maximumRetainedSignals,
        ),
        processedSignalDigests: mergeProcessedSignalDigests(
          current.processedSignalDigests,
          processedSignals,
          this.#policy.maximumRetainedSignals,
        ),
        processedSignalWatermarks: mergeProcessedSignalWatermarks(
          current.processedSignalWatermarks,
          processedSignals,
        ),
        domainLastAppliedLogicalMs: {
          ...current.domainLastAppliedLogicalMs,
          ...appliedTimes,
        },
        decisions: [...current.decisions, decision].slice(
          -this.#policy.maximumRetainedDecisions,
        ),
        previousStateDigest: current.stateDigest,
      });
      if (await this.#saveState(next, current.revision)) return decision;
      current = await this.#load();
    }
    throw new Error("autonomous adaptation commit contention exhausted");
  }

  async #state(
    input: Omit<AutonomousAdaptationStateV1, "stateDigest">,
  ): Promise<AutonomousAdaptationStateV1> {
    const { stateDigest: _stale, ...body } =
      input as AutonomousAdaptationStateV1;
    return freeze({
      ...body,
      stateDigest: await collectiveQuorumDigestV1(
        { domain: "autonomous-adaptation-state-v1", body },
        this.#crypto,
      ),
    });
  }

  #verifyPolicy(): Promise<AutonomousAdaptationPolicyV1> {
    this.#policyVerification ??= verifyAutonomousAdaptationPolicyV1(
      this.#policy,
      this.#crypto,
    );
    return this.#policyVerification;
  }
}

/** Nominal check for the module-owned autonomous adaptation control surface. */
export function isAutonomousAdaptationRuntimeV1(
  value: unknown,
): value is AutonomousAdaptationRuntimeV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    autonomousAdaptationRuntimeInvokersV1.has(value)
  );
}

export async function createAutonomousMissionSignalV1(
  input: Omit<AutonomousMissionSignalV1, "schemaVersion" | "signalDigest">,
  crypto?: Crypto,
): Promise<AutonomousMissionSignalV1> {
  const body = { schemaVersion: 1 as const, ...input };
  validateSignalBody(body);
  return freeze({
    ...body,
    signalDigest: await collectiveQuorumDigestV1(
      { domain: "autonomous-mission-signal-v1", body },
      crypto,
    ),
  });
}

export async function createAutonomousAdaptationActionV1(
  input: Omit<AutonomousAdaptationActionV1, "schemaVersion" | "actionDigest">,
  crypto?: Crypto,
): Promise<AutonomousAdaptationActionV1> {
  const body = { schemaVersion: 1 as const, ...input };
  validateActionBody(body);
  return freeze({
    ...body,
    actionDigest: await collectiveQuorumDigestV1(
      { domain: "autonomous-adaptation-action-v1", body },
      crypto,
    ),
  });
}

async function validateSignal(
  input: AutonomousMissionSignalV1,
  crypto?: Crypto,
): Promise<AutonomousMissionSignalV1> {
  const { signalDigest, schemaVersion: _version, ...body } = input;
  const rebuilt = await createAutonomousMissionSignalV1(body, crypto);
  if (rebuilt.signalDigest !== signalDigest)
    throw new TypeError("autonomous mission signal digest is invalid");
  return rebuilt;
}

async function validateAction(
  input: AutonomousAdaptationActionV1,
  crypto?: Crypto,
): Promise<AutonomousAdaptationActionV1> {
  const { actionDigest, schemaVersion: _version, ...body } = input;
  const rebuilt = await createAutonomousAdaptationActionV1(body, crypto);
  if (rebuilt.actionDigest !== actionDigest)
    throw new TypeError("autonomous adaptation action digest is invalid");
  return rebuilt;
}

export function validateAutonomousAdaptationPolicyV1(
  input: AutonomousAdaptationPolicyV1,
): AutonomousAdaptationPolicyV1 {
  if (!input || input.schemaVersion !== 1)
    throw new TypeError("autonomous adaptation policy schema is invalid");
  identifier(input.policyId, "policyId");
  integer(input.policyVersion, "policyVersion", 1, Number.MAX_SAFE_INTEGER);
  integer(
    input.minimumSeverityBasisPoints,
    "minimumSeverityBasisPoints",
    0,
    10_000,
  );
  integer(
    input.minimumConfidenceBasisPoints,
    "minimumConfidenceBasisPoints",
    0,
    10_000,
  );
  integer(
    input.minimumIndependentSources,
    "minimumIndependentSources",
    1,
    100_000,
  );
  integer(
    input.observationWindowMs,
    "observationWindowMs",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  for (const domain of ["mission", "strategy", "role", "team"] as const)
    integer(
      input.domainCooldownMs[domain],
      `domainCooldownMs.${domain}`,
      0,
      Number.MAX_SAFE_INTEGER,
    );
  integer(input.maximumActionsPerCycle, "maximumActionsPerCycle", 1, 4);
  integer(
    input.maximumEvidenceDigestsPerSignal,
    "maximumEvidenceDigestsPerSignal",
    0,
    10_000,
  );
  integer(input.maximumRetainedSignals, "maximumRetainedSignals", 16, 100_000);
  integer(
    input.maximumRetainedDecisions,
    "maximumRetainedDecisions",
    1,
    100_000,
  );
  integer(input.maximumCommitAttempts, "maximumCommitAttempts", 1, 64);
  digest(input.policyDigest, "policyDigest");
  return freeze(input);
}

export async function createAutonomousAdaptationPolicyV1(
  input: Omit<AutonomousAdaptationPolicyV1, "schemaVersion" | "policyDigest">,
  crypto?: Crypto,
): Promise<AutonomousAdaptationPolicyV1> {
  const provisional = {
    schemaVersion: 1 as const,
    ...input,
    policyDigest: `sha256:${"0".repeat(64)}`,
  };
  validateAutonomousAdaptationPolicyV1(provisional);
  const { policyDigest: _digest, ...body } = provisional;
  return freeze({
    ...body,
    policyDigest: await collectiveQuorumDigestV1(
      {
        domain: "autonomous-adaptation-policy-v1",
        body,
      },
      crypto,
    ),
  });
}

export async function verifyAutonomousAdaptationPolicyV1(
  input: AutonomousAdaptationPolicyV1,
  crypto?: Crypto,
): Promise<AutonomousAdaptationPolicyV1> {
  validateAutonomousAdaptationPolicyV1(input);
  const { schemaVersion: _version, policyDigest, ...body } = input;
  const rebuilt = await createAutonomousAdaptationPolicyV1(body, crypto);
  if (rebuilt.policyDigest !== policyDigest)
    throw new TypeError("autonomous adaptation policy digest is invalid");
  return rebuilt;
}

async function validSignals(
  messages: readonly DistributedCollectiveMessageV1[],
  missionId: string,
  maximumEvidenceDigestsPerSignal: number,
  admit: AutonomousAdaptationSignalAdmissionPortV1["admit"],
  crypto?: Crypto,
): Promise<readonly AutonomousMissionSignalV1[]> {
  const result: AutonomousMissionSignalV1[] = [];
  for (const message of messages) {
    try {
      const signal = await validateSignal(
        message.payload as AutonomousMissionSignalV1,
        crypto,
      );
      if (
        signal.missionId === missionId &&
        signal.sourcePeerId === message.issuerPeerId &&
        signal.sourceInstanceId === message.issuerInstanceId &&
        signal.sourceKeyId === message.issuerKeyId &&
        signal.membershipConfigurationDigest ===
          message.membershipConfigurationDigest &&
        signal.observedAtLogicalMs === message.logicalTimeMs &&
        signal.evidenceDigests.length <= maximumEvidenceDigestsPerSignal &&
        (await admit({
          signal,
          issuerInstanceId: message.issuerInstanceId,
          issuerKeyId: message.issuerKeyId,
          membershipConfigurationDigest: message.membershipConfigurationDigest,
          logicalTimeMs: message.logicalTimeMs,
        }))
      )
        result.push(signal);
    } catch {
      continue;
    }
  }
  return result;
}

function mergeSignals(
  current: readonly AutonomousMissionSignalV1[],
  discovered: readonly AutonomousMissionSignalV1[],
  maximum: number,
): readonly AutonomousMissionSignalV1[] {
  const byDigest = new Map(
    [...current, ...discovered].map((signal) => [signal.signalDigest, signal]),
  );
  return [...byDigest.values()]
    .sort(
      (left, right) =>
        left.observedAtLogicalMs - right.observedAtLogicalMs ||
        left.signalDigest.localeCompare(right.signalDigest),
    )
    .slice(-maximum);
}

function signalSourceKey(input: {
  readonly sourcePeerId: string;
  readonly sourceInstanceId: string;
  readonly sourceKeyId: string;
}): string {
  return `${input.sourcePeerId}\u0000${input.sourceInstanceId}\u0000${input.sourceKeyId}`;
}

function signalAtOrBeforeProcessedWatermark(
  signal: AutonomousMissionSignalV1,
  watermarks: readonly AutonomousAdaptationProcessedSignalWatermarkV1[],
): boolean {
  const key = signalSourceKey(signal);
  const watermark = watermarks.find(
    (candidate) => signalSourceKey(candidate) === key,
  );
  return Boolean(
    watermark &&
    (signal.observedAtLogicalMs < watermark.observedAtLogicalMs ||
      (signal.observedAtLogicalMs === watermark.observedAtLogicalMs &&
        watermark.signalDigestsAtLogicalMs.includes(signal.signalDigest))),
  );
}

function mergeProcessedSignalWatermarks(
  current: readonly AutonomousAdaptationProcessedSignalWatermarkV1[],
  processed: readonly AutonomousMissionSignalV1[],
): readonly AutonomousAdaptationProcessedSignalWatermarkV1[] {
  const bySource = new Map(
    current.map((item) => [signalSourceKey(item), item]),
  );
  for (const signal of processed) {
    const key = signalSourceKey(signal);
    const retained = bySource.get(key);
    if (!retained || retained.observedAtLogicalMs < signal.observedAtLogicalMs)
      bySource.set(key, {
        sourcePeerId: signal.sourcePeerId,
        sourceInstanceId: signal.sourceInstanceId,
        sourceKeyId: signal.sourceKeyId,
        observedAtLogicalMs: signal.observedAtLogicalMs,
        signalDigestsAtLogicalMs: [signal.signalDigest],
      });
    else if (retained.observedAtLogicalMs === signal.observedAtLogicalMs)
      bySource.set(key, {
        ...retained,
        signalDigestsAtLogicalMs: [
          ...new Set([
            ...retained.signalDigestsAtLogicalMs,
            signal.signalDigest,
          ]),
        ].sort(),
      });
  }
  return freeze(
    [...bySource.values()].sort((left, right) =>
      signalSourceKey(left).localeCompare(signalSourceKey(right)),
    ),
  );
}

function mergeProcessedSignalDigests(
  current: readonly string[],
  processed: readonly AutonomousMissionSignalV1[],
  maximum: number,
): readonly string[] {
  const recent = [...processed]
    .sort(
      (left, right) =>
        right.observedAtLogicalMs - left.observedAtLogicalMs ||
        left.signalDigest.localeCompare(right.signalDigest),
    )
    .map((signal) => signal.signalDigest);
  return [...new Set([...recent, ...current])].slice(0, maximum).sort();
}

async function createDecision(
  body: Omit<
    AutonomousAdaptationDecisionV1,
    "schemaVersion" | "decisionDigest"
  >,
  crypto?: Crypto,
): Promise<AutonomousAdaptationDecisionV1> {
  const value = { schemaVersion: 1 as const, ...body };
  validateDecisionBody(value);
  return freeze({
    ...value,
    decisionDigest: await collectiveQuorumDigestV1(
      { domain: "autonomous-adaptation-decision-v1", body: value },
      crypto,
    ),
  });
}

async function validateDecision(
  input: AutonomousAdaptationDecisionV1,
  crypto?: Crypto,
): Promise<AutonomousAdaptationDecisionV1> {
  const { decisionDigest, ...body } = input;
  validateDecisionBody(body);
  if (
    (await collectiveQuorumDigestV1(
      { domain: "autonomous-adaptation-decision-v1", body },
      crypto,
    )) !== decisionDigest
  )
    throw new TypeError("autonomous adaptation decision digest is invalid");
  return input;
}

function validateDecisionBody(
  input: Omit<AutonomousAdaptationDecisionV1, "decisionDigest">,
): void {
  if (input.schemaVersion !== 1)
    throw new TypeError("autonomous adaptation decision schema is invalid");
  identifier(input.cycleId, "decision.cycleId");
  if (
    ![
      "idle",
      "safety_rejected",
      "finality_unavailable",
      "applied",
      "rolled_back",
      "superseded",
    ].includes(input.status)
  )
    throw new TypeError("autonomous adaptation decision status is invalid");
  for (const [label, values] of Object.entries({
    signalDigests: input.signalDigests,
    actionDigests: input.actionDigests,
    appliedActionDigests: input.appliedActionDigests,
    rollbackReceiptDigests: input.rollbackReceiptDigests,
  })) {
    if (
      !Array.isArray(values) ||
      values.length > 100_000 ||
      new Set(values).size !== values.length
    )
      throw new TypeError(`${label} is invalid`);
    values.forEach((item) => digest(item, label));
  }
  for (const [label, value] of Object.entries({
    bundleDigest: input.bundleDigest,
    safetyDecisionDigest: input.safetyDecisionDigest,
    finalityCertificateDigest: input.finalityCertificateDigest,
  }))
    if (value !== null) digest(value, label);
  canonicalReasonCodes(input.reasonCodes, "decision.reasonCodes");
  integer(
    input.logicalTimeMs,
    "decision.logicalTimeMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
}

function validateSignalBody(
  input: Omit<AutonomousMissionSignalV1, "signalDigest">,
): void {
  if (input.schemaVersion !== 1)
    throw new TypeError("autonomous mission signal schema is invalid");
  identifier(input.signalId, "signalId");
  identifier(input.missionId, "missionId");
  identifier(input.sourcePeerId, "sourcePeerId");
  identifier(input.sourceInstanceId, "sourceInstanceId");
  identifier(input.sourceKeyId, "sourceKeyId");
  digest(input.membershipConfigurationDigest, "membershipConfigurationDigest");
  identifier(input.sourceIndependenceGroupId, "sourceIndependenceGroupId");
  if (
    ![
      "objective_progress",
      "semantic_drift",
      "execution_failure",
      "peer_unavailable",
      "resource_pressure",
      "environment_change",
      "safety_intervention",
    ].includes(input.kind)
  )
    throw new TypeError("autonomous mission signal kind is invalid");
  integer(input.severityBasisPoints, "severityBasisPoints", 0, 10_000);
  integer(input.confidenceBasisPoints, "confidenceBasisPoints", 0, 10_000);
  digest(input.subjectDigest, "subjectDigest");
  canonicalDigests(input.evidenceDigests, "evidenceDigests");
  integer(
    input.observedAtLogicalMs,
    "observedAtLogicalMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
}

function validateActionBody(
  input: Omit<AutonomousAdaptationActionV1, "actionDigest">,
): void {
  if (input.schemaVersion !== 1)
    throw new TypeError("autonomous adaptation action schema is invalid");
  identifier(input.actionId, "actionId");
  if (!["mission", "strategy", "role", "team"].includes(input.domain))
    throw new TypeError("adaptation domain is invalid");
  identifier(input.subjectId, "subjectId");
  digest(input.predecessorDigest, "predecessorDigest");
  digest(input.candidateDigest, "candidateDigest");
  digest(input.rollbackDigest, "rollbackDigest");
  digest(input.authorityCeilingDigest, "authorityCeilingDigest");
  canonicalDigests(input.evidenceDigests, "evidenceDigests");
  integer(
    input.expectedBenefitBasisPoints,
    "expectedBenefitBasisPoints",
    0,
    10_000,
  );
  integer(input.maximumRiskBasisPoints, "maximumRiskBasisPoints", 0, 10_000);
}

function canonicalDigests(values: readonly string[], label: string): void {
  if (!Array.isArray(values) || values.length > 100_000)
    throw new TypeError(`${label} is invalid`);
  values.forEach((item) => digest(item, label));
  if (
    new Set(values).size !== values.length ||
    values.some((item, index) => index > 0 && values[index - 1] > item)
  )
    throw new TypeError(`${label} must be canonical and unique`);
}

function canonicalDigestList(
  values: readonly string[],
  label: string,
): readonly string[] {
  canonicalDigests(values, label);
  return [...values];
}

function canonicalReasonCodes(
  values: readonly string[],
  label: string,
): readonly string[] {
  if (
    !Array.isArray(values) ||
    values.length > 1_024 ||
    values.some(
      (item) =>
        typeof item !== "string" ||
        !/^[a-z0-9][a-z0-9_.:-]{0,127}$/u.test(item),
    )
  )
    throw new TypeError(`${label} is invalid`);
  const result = [...new Set(values)].sort();
  if (
    result.length !== values.length ||
    result.some((item, index) => item !== values[index])
  )
    throw new TypeError(`${label} must be canonical and unique`);
  return result;
}

async function validApplyReceipt(input: {
  readonly receipt: {
    readonly applied: boolean;
    readonly resultingDigest: string;
    readonly receiptDigest: string;
  };
  readonly idempotencyKey: string;
  readonly action: AutonomousAdaptationActionV1;
  readonly certificate: SparseFinalityCertificateV2;
  readonly logicalTimeMs: number;
  readonly crypto?: Crypto;
}): Promise<boolean> {
  if (typeof input.receipt?.applied !== "boolean") return false;
  try {
    digest(input.receipt.resultingDigest, "adaptationApplyResultingDigest");
    digest(input.receipt.receiptDigest, "adaptationApplyReceiptDigest");
  } catch {
    return false;
  }
  return (
    input.receipt.receiptDigest ===
    (await collectiveQuorumDigestV1(
      {
        domain: "autonomous-adaptation-apply-receipt-v1",
        body: {
          idempotencyKey: input.idempotencyKey,
          actionDigest: input.action.actionDigest,
          finalityCertificateDigest: input.certificate.certificateDigest,
          applied: input.receipt.applied,
          resultingDigest: input.receipt.resultingDigest,
          logicalTimeMs: input.logicalTimeMs,
        },
      },
      input.crypto,
    ))
  );
}

async function validRollbackReceipt(input: {
  readonly receipt: {
    readonly rolledBack: boolean;
    readonly resultingDigest: string;
    readonly receiptDigest: string;
  };
  readonly idempotencyKey: string;
  readonly action: AutonomousAdaptationActionV1;
  readonly appliedReceiptDigest: string;
  readonly logicalTimeMs: number;
  readonly crypto?: Crypto;
}): Promise<boolean> {
  if (typeof input.receipt?.rolledBack !== "boolean") return false;
  try {
    digest(input.receipt.resultingDigest, "adaptationRollbackResultingDigest");
    digest(input.receipt.receiptDigest, "adaptationRollbackReceiptDigest");
  } catch {
    return false;
  }
  return (
    input.receipt.receiptDigest ===
    (await collectiveQuorumDigestV1(
      {
        domain: "autonomous-adaptation-rollback-receipt-v1",
        body: {
          idempotencyKey: input.idempotencyKey,
          actionDigest: input.action.actionDigest,
          appliedReceiptDigest: input.appliedReceiptDigest,
          rolledBack: input.receipt.rolledBack,
          resultingDigest: input.receipt.resultingDigest,
          logicalTimeMs: input.logicalTimeMs,
        },
      },
      input.crypto,
    ))
  );
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u.test(value)
  )
    throw new TypeError(`${label} is invalid`);
}
function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
}
function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  )
    throw new RangeError(`${label} is invalid`);
  return value as number;
}
function immutableMethod<T extends (...args: never[]) => unknown>(
  value: T,
): PropertyDescriptor {
  return {
    value,
    writable: false,
    configurable: false,
    enumerable: false,
  };
}
function captureDigestCrypto(configuredCrypto: Crypto | undefined): Crypto {
  const source = configuredCrypto ?? globalThis.crypto;
  const subtle = source?.subtle;
  const digestMethod = subtle?.digest;
  if (!source || !subtle || typeof digestMethod !== "function")
    throw new TypeError("autonomous adaptation digest crypto is required");
  return Object.freeze({
    subtle: Object.freeze({ digest: digestMethod.bind(subtle) }),
  }) as unknown as Crypto;
}
function captureMethod<T extends (...args: never[]) => unknown>(
  target: unknown,
  methodName: string,
  label: string,
): T {
  if (
    (typeof target !== "object" && typeof target !== "function") ||
    target === null
  )
    throw new TypeError(`${label} is required`);
  const method = Reflect.get(target, methodName) as unknown;
  if (typeof method !== "function") throw new TypeError(`${label} is required`);
  return method.bind(target) as T;
}
function freeze<T>(value: T): T {
  const clone = structuredClone(value);
  const visit = (item: unknown): void => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return;
    for (const child of Object.values(item as Record<string, unknown>))
      visit(child);
    Object.freeze(item);
  };
  visit(clone);
  return clone;
}
