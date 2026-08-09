import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import type {
  CompromiseRecoveryExecutionGateV1,
  CompromiseRecoveryExclusionPortV1,
  CompromiseRecoveryRequestV1,
  CompromiseRecoveryRuntimeOptionsV1,
  CompromiseRecoveryScopeV1,
  CompromiseRecoveryStateV1,
  CompromiseRecoveryVerdictCertificateV1,
} from "./compromise-aware-recovery-contracts.js";
import {
  createCompromiseRecoveryFencingPortV1,
  createCompromiseRecoveryLifecycleExclusionPortV1,
  type CompromiseRecoveryAssignmentFenceInstallerV1,
  type CompromiseRecoveryPeerLifecyclePortV1,
  type CompromiseRecoveryTelemetryPortV1,
} from "./compromise-aware-recovery-adapters.js";
import {
  CompromiseAwareRecoveryRuntimeV1,
  invokeCompromiseAwareRecoveryGateExecutionV1,
  invokeCompromiseAwareRecoveryLoadV1,
  invokeCompromiseAwareRecoveryRunToTerminalV1,
  invokeCompromiseAwareRecoverySubmitV1,
  isCompromiseAwareRecoveryRuntimeV1,
} from "./compromise-aware-recovery-runtime.js";
import {
  compromiseRecoveryDigestV1,
  sameCompromiseRecoveryScopeV1,
} from "./compromise-aware-recovery-validation.js";

export const AUTONOMOUS_COMPROMISE_RECOVERY_COORDINATOR_FORMAT_V1 =
  "application/vnd.agentplat.autonomous-compromise-recovery-coordinator.v1+json" as const;

export interface AutonomousCompromiseRecoveryScopeV1 {
  readonly tenantId: string;
  readonly meshId: string;
  readonly missionIntentId: string;
}

/**
 * Durable, at-least-once source of independently certified exclusion verdicts.
 * Raw detector output must remain behind this boundary. Every unacknowledged
 * verdict must be redelivered, and acknowledgement must be idempotent by
 * consumer and certificate digest. A retained saga may finish while another
 * verdict is at the head of a delivery, so acknowledgement must also accept a
 * certificate delivered to that consumer in an earlier pull.
 */
export interface CompromiseRecoveryCertifiedVerdictSourceV1 {
  pull(input: {
    readonly consumerId: string;
    readonly scope: AutonomousCompromiseRecoveryScopeV1;
    readonly logicalTimeMs: number;
    readonly maximumCount: number;
  }): Promise<{
    readonly verdicts: readonly CompromiseRecoveryVerdictCertificateV1[];
    readonly hasMore: boolean;
  }>;
  acknowledge(input: {
    readonly consumerId: string;
    readonly certificateDigest: PlanningDigestV1;
    readonly terminalStateDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
  }): Promise<void>;
}

/** Resolves the durable, scope-bound saga; it does not create recovery authority. */
export interface CompromiseRecoveryRuntimeRegistryV1 {
  resolve(input: {
    readonly scope: CompromiseRecoveryScopeV1;
    readonly logicalTimeMs: number;
  }): Promise<CompromiseAwareRecoveryRuntimeV1 | null>;
}

/** Authenticates that a full recovery scope is locally configured. */
export interface CompromiseRecoveryScopeAdmissionPortV1 {
  admit(input: {
    readonly scope: CompromiseRecoveryScopeV1;
    readonly certificateDigest: PlanningDigestV1 | null;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
}

export interface AutonomousCompromiseRecoveryCoordinatorStateV1 {
  readonly format: typeof AUTONOMOUS_COMPROMISE_RECOVERY_COORDINATOR_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: string;
  readonly consumerId: string;
  readonly scope: AutonomousCompromiseRecoveryScopeV1;
  readonly policyDigest: PlanningDigestV1;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly admittedScopes: readonly CompromiseRecoveryScopeV1[];
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

/**
 * Durable monotonic CAS. Production implementations must prevent rollback of
 * both logical time and the retained scope set across process and backup loss.
 */
export interface AutonomousCompromiseRecoveryCoordinatorStoreV1 {
  load(
    stateKey: string,
  ): Promise<AutonomousCompromiseRecoveryCoordinatorStateV1 | null>;
  save(input: {
    readonly state: AutonomousCompromiseRecoveryCoordinatorStateV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean>;
}

export interface LifecycleBoundCompromiseRecoveryRuntimeEntryV1 extends Omit<
  CompromiseRecoveryRuntimeOptionsV1,
  "scope" | "exclusion" | "fencing"
> {
  readonly scope: CompromiseRecoveryScopeV1;
  readonly sparseExclusion: CompromiseRecoveryExclusionPortV1;
}

interface BoundedRecoveryRegistryInvokersV1 {
  readonly lifecycle: object;
  readonly assignmentAuthority: object;
  admit(
    input: Parameters<CompromiseRecoveryScopeAdmissionPortV1["admit"]>[0],
  ): ReturnType<CompromiseRecoveryScopeAdmissionPortV1["admit"]>;
  resolve(
    input: Parameters<CompromiseRecoveryRuntimeRegistryV1["resolve"]>[0],
  ): ReturnType<CompromiseRecoveryRuntimeRegistryV1["resolve"]>;
}

const boundedRecoveryRegistryInvokersV1 = new WeakMap<
  object,
  BoundedRecoveryRegistryInvokersV1
>();

/**
 * Fixed-capacity registry that constructs every saga with the same governed
 * lifecycle and assignment-fence authority. Unknown scopes are never created
 * in response to inbox data.
 */
export class BoundedLifecycleCompromiseRecoveryRuntimeRegistryV1
  implements
    CompromiseRecoveryRuntimeRegistryV1,
    CompromiseRecoveryScopeAdmissionPortV1
{
  readonly #runtimes = new Map<string, CompromiseAwareRecoveryRuntimeV1>();

  constructor(options: {
    readonly lifecycle: CompromiseRecoveryPeerLifecyclePortV1;
    readonly assignmentAuthority: CompromiseRecoveryAssignmentFenceInstallerV1;
    readonly entries: readonly LifecycleBoundCompromiseRecoveryRuntimeEntryV1[];
    readonly maximumScopes: number;
    readonly telemetry?: CompromiseRecoveryTelemetryPortV1;
    readonly retirementReasonCode?: string;
  }) {
    if (!options || typeof options !== "object")
      fail("bounded recovery registry options are required");
    const lifecycle = options.lifecycle;
    const assignmentAuthority = options.assignmentAuthority;
    const configuredEntries = options.entries;
    const configuredMaximumScopes = options.maximumScopes;
    const telemetry = options.telemetry;
    const retirementReasonCode = options.retirementReasonCode;
    const retirePeer = lifecycle?.retirePeer;
    const installFence = assignmentAuthority?.install;
    const recordTelemetry = telemetry?.record;
    if (
      !lifecycle ||
      typeof retirePeer !== "function"
    )
      fail("governed recovery lifecycle is required");
    if (
      !assignmentAuthority ||
      typeof installFence !== "function"
    )
      fail("recovery assignment authority is required");
    const maximumScopes = boundedInteger(
      configuredMaximumScopes,
      "maximumScopes",
      1,
      4_096,
    );
    if (!Array.isArray(configuredEntries))
      fail("bounded recovery runtime entries are invalid");
    const entries = [...configuredEntries];
    if (entries.length > maximumScopes)
      fail("bounded recovery runtime entries are invalid");
    const lifecyclePort: CompromiseRecoveryPeerLifecyclePortV1 = Object.freeze({
      retirePeer: (
        input: Parameters<CompromiseRecoveryPeerLifecyclePortV1["retirePeer"]>[0],
      ) => retirePeer.call(lifecycle, input),
    });
    const assignmentPort: CompromiseRecoveryAssignmentFenceInstallerV1 =
      Object.freeze({
        install: (
          input: Parameters<CompromiseRecoveryAssignmentFenceInstallerV1["install"]>[0],
        ) => installFence.call(assignmentAuthority, input),
      });
    const telemetryPort =
      telemetry && typeof recordTelemetry === "function"
        ? Object.freeze({
            record: (input: Parameters<CompromiseRecoveryTelemetryPortV1["record"]>[0]) =>
              recordTelemetry.call(telemetry, input),
          })
        : undefined;
    for (const configuredEntry of entries) {
      const entry = { ...configuredEntry };
      const key = recoveryScopeKey(entry?.scope);
      if (this.#runtimes.has(key))
        fail("bounded recovery runtime scope is duplicated");
      const runtime = new CompromiseAwareRecoveryRuntimeV1({
        ...entry,
        exclusion: createCompromiseRecoveryLifecycleExclusionPortV1({
          exclusion: entry.sparseExclusion,
          lifecycle: lifecyclePort,
          telemetry: telemetryPort,
          reasonCode: retirementReasonCode,
        }),
        fencing: createCompromiseRecoveryFencingPortV1(assignmentPort),
      });
      this.#runtimes.set(key, runtime);
    }
    boundedRecoveryRegistryInvokersV1.set(
      this,
      Object.freeze({
        lifecycle: lifecycle as object,
        assignmentAuthority: assignmentAuthority as object,
        admit: (
          input: Parameters<CompromiseRecoveryScopeAdmissionPortV1["admit"]>[0],
        ) => this.#admit(input),
        resolve: (
          input: Parameters<CompromiseRecoveryRuntimeRegistryV1["resolve"]>[0],
        ) => this.#resolve(input),
      }),
    );
  }

  async admit(input: {
    readonly scope: CompromiseRecoveryScopeV1;
    readonly certificateDigest: PlanningDigestV1 | null;
    readonly logicalTimeMs: number;
  }): Promise<boolean> {
    return invokeBoundedRecoveryRegistryAdmitV1(this, input);
  }

  async #admit(
    input: Parameters<CompromiseRecoveryScopeAdmissionPortV1["admit"]>[0],
  ): Promise<boolean> {
    if (input.certificateDigest !== null)
      planningDigest(input.certificateDigest, "certificateDigest");
    logicalTime(input.logicalTimeMs);
    return this.#runtimes.has(recoveryScopeKey(input.scope));
  }

  async resolve(input: {
    readonly scope: CompromiseRecoveryScopeV1;
    readonly logicalTimeMs: number;
  }): Promise<CompromiseAwareRecoveryRuntimeV1 | null> {
    return invokeBoundedRecoveryRegistryResolveV1(this, input);
  }

  async #resolve(
    input: Parameters<CompromiseRecoveryRuntimeRegistryV1["resolve"]>[0],
  ): Promise<CompromiseAwareRecoveryRuntimeV1 | null> {
    logicalTime(input.logicalTimeMs);
    return this.#runtimes.get(recoveryScopeKey(input.scope)) ?? null;
  }
}

export function isBoundedLifecycleCompromiseRecoveryRuntimeRegistryV1(
  value: unknown,
): value is BoundedLifecycleCompromiseRecoveryRuntimeRegistryV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    boundedRecoveryRegistryInvokersV1.has(value)
  );
}

export function invokeBoundedRecoveryRegistryAdmitV1(
  registry: BoundedLifecycleCompromiseRecoveryRuntimeRegistryV1,
  input: Parameters<CompromiseRecoveryScopeAdmissionPortV1["admit"]>[0],
): ReturnType<CompromiseRecoveryScopeAdmissionPortV1["admit"]> {
  return boundedRegistryInvokers(registry).admit(input);
}

export function invokeBoundedRecoveryRegistryResolveV1(
  registry: BoundedLifecycleCompromiseRecoveryRuntimeRegistryV1,
  input: Parameters<CompromiseRecoveryRuntimeRegistryV1["resolve"]>[0],
): ReturnType<CompromiseRecoveryRuntimeRegistryV1["resolve"]> {
  return boundedRegistryInvokers(registry).resolve(input);
}

function boundedRegistryInvokers(
  registry: BoundedLifecycleCompromiseRecoveryRuntimeRegistryV1,
): BoundedRecoveryRegistryInvokersV1 {
  const invokers = boundedRecoveryRegistryInvokersV1.get(registry);
  if (!invokers)
    fail("concrete bounded compromise recovery registry is required");
  return invokers;
}

/**
 * Authority-aware planning boundary for a certified incident. Implementations
 * resolve current assignment, checkpoint, eligible takeover candidates and
 * witness policy from authoritative repositories. Returning `null` leaves the
 * verdict unacknowledged and ordinary node progress fail-closed.
 */
export interface CompromiseRecoveryRequestPlannerV1 {
  deriveRequest(input: {
    readonly verdict: CompromiseRecoveryVerdictCertificateV1;
    readonly recoveryState: CompromiseRecoveryStateV1;
    readonly logicalTimeMs: number;
  }): Promise<CompromiseRecoveryRequestV1 | null>;
}

export interface AutonomousCompromiseRecoveryPolicyV1 {
  /** Stable digest of the complete coordinator policy and admission contract. */
  readonly policyDigest: PlanningDigestV1;
  /** Maximum certified verdicts pulled and inspected in one tick. */
  readonly maximumCertificatesPerTick: number;
  /** Maximum saga transitions attempted for one incident in one tick. */
  readonly maximumSagaStepsPerIncident: number;
  /** Durable mission-wide ceiling; admitted scope identities are never evicted. */
  readonly maximumScopes: number;
  /** Maximum coordinator CAS retries for one logical transition. */
  readonly maximumCommitAttempts: number;
}

export type AutonomousCompromiseRecoveryStatusV1 =
  | "ready"
  | "recovered"
  | "request_unavailable"
  | "runtime_unavailable"
  | "scope_unavailable"
  | "scope_capacity_exhausted"
  | "in_progress"
  | "blocked"
  | "budget_exhausted";

export interface AutonomousCompromiseRecoveryTickResultV1 {
  readonly schemaVersion: 1;
  readonly status: AutonomousCompromiseRecoveryStatusV1;
  /**
   * False for every unresolved incident and for any tick that observed a
   * verdict. A subsequent empty, current-generation tick is required before
   * ordinary work resumes.
   */
  readonly nodeProgressAllowed: boolean;
  readonly reasonCode: string;
  readonly inspectedCertificateDigests: readonly PlanningDigestV1[];
  readonly terminalStateDigests: readonly PlanningDigestV1[];
}

export class AutonomousCompromiseRecoveryNotReadyErrorV1 extends Error {
  constructor(readonly result: AutonomousCompromiseRecoveryTickResultV1) {
    super(
      `autonomous compromise recovery withheld node progress: ${result.reasonCode}`,
    );
    this.name = "AutonomousCompromiseRecoveryNotReadyErrorV1";
  }
}

type AutonomousCompromiseRecoveryGateInputV1 = {
  readonly scope: CompromiseRecoveryScopeV1;
  readonly peerId: string;
  readonly assignmentEpoch: number;
  readonly fencingToken: string;
  readonly logicalTimeMs: number;
};

type AutonomousCompromiseRecoveryTickInputV1 = {
  readonly logicalTimeMs: number;
};

interface AutonomousCompromiseRecoveryInvokersV1 {
  readonly scope: AutonomousCompromiseRecoveryScopeV1;
  isBoundToLifecycle(lifecycle: object): boolean;
  isBoundToAssignmentAuthority(authority: object): boolean;
  hasClosedRegistryPair(): boolean;
  gateExecution(
    input: AutonomousCompromiseRecoveryGateInputV1,
  ): Promise<CompromiseRecoveryExecutionGateV1>;
  tick(
    input: AutonomousCompromiseRecoveryTickInputV1,
  ): Promise<AutonomousCompromiseRecoveryTickResultV1>;
  requireNodeProgress(
    input: AutonomousCompromiseRecoveryTickInputV1,
  ): Promise<AutonomousCompromiseRecoveryTickResultV1>;
}

const autonomousCompromiseRecoveryInvokersV1 = new WeakMap<
  object,
  AutonomousCompromiseRecoveryInvokersV1
>();

interface CapturedRecoveryRuntimeV1 {
  readonly runtime: CompromiseAwareRecoveryRuntimeV1;
  load(logicalTimeMs: number): Promise<CompromiseRecoveryStateV1>;
  submit(input: {
    readonly verdict: CompromiseRecoveryVerdictCertificateV1;
    readonly request: CompromiseRecoveryRequestV1;
    readonly logicalTimeMs: number;
  }): Promise<CompromiseRecoveryStateV1>;
  runToTerminal(input: {
    readonly logicalTimeMs: number;
    readonly maximumSteps?: number;
  }): Promise<CompromiseRecoveryStateV1>;
  gateExecution(
    input: AutonomousCompromiseRecoveryGateInputV1,
  ): Promise<CompromiseRecoveryExecutionGateV1>;
}

/**
 * Bounded supervisor that drains certified incidents into scope-local durable
 * recovery sagas. Verdict verification, request planning, lifecycle exclusion,
 * assignment fencing, election and restoration remain explicit embedding
 * boundaries. The source retains incident content until terminal
 * acknowledgement; the separate coordinator store retains only monotonic
 * logical time and the bounded set of admitted full-scope identities.
 */
export class AutonomousCompromiseRecoveryRuntimeV1 {
  readonly #consumerId: string;
  readonly #scope: AutonomousCompromiseRecoveryScopeV1;
  readonly #policy: AutonomousCompromiseRecoveryPolicyV1;
  readonly #pullVerdicts: CompromiseRecoveryCertifiedVerdictSourceV1["pull"];
  readonly #acknowledgeVerdict: CompromiseRecoveryCertifiedVerdictSourceV1["acknowledge"];
  readonly #deriveRequest: CompromiseRecoveryRequestPlannerV1["deriveRequest"];
  readonly #resolveRuntime: CompromiseRecoveryRuntimeRegistryV1["resolve"];
  readonly #admitScope: CompromiseRecoveryScopeAdmissionPortV1["admit"];
  readonly #loadCoordinator: AutonomousCompromiseRecoveryCoordinatorStoreV1["load"];
  readonly #saveCoordinator: AutonomousCompromiseRecoveryCoordinatorStoreV1["save"];
  readonly #runtimesIdentity: object;
  readonly #closedRegistryPair: boolean;
  readonly #resolvedRecoveries = new Map<string, CapturedRecoveryRuntimeV1>();
  readonly #coordinatorStateKey: string;
  #tail: Promise<void> = Promise.resolve();

  constructor(options: {
    readonly consumerId: string;
    readonly scope: AutonomousCompromiseRecoveryScopeV1;
    readonly verdictSource: CompromiseRecoveryCertifiedVerdictSourceV1;
    readonly requestPlanner: CompromiseRecoveryRequestPlannerV1;
    readonly runtimes: CompromiseRecoveryRuntimeRegistryV1;
    readonly scopeAdmission: CompromiseRecoveryScopeAdmissionPortV1;
    readonly coordinatorStore: AutonomousCompromiseRecoveryCoordinatorStoreV1;
    readonly coordinatorStateKey: string;
    readonly policy: AutonomousCompromiseRecoveryPolicyV1;
  }) {
    if (!options || typeof options !== "object")
      fail("autonomous compromise recovery options are required");
    const consumerId = options.consumerId;
    const configuredScope = options.scope;
    const verdictSource = options.verdictSource;
    const requestPlanner = options.requestPlanner;
    const runtimes = options.runtimes;
    const scopeAdmission = options.scopeAdmission;
    const coordinatorStore = options.coordinatorStore;
    const coordinatorStateKey = options.coordinatorStateKey;
    const policy = options.policy;
    const tenantId = configuredScope?.tenantId;
    const meshId = configuredScope?.meshId;
    const missionIntentId = configuredScope?.missionIntentId;
    const pullVerdicts = verdictSource?.pull;
    const acknowledgeVerdict = verdictSource?.acknowledge;
    const deriveRequest = requestPlanner?.deriveRequest;
    const resolveRuntime = runtimes?.resolve;
    const admitScope = scopeAdmission?.admit;
    const loadCoordinator = coordinatorStore?.load;
    const saveCoordinator = coordinatorStore?.save;
    const policyDigest = policy?.policyDigest;
    const maximumCertificatesPerTick = policy?.maximumCertificatesPerTick;
    const maximumSagaStepsPerIncident = policy?.maximumSagaStepsPerIncident;
    const maximumScopes = policy?.maximumScopes;
    const maximumCommitAttempts = policy?.maximumCommitAttempts;
    this.#consumerId = identifier(consumerId, "consumerId");
    this.#scope = Object.freeze({
      tenantId: identifier(tenantId, "scope.tenantId"),
      meshId: identifier(meshId, "scope.meshId"),
      missionIntentId: identifier(
        missionIntentId,
        "scope.missionIntentId",
      ),
    });
    if (
      !verdictSource ||
      typeof pullVerdicts !== "function" ||
      typeof acknowledgeVerdict !== "function"
    )
      fail("certified compromise verdict source is required");
    if (
      !requestPlanner ||
      typeof deriveRequest !== "function"
    )
      fail("compromise recovery request planner is required");
    if (!runtimes || typeof resolveRuntime !== "function")
      fail("compromise recovery runtime registry is required");
    if (!scopeAdmission || typeof admitScope !== "function")
      fail("compromise recovery scope admission is required");
    if (
      !coordinatorStore ||
      typeof loadCoordinator !== "function" ||
      typeof saveCoordinator !== "function"
    )
      fail("durable compromise recovery coordinator store is required");
    this.#coordinatorStateKey = identifier(
      coordinatorStateKey,
      "coordinatorStateKey",
    );
    this.#pullVerdicts = (input) =>
      pullVerdicts.call(verdictSource, input);
    this.#acknowledgeVerdict = (input) =>
      acknowledgeVerdict.call(verdictSource, input);
    this.#deriveRequest = (input) =>
      deriveRequest.call(requestPlanner, input);
    this.#loadCoordinator = (stateKey) =>
      loadCoordinator.call(coordinatorStore, stateKey);
    this.#saveCoordinator = (input) =>
      saveCoordinator.call(coordinatorStore, input);
    const nominalRuntimes =
      isBoundedLifecycleCompromiseRecoveryRuntimeRegistryV1(runtimes)
        ? runtimes
        : null;
    const nominalAdmission =
      isBoundedLifecycleCompromiseRecoveryRuntimeRegistryV1(scopeAdmission)
        ? scopeAdmission
        : null;
    this.#runtimesIdentity = runtimes as object;
    this.#closedRegistryPair =
      (runtimes as object) === (scopeAdmission as object) &&
      nominalRuntimes !== null;
    if (nominalRuntimes)
      this.#resolveRuntime = (input) =>
        invokeBoundedRecoveryRegistryResolveV1(nominalRuntimes, input);
    else {
      this.#resolveRuntime = (input) =>
        resolveRuntime.call(runtimes, input);
    }
    if (nominalAdmission)
      this.#admitScope = (input) =>
        invokeBoundedRecoveryRegistryAdmitV1(nominalAdmission, input);
    else {
      this.#admitScope = (input) =>
        admitScope.call(scopeAdmission, input);
    }
    this.#policy = Object.freeze({
      policyDigest: planningDigestValue(
        policyDigest,
        "policyDigest",
      ),
      maximumCertificatesPerTick: boundedInteger(
        maximumCertificatesPerTick,
        "maximumCertificatesPerTick",
        1,
        32,
      ),
      maximumSagaStepsPerIncident: boundedInteger(
        maximumSagaStepsPerIncident,
        "maximumSagaStepsPerIncident",
        1,
        32,
      ),
      maximumScopes: boundedInteger(
        maximumScopes,
        "maximumScopes",
        1,
        4_096,
      ),
      maximumCommitAttempts: boundedInteger(
        maximumCommitAttempts,
        "maximumCommitAttempts",
        1,
        32,
      ),
    });
    autonomousCompromiseRecoveryInvokersV1.set(
      this,
      Object.freeze({
        scope: this.#scope,
        isBoundToLifecycle: (lifecycle: object) =>
          Boolean(
            lifecycle &&
            isBoundedLifecycleCompromiseRecoveryRuntimeRegistryV1(
              this.#runtimesIdentity,
            ) &&
            boundedRegistryInvokers(this.#runtimesIdentity).lifecycle ===
              lifecycle,
          ),
        isBoundToAssignmentAuthority: (authority: object) =>
          Boolean(
            authority &&
            isBoundedLifecycleCompromiseRecoveryRuntimeRegistryV1(
              this.#runtimesIdentity,
            ) &&
            boundedRegistryInvokers(this.#runtimesIdentity)
              .assignmentAuthority === authority,
          ),
        hasClosedRegistryPair: () => this.#closedRegistryPair,
        gateExecution: (input: AutonomousCompromiseRecoveryGateInputV1) =>
          this.#gateExecution(input),
        tick: (input: AutonomousCompromiseRecoveryTickInputV1) =>
          this.#scheduleTick(input),
        requireNodeProgress: (input: AutonomousCompromiseRecoveryTickInputV1) =>
          this.#requireNodeProgress(input),
      }),
    );
  }

  get scope(): AutonomousCompromiseRecoveryScopeV1 {
    return autonomousCompromiseRecoveryScopeV1(this);
  }

  /** Library-owned identity comparison; callers cannot supply the result. */
  isBoundToLifecycle(lifecycle: object): boolean {
    return isAutonomousCompromiseRecoveryBoundToLifecycleV1(this, lifecycle);
  }

  /** Library-owned identity comparison for the durable assignment authority. */
  isBoundToAssignmentAuthority(authority: object): boolean {
    return isAutonomousCompromiseRecoveryBoundToAssignmentAuthorityV1(
      this,
      authority,
    );
  }

  async gateExecution(
    input: AutonomousCompromiseRecoveryGateInputV1,
  ): Promise<CompromiseRecoveryExecutionGateV1> {
    return invokeAutonomousCompromiseRecoveryGateExecutionV1(this, input);
  }

  async #gateExecution(
    input: AutonomousCompromiseRecoveryGateInputV1,
  ): Promise<CompromiseRecoveryExecutionGateV1> {
    this.#assertScope(input.scope);
    identifier(input.peerId, "peerId");
    boundedInteger(
      input.assignmentEpoch,
      "assignmentEpoch",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    identifier(input.fencingToken, "fencingToken");
    logicalTime(input.logicalTimeMs);
    await this.#retainCoordinator(input.logicalTimeMs, null);
    if (
      !(await this.#admitScope({
        scope: input.scope,
        certificateDigest: null,
        logicalTimeMs: input.logicalTimeMs,
      }))
    )
      return Object.freeze({
        allowed: false,
        reasonCode: "recovery_scope_unavailable",
      });
    const retained = await this.#retainCoordinator(
      input.logicalTimeMs,
      input.scope,
    );
    if (!retained)
      return Object.freeze({
        allowed: false,
        reasonCode: "recovery_scope_capacity_exhausted",
      });
    const recovery = await this.#resolveRecovery(
      input.scope,
      input.logicalTimeMs,
    );
    if (!recovery)
      return Object.freeze({
        allowed: false,
        reasonCode: "recovery_runtime_unavailable",
      });
    return recovery.gateExecution(input);
  }

  /** Serialized locally; durable saga CAS and source redelivery handle restarts. */
  tick(
    input: AutonomousCompromiseRecoveryTickInputV1,
  ): Promise<AutonomousCompromiseRecoveryTickResultV1> {
    return invokeAutonomousCompromiseRecoveryTickV1(this, input);
  }

  #scheduleTick(
    input: AutonomousCompromiseRecoveryTickInputV1,
  ): Promise<AutonomousCompromiseRecoveryTickResultV1> {
    logicalTime(input.logicalTimeMs);
    const operation = this.#tail.then(
      () => this.#tick(input.logicalTimeMs),
      () => this.#tick(input.logicalTimeMs),
    );
    this.#tail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async requireNodeProgress(
    input: AutonomousCompromiseRecoveryTickInputV1,
  ): Promise<AutonomousCompromiseRecoveryTickResultV1> {
    return invokeAutonomousCompromiseRecoveryRequireNodeProgressV1(this, input);
  }

  async #requireNodeProgress(
    input: AutonomousCompromiseRecoveryTickInputV1,
  ): Promise<AutonomousCompromiseRecoveryTickResultV1> {
    const result = await this.#scheduleTick(input);
    if (!result.nodeProgressAllowed)
      throw new AutonomousCompromiseRecoveryNotReadyErrorV1(result);
    return result;
  }

  async #tick(
    logicalTimeMs: number,
  ): Promise<AutonomousCompromiseRecoveryTickResultV1> {
    await this.#retainCoordinator(logicalTimeMs, null);
    const delivery = await this.#pullVerdicts({
      consumerId: this.#consumerId,
      scope: this.#scope,
      logicalTimeMs,
      maximumCount: this.#policy.maximumCertificatesPerTick,
    });
    if (
      !delivery ||
      !Array.isArray(delivery.verdicts) ||
      delivery.verdicts.length > this.#policy.maximumCertificatesPerTick ||
      typeof delivery.hasMore !== "boolean"
    )
      fail("certified compromise verdict delivery is invalid");

    const inspected: PlanningDigestV1[] = [];
    const terminal: PlanningDigestV1[] = [];
    for (const deliveredVerdict of delivery.verdicts) {
      const verdict = immutable(deliveredVerdict);
      this.#assertScope(verdict?.scope);
      planningDigest(verdict.certificateDigest, "verdict.certificateDigest");
      if (inspected.includes(verdict.certificateDigest))
        fail("certified compromise verdict delivery contains duplicates");
      inspected.push(verdict.certificateDigest);

      if (
        !(await this.#admitScope({
          scope: verdict.scope,
          certificateDigest: verdict.certificateDigest,
          logicalTimeMs,
        }))
      )
        return result(
          "scope_unavailable",
          false,
          "recovery_scope_unavailable",
          inspected,
          terminal,
        );
      if (!(await this.#retainCoordinator(logicalTimeMs, verdict.scope)))
        return result(
          "scope_capacity_exhausted",
          false,
          "recovery_scope_capacity_exhausted",
          inspected,
          terminal,
        );

      const recovery = await this.#resolveRecovery(verdict.scope, logicalTimeMs);
      if (!recovery)
        return result(
          "runtime_unavailable",
          false,
          "recovery_runtime_unavailable",
          inspected,
          terminal,
        );
      let state = await recovery.load(logicalTimeMs);
      if (!sameCompromiseRecoveryScopeV1(state.scope, verdict.scope))
        fail("recovery runtime registry returned a different scope");

      const supersession = state.supersededCertificates.find(
        ({ supersededCertificateDigest }) =>
          supersededCertificateDigest === verdict.certificateDigest,
      );
      if (supersession) {
        if (
          !state.completedCertificateDigests.includes(
            supersession.supersedingCertificateDigest,
          )
        )
          fail("recovery supersession is missing its terminal successor");
        await this.#acknowledge(
          verdict.certificateDigest,
          state.stateDigest,
          logicalTimeMs,
        );
        terminal.push(state.stateDigest);
        continue;
      }

      if (
        state.activeIncident?.stage === "blocked" &&
        state.activeIncident.verdict.certificateDigest ===
          verdict.certificateDigest
      )
        return result(
          "blocked",
          false,
          state.activeIncident.failureCode ?? "recovery_blocked",
          inspected,
          terminal,
        );
      if (
        state.activeIncident?.stage === "blocked" &&
        state.activeIncident.supersedesCertificateDigests.includes(
          verdict.certificateDigest,
        )
      )
        return result(
          "blocked",
          false,
          "superseding_recovery_blocked",
          inspected,
          terminal,
        );

      let activeDigest = state.activeIncident?.verdict.certificateDigest;
      if (isUnresolved(state) && activeDigest !== verdict.certificateDigest) {
        // The durable saga is authoritative for ordering. A source may deliver
        // a later certificate first, so finish the retained incident instead
        // of allowing source order to starve it indefinitely.
        const retainedCertificateDigest = activeDigest!;
        state = await this.#run(recovery, logicalTimeMs);
        if (state.activeIncident?.stage === "blocked")
          return result(
            "blocked",
            false,
            state.activeIncident.failureCode ?? "recovery_blocked",
            inspected,
            terminal,
          );
        if (isUnresolved(state))
          return result(
            "in_progress",
            false,
            "prior_recovery_saga_in_progress",
            inspected,
            terminal,
          );
        if (
          !state.completedCertificateDigests.includes(retainedCertificateDigest)
        )
          fail("recovery saga terminated without completing its certificate");
        await this.#acknowledge(
          retainedCertificateDigest,
          state.stateDigest,
          logicalTimeMs,
        );
        terminal.push(state.stateDigest);
        activeDigest = state.activeIncident?.verdict.certificateDigest;
      }

      if (isUnresolved(state)) {
        if (activeDigest !== verdict.certificateDigest)
          fail("recovery runtime retained an unexpected active incident");
        state = await this.#run(recovery, logicalTimeMs);
      } else if (
        !state.completedCertificateDigests.includes(verdict.certificateDigest)
      ) {
        const request = await this.#deriveRequest({
          verdict,
          recoveryState: state,
          logicalTimeMs,
        });
        if (request === null)
          return result(
            "request_unavailable",
            false,
            "recovery_request_unavailable",
            inspected,
            terminal,
          );
        state = await recovery.submit({ verdict, request, logicalTimeMs });
        state = await this.#run(recovery, logicalTimeMs);
      }

      if (state.activeIncident?.stage === "blocked")
        return result(
          "blocked",
          false,
          state.activeIncident.failureCode ?? "recovery_blocked",
          inspected,
          terminal,
        );
      if (isUnresolved(state))
        return result(
          "in_progress",
          false,
          "recovery_saga_in_progress",
          inspected,
          terminal,
        );
      if (
        !state.completedCertificateDigests.includes(verdict.certificateDigest)
      )
        fail("recovery saga terminated without completing its certificate");

      await this.#acknowledge(
        verdict.certificateDigest,
        state.stateDigest,
        logicalTimeMs,
      );
      terminal.push(state.stateDigest);
    }

    if (delivery.hasMore)
      return result(
        "budget_exhausted",
        false,
        "recovery_tick_certificate_budget_exhausted",
        inspected,
        terminal,
      );
    if (inspected.length > 0)
      return result(
        "recovered",
        false,
        "recovery_completed_clean_tick_required",
        inspected,
        terminal,
      );
    return result("ready", true, "recovery_ready", inspected, terminal);
  }

  async #retainCoordinator(
    logicalTimeMs: number,
    admittedScope: CompromiseRecoveryScopeV1 | null,
  ): Promise<boolean> {
    const admittedKey = admittedScope ? recoveryScopeKey(admittedScope) : null;
    for (
      let attempt = 0;
      attempt < this.#policy.maximumCommitAttempts;
      attempt += 1
    ) {
      const loaded = await this.#loadCoordinator(
        this.#coordinatorStateKey,
      );
      const current = loaded
        ? await this.#assertCoordinatorState(loaded)
        : null;
      if (current && logicalTimeMs < current.logicalTimeHighWaterMs)
        fail("autonomous recovery coordinator logical time regressed");
      const retainedScopes = current?.admittedScopes ?? [];
      const alreadyRetained =
        admittedKey === null ||
        retainedScopes.some((scope) => recoveryScopeKey(scope) === admittedKey);
      if (
        !alreadyRetained &&
        retainedScopes.length >= this.#policy.maximumScopes
      )
        return false;
      if (
        current &&
        alreadyRetained &&
        logicalTimeMs === current.logicalTimeHighWaterMs
      )
        return true;
      const nextScopes =
        alreadyRetained || admittedScope === null
          ? retainedScopes
          : canonicalRecoveryScopes([...retainedScopes, admittedScope]);
      const next = await buildCoordinatorState({
        stateKey: this.#coordinatorStateKey,
        consumerId: this.#consumerId,
        scope: this.#scope,
        policyDigest: this.#policy.policyDigest,
        revision: current ? current.revision + 1 : 0,
        logicalTimeHighWaterMs: logicalTimeMs,
        admittedScopes: nextScopes,
        predecessorStateDigest: current?.stateDigest ?? null,
      });
      if (
        await this.#saveCoordinator({
          state: next,
          expectedRevision: current?.revision ?? null,
          expectedStateDigest: current?.stateDigest ?? null,
        })
      )
        return true;
    }
    fail("autonomous recovery coordinator CAS attempts exhausted");
  }

  async #assertCoordinatorState(
    value: AutonomousCompromiseRecoveryCoordinatorStateV1,
  ): Promise<AutonomousCompromiseRecoveryCoordinatorStateV1> {
    if (
      !value ||
      value.format !== AUTONOMOUS_COMPROMISE_RECOVERY_COORDINATOR_FORMAT_V1 ||
      value.schemaVersion !== 1 ||
      value.stateKey !== this.#coordinatorStateKey ||
      value.consumerId !== this.#consumerId ||
      value.policyDigest !== this.#policy.policyDigest ||
      value.scope.tenantId !== this.#scope.tenantId ||
      value.scope.meshId !== this.#scope.meshId ||
      value.scope.missionIntentId !== this.#scope.missionIntentId
    )
      fail("autonomous recovery coordinator state binding is invalid");
    exactKeys(
      value as unknown as Record<string, unknown>,
      [
        "admittedScopes",
        "consumerId",
        "format",
        "logicalTimeHighWaterMs",
        "policyDigest",
        "predecessorStateDigest",
        "revision",
        "schemaVersion",
        "scope",
        "stateDigest",
        "stateKey",
      ],
      "autonomous recovery coordinator state",
    );
    exactKeys(
      value.scope as unknown as Record<string, unknown>,
      ["meshId", "missionIntentId", "tenantId"],
      "autonomous recovery coordinator scope",
    );
    boundedInteger(
      value.revision,
      "coordinator.revision",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    logicalTime(value.logicalTimeHighWaterMs);
    planningDigest(value.stateDigest, "coordinator.stateDigest");
    if (value.revision === 0) {
      if (value.predecessorStateDigest !== null)
        fail("initial coordinator state has a predecessor");
    } else {
      planningDigest(
        value.predecessorStateDigest,
        "coordinator.predecessorStateDigest",
      );
    }
    if (
      !Array.isArray(value.admittedScopes) ||
      value.admittedScopes.length > this.#policy.maximumScopes
    )
      fail("autonomous recovery coordinator scope capacity is invalid");
    const canonical = canonicalRecoveryScopes(value.admittedScopes);
    if (
      canonical.length !== value.admittedScopes.length ||
      canonical.some(
        (scope, index) =>
          recoveryScopeKey(scope) !==
          recoveryScopeKey(value.admittedScopes[index]!),
      )
    )
      fail("autonomous recovery coordinator scopes are not canonical");
    for (const scope of value.admittedScopes) {
      exactKeys(
        scope as unknown as Record<string, unknown>,
        ["meshId", "missionIntentId", "objectiveId", "tenantId", "workItemId"],
        "autonomous recovery admitted scope",
      );
      this.#assertScope(scope);
    }
    const { stateDigest, ...body } = value;
    if (
      stateDigest !==
      (await compromiseRecoveryDigestV1(
        "autonomous-compromise-recovery-coordinator-state",
        body,
      ))
    )
      fail("autonomous recovery coordinator state digest is invalid");
    return immutable(value);
  }

  async #resolveRecovery(
    scope: CompromiseRecoveryScopeV1,
    logicalTimeMs: number,
  ): Promise<CapturedRecoveryRuntimeV1 | null> {
    const candidate = await this.#resolveRuntime({ scope, logicalTimeMs });
    if (!candidate) return null;
    const key = recoveryScopeKey(scope);
    const retained = this.#resolvedRecoveries.get(key);
    if (retained) {
      if (retained.runtime !== candidate)
        fail("compromise recovery registry substituted a retained saga");
      return retained;
    }
    const captured = captureRecoveryRuntime(candidate);
    this.#resolvedRecoveries.set(key, captured);
    return captured;
  }

  #run(
    recovery: CapturedRecoveryRuntimeV1,
    logicalTimeMs: number,
  ): Promise<CompromiseRecoveryStateV1> {
    return recovery.runToTerminal({
      logicalTimeMs,
      maximumSteps: this.#policy.maximumSagaStepsPerIncident,
    });
  }

  #acknowledge(
    certificateDigest: PlanningDigestV1,
    terminalStateDigest: PlanningDigestV1,
    logicalTimeMs: number,
  ): Promise<void> {
    return this.#acknowledgeVerdict({
      consumerId: this.#consumerId,
      certificateDigest,
      terminalStateDigest,
      logicalTimeMs,
    });
  }

  #assertScope(scope: CompromiseRecoveryScopeV1): void {
    if (
      !scope ||
      scope.tenantId !== this.#scope.tenantId ||
      scope.meshId !== this.#scope.meshId ||
      scope.missionIntentId !== this.#scope.missionIntentId
    )
      fail("certified compromise verdict is outside the coordinator scope");
  }
}

/** Nominal check for the certified autonomous recovery supervisor. */
export function isAutonomousCompromiseRecoveryRuntimeV1(
  value: unknown,
): value is AutonomousCompromiseRecoveryRuntimeV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    autonomousCompromiseRecoveryInvokersV1.has(value)
  );
}

/** Returns the coordinator scope captured at construction. */
export function autonomousCompromiseRecoveryScopeV1(
  runtime: AutonomousCompromiseRecoveryRuntimeV1,
): AutonomousCompromiseRecoveryScopeV1 {
  return autonomousRecoveryInvokers(runtime).scope;
}

/** Checks the exact lifecycle identity retained by the saga registry. */
export function isAutonomousCompromiseRecoveryBoundToLifecycleV1(
  runtime: AutonomousCompromiseRecoveryRuntimeV1,
  lifecycle: object,
): boolean {
  return autonomousRecoveryInvokers(runtime).isBoundToLifecycle(lifecycle);
}

/** Checks the exact assignment authority retained by the saga registry. */
export function isAutonomousCompromiseRecoveryBoundToAssignmentAuthorityV1(
  runtime: AutonomousCompromiseRecoveryRuntimeV1,
  authority: object,
): boolean {
  return autonomousRecoveryInvokers(runtime).isBoundToAssignmentAuthority(
    authority,
  );
}

/**
 * True only when resolution and scope admission are the same nominal bounded
 * registry instance captured by the supervisor constructor.
 */
export function hasAutonomousCompromiseRecoveryClosedRegistryPairV1(
  runtime: AutonomousCompromiseRecoveryRuntimeV1,
): boolean {
  return autonomousRecoveryInvokers(runtime).hasClosedRegistryPair();
}

/** Runs the protected execution gate through the private recovery runtime. */
export function invokeAutonomousCompromiseRecoveryGateExecutionV1(
  runtime: AutonomousCompromiseRecoveryRuntimeV1,
  input: Parameters<AutonomousCompromiseRecoveryRuntimeV1["gateExecution"]>[0],
): ReturnType<AutonomousCompromiseRecoveryRuntimeV1["gateExecution"]> {
  return autonomousRecoveryInvokers(runtime).gateExecution(input);
}

/** Advances recovery through its construction-time serialized invoker. */
export function invokeAutonomousCompromiseRecoveryTickV1(
  runtime: AutonomousCompromiseRecoveryRuntimeV1,
  input: Parameters<AutonomousCompromiseRecoveryRuntimeV1["tick"]>[0],
): ReturnType<AutonomousCompromiseRecoveryRuntimeV1["tick"]> {
  return autonomousRecoveryInvokers(runtime).tick(input);
}

/** Requires a clean recovery tick without virtual method dispatch. */
export function invokeAutonomousCompromiseRecoveryRequireNodeProgressV1(
  runtime: AutonomousCompromiseRecoveryRuntimeV1,
  input: Parameters<
    AutonomousCompromiseRecoveryRuntimeV1["requireNodeProgress"]
  >[0],
): ReturnType<AutonomousCompromiseRecoveryRuntimeV1["requireNodeProgress"]> {
  return autonomousRecoveryInvokers(runtime).requireNodeProgress(input);
}

function autonomousRecoveryInvokers(
  runtime: AutonomousCompromiseRecoveryRuntimeV1,
): AutonomousCompromiseRecoveryInvokersV1 {
  const invokers =
    typeof runtime === "object" && runtime !== null
      ? autonomousCompromiseRecoveryInvokersV1.get(runtime)
      : undefined;
  if (!invokers)
    fail("concrete autonomous compromise recovery runtime is required");
  return invokers;
}

function captureRecoveryRuntime(value: unknown): CapturedRecoveryRuntimeV1 {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as Record<string, unknown>).load !== "function" ||
    typeof (value as Record<string, unknown>).submit !== "function" ||
    typeof (value as Record<string, unknown>).runToTerminal !== "function" ||
    typeof (value as Record<string, unknown>).gateExecution !== "function"
  )
    fail("compromise recovery runtime registry result is invalid");
  if (isCompromiseAwareRecoveryRuntimeV1(value)) {
    const captured: CapturedRecoveryRuntimeV1 = Object.freeze({
      runtime: value,
      load: (logicalTimeMs: number) =>
        invokeCompromiseAwareRecoveryLoadV1(value, logicalTimeMs),
      submit: (input: Parameters<CapturedRecoveryRuntimeV1["submit"]>[0]) =>
        invokeCompromiseAwareRecoverySubmitV1(value, input),
      runToTerminal: (
        input: Parameters<CapturedRecoveryRuntimeV1["runToTerminal"]>[0],
      ) =>
        invokeCompromiseAwareRecoveryRunToTerminalV1(value, input),
      gateExecution: (
        input: Parameters<CapturedRecoveryRuntimeV1["gateExecution"]>[0],
      ) =>
        invokeCompromiseAwareRecoveryGateExecutionV1(value, input),
    });
    return captured;
  }
  const structural = value as {
    load(logicalTimeMs: number): Promise<CompromiseRecoveryStateV1>;
    submit(input: {
      readonly verdict: CompromiseRecoveryVerdictCertificateV1;
      readonly request: CompromiseRecoveryRequestV1;
      readonly logicalTimeMs: number;
    }): Promise<CompromiseRecoveryStateV1>;
    runToTerminal(input: {
      readonly logicalTimeMs: number;
      readonly maximumSteps?: number;
    }): Promise<CompromiseRecoveryStateV1>;
    gateExecution(
      input: AutonomousCompromiseRecoveryGateInputV1,
    ): Promise<CompromiseRecoveryExecutionGateV1>;
  };
  const load = structural.load;
  const submit = structural.submit;
  const runToTerminal = structural.runToTerminal;
  const gateExecution = structural.gateExecution;
  const captured: CapturedRecoveryRuntimeV1 = Object.freeze({
    runtime: value as CompromiseAwareRecoveryRuntimeV1,
    load: (logicalTimeMs: number) => load.call(value, logicalTimeMs),
    submit: (
      input: Parameters<CapturedRecoveryRuntimeV1["submit"]>[0],
    ) => submit.call(value, input),
    runToTerminal: (
      input: Parameters<CapturedRecoveryRuntimeV1["runToTerminal"]>[0],
    ) => runToTerminal.call(value, input),
    gateExecution: (
      input: Parameters<CapturedRecoveryRuntimeV1["gateExecution"]>[0],
    ) => gateExecution.call(value, input),
  });
  return captured;
}

function isUnresolved(state: CompromiseRecoveryStateV1): boolean {
  return Boolean(
    state.activeIncident &&
    state.activeIncident.stage !== "completed" &&
    state.activeIncident.stage !== "blocked",
  );
}

function result(
  status: AutonomousCompromiseRecoveryStatusV1,
  nodeProgressAllowed: boolean,
  reasonCode: string,
  inspectedCertificateDigests: readonly PlanningDigestV1[],
  terminalStateDigests: readonly PlanningDigestV1[],
): AutonomousCompromiseRecoveryTickResultV1 {
  return Object.freeze({
    schemaVersion: 1,
    status,
    nodeProgressAllowed,
    reasonCode,
    inspectedCertificateDigests: Object.freeze([
      ...inspectedCertificateDigests,
    ]),
    terminalStateDigests: Object.freeze([...terminalStateDigests]),
  });
}

async function buildCoordinatorState(
  input: Omit<
    AutonomousCompromiseRecoveryCoordinatorStateV1,
    "format" | "schemaVersion" | "stateDigest"
  >,
): Promise<AutonomousCompromiseRecoveryCoordinatorStateV1> {
  const body = {
    format: AUTONOMOUS_COMPROMISE_RECOVERY_COORDINATOR_FORMAT_V1,
    schemaVersion: 1 as const,
    stateKey: input.stateKey,
    consumerId: input.consumerId,
    scope: immutable(input.scope),
    policyDigest: input.policyDigest,
    revision: input.revision,
    logicalTimeHighWaterMs: input.logicalTimeHighWaterMs,
    admittedScopes: canonicalRecoveryScopes(input.admittedScopes),
    predecessorStateDigest: input.predecessorStateDigest,
  };
  return immutable({
    ...body,
    stateDigest: await compromiseRecoveryDigestV1(
      "autonomous-compromise-recovery-coordinator-state",
      body,
    ),
  });
}

function canonicalRecoveryScopes(
  values: readonly CompromiseRecoveryScopeV1[],
): readonly CompromiseRecoveryScopeV1[] {
  if (!Array.isArray(values)) fail("recovery scopes are invalid");
  const scopes = values.map((scope) =>
    immutable({
      tenantId: identifier(scope?.tenantId, "scope.tenantId"),
      meshId: identifier(scope?.meshId, "scope.meshId"),
      missionIntentId: identifier(
        scope?.missionIntentId,
        "scope.missionIntentId",
      ),
      objectiveId: identifier(scope?.objectiveId, "scope.objectiveId"),
      workItemId: identifier(scope?.workItemId, "scope.workItemId"),
    }),
  );
  scopes.sort((left, right) =>
    recoveryScopeKey(left).localeCompare(recoveryScopeKey(right)),
  );
  const keys = scopes.map(recoveryScopeKey);
  if (new Set(keys).size !== keys.length) fail("recovery scope is duplicated");
  return Object.freeze(scopes);
}

function recoveryScopeKey(scope: CompromiseRecoveryScopeV1): string {
  return [
    identifier(scope?.tenantId, "scope.tenantId"),
    identifier(scope?.meshId, "scope.meshId"),
    identifier(scope?.missionIntentId, "scope.missionIntentId"),
    identifier(scope?.objectiveId, "scope.objectiveId"),
    identifier(scope?.workItemId, "scope.workItemId"),
  ].join("\u001f");
}

function identifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length > 256 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)
  )
    fail(`${label} is invalid`);
  return value;
}

function planningDigest(
  value: unknown,
  label: string,
): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    fail(`${label} is invalid`);
}

function planningDigestValue(value: unknown, label: string): PlanningDigestV1 {
  planningDigest(value, label);
  return value;
}

function boundedInteger(
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
    fail(`${label} is invalid`);
  return value as number;
}

function logicalTime(value: unknown): number {
  return boundedInteger(value, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
}

function immutable<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return;
    for (const child of Object.values(item as Record<string, unknown>))
      freeze(child);
    Object.freeze(item);
  };
  freeze(clone);
  return clone;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify([...expected].sort())
  )
    fail(`${label} schema is not closed`);
}

function fail(message: string): never {
  throw new TypeError(message);
}
