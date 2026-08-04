import type { AgentPlatID, JsonValue, TenantContext } from "@agentplat/core";

import type {
  CreatePortableAgentSessionInputV1,
  PortableAgentAdapterContextV1,
  PortableAgentAdapterManifestV1,
  PortableAgentAdapterV1,
  PortableAgentCheckpointV1,
  PortableAgentControlDecisionV1,
  PortableAgentControlPointV1,
  PortableAgentRoleBindingV1,
  PortableAgentSessionRuntimeOptionsV1,
  PortableAgentSessionSnapshotV1,
  PortableAgentStepOptionsV1,
  PortableAgentStepOutcomeV1,
  PortableAgentStepRequestV1,
  PortableAgentStepResultV1,
} from "./adapter-contracts.js";
import { PortableAgentErrorV1 } from "./adapter-errors.js";
import { InMemoryPortableAgentStateStoreV1 } from "./adapter-store.js";
import {
  assertStoredPortableSessionV1,
  cloneAndFreeze,
  identifier,
  jsonByteLength,
  normalizeAdapterRequirementsV1,
  normalizeCheckpointV1,
  normalizeControlDecisionV1,
  normalizeJson,
  normalizeMetadata,
  normalizeRoleBindingV1,
  normalizeStepRequestV1,
  normalizeStepResultV1,
} from "./adapter-validation.js";

interface ActiveSessionOperation {
  readonly controller: AbortController;
  readonly completed: Promise<void>;
  readonly complete: () => void;
}

const DEFAULT_MAXIMUM_SNAPSHOT_BYTES = 16 * 1_024 * 1_024;

/**
 * Stateful, provider-neutral execution boundary for heterogeneous local agents.
 * Outputs and action proposals remain withheld until fail-closed controls allow
 * every applicable release point.
 */
export class PortableAgentSessionRuntimeV1 {
  private readonly registry: PortableAgentSessionRuntimeOptionsV1["registry"];
  private readonly control: PortableAgentSessionRuntimeOptionsV1["control"];
  private readonly stateStore: NonNullable<
    PortableAgentSessionRuntimeOptionsV1["stateStore"]
  >;
  private readonly maximumSessionSnapshotBytes: number;
  private readonly clock: () => Date;
  private readonly active = new Map<AgentPlatID, ActiveSessionOperation>();

  constructor(options: PortableAgentSessionRuntimeOptionsV1) {
    if (!options || typeof options !== "object") {
      throw validation("portable agent runtime options are required");
    }
    if (
      !options.registry ||
      typeof options.registry.resolve !== "function" ||
      typeof options.registry.negotiate !== "function"
    ) {
      throw validation("portable agent adapter registry is required");
    }
    if (!options.control || typeof options.control.evaluate !== "function") {
      throw validation("portable agent control is required");
    }
    identifier(options.control.controlId, "control.controlId");
    identifier(options.control.implementationId, "control.implementationId");
    if (
      !Number.isSafeInteger(options.control.controlVersion) ||
      options.control.controlVersion < 1
    ) {
      throw validation("control.controlVersion must be a positive integer");
    }
    const maximum =
      options.maximumSessionSnapshotBytes ?? DEFAULT_MAXIMUM_SNAPSHOT_BYTES;
    if (
      !Number.isSafeInteger(maximum) ||
      maximum < 1_048_576 ||
      maximum > 67_108_864
    ) {
      throw validation(
        "maximumSessionSnapshotBytes must be from 1048576 through 67108864",
      );
    }
    this.registry = options.registry;
    this.control = options.control;
    this.stateStore =
      options.stateStore ?? new InMemoryPortableAgentStateStoreV1();
    this.maximumSessionSnapshotBytes = maximum;
    this.clock = options.clock ?? (() => new Date());
  }

  async createSession(
    input: CreatePortableAgentSessionInputV1,
  ): Promise<PortableAgentSessionSnapshotV1> {
    if (!input || typeof input !== "object") {
      throw validation("portable agent session input is required");
    }
    const sessionId = identifier(input.sessionId, "sessionId");
    const tenantId = identifier(input.tenant?.tenantId, "tenant.tenantId");
    const agentId = identifier(input.agentId, "agentId");
    const adapterId = identifier(input.adapterId, "adapterId");
    const adapterVersion = boundedText(
      input.adapterVersion,
      "adapterVersion",
      128,
    );
    const role = normalizeRoleBindingV1(input.role);
    if (role.roleRevision !== 1 || role.predecessorRoleBindingId !== null) {
      throw validation("a new session must start with role revision 1");
    }
    const requirements = normalizeAdapterRequirementsV1(input.requirements);
    const bound = this.registry.resolve({ adapterId, adapterVersion });
    if (!bound) {
      throw new PortableAgentErrorV1(
        "NOT_FOUND",
        `adapter "${adapterId}" version "${adapterVersion}" is not registered`,
      );
    }
    const negotiation = this.registry.negotiate(bound.manifest, requirements);
    if (!negotiation.accepted) {
      throw new PortableAgentErrorV1(
        "ADAPTER_INCOMPATIBLE",
        `adapter is missing required capabilities: ${negotiation.missing.join(", ")}`,
      );
    }
    const now = this.now();
    const snapshot: PortableAgentSessionSnapshotV1 = {
      schemaVersion: 1,
      sessionId,
      tenantId,
      agentId,
      objectiveId: role.objectiveId,
      manifest: bound.manifest,
      controlBinding: this.controlBinding(),
      role,
      status: "active",
      revision: 0,
      nextStepSequence: 1,
      stepRecords: [],
      checkpoint: null,
      metadata: normalizeMetadata(input.metadata ?? {}, "session.metadata"),
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    };
    const normalized = this.assertSnapshotSize(snapshot);
    await this.stateStore.save(normalized, null);
    return cloneAndFreeze(normalized);
  }

  async getSession(
    sessionIdInput: AgentPlatID,
  ): Promise<PortableAgentSessionSnapshotV1 | undefined> {
    const sessionId = identifier(sessionIdInput, "sessionId");
    const snapshot = await this.stateStore.load(sessionId);
    if (snapshot === undefined) return undefined;
    return this.assertBoundSnapshot(snapshot, sessionId).snapshot;
  }

  async updateRole(
    sessionIdInput: AgentPlatID,
    roleInput: PortableAgentRoleBindingV1,
    expectedRevision: number,
  ): Promise<PortableAgentSessionSnapshotV1> {
    const sessionId = identifier(sessionIdInput, "sessionId");
    return this.exclusive(sessionId, async () => {
      const { snapshot } = await this.loadBound(sessionId);
      this.requireRevision(snapshot, expectedRevision);
      if (snapshot.status !== "active" && snapshot.status !== "paused") {
        throw new PortableAgentErrorV1(
          "SESSION_NOT_ACTIVE",
          `session "${sessionId}" cannot accept a new role`,
        );
      }
      const role = normalizeRoleBindingV1(roleInput);
      if (
        role.objectiveId !== snapshot.objectiveId ||
        role.roleRevision !== snapshot.role.roleRevision + 1 ||
        role.predecessorRoleBindingId !== snapshot.role.roleBindingId
      ) {
        throw validation(
          "role update does not extend the current role binding",
        );
      }
      return this.commit(snapshot, { role });
    });
  }

  async step(
    sessionIdInput: AgentPlatID,
    requestInput: PortableAgentStepRequestV1,
    options: PortableAgentStepOptionsV1 = {},
  ): Promise<PortableAgentStepOutcomeV1> {
    const sessionId = identifier(sessionIdInput, "sessionId");
    return this.exclusive(sessionId, async (operationSignal) => {
      const { snapshot, adapter } = await this.loadBound(sessionId);
      const request = normalizeStepRequestV1(requestInput, snapshot.manifest);
      const existing = snapshot.stepRecords.find(
        ({ stepId }) => stepId === request.stepId,
      );
      if (existing) {
        if (!sameJson(existing.request, request)) {
          throw new PortableAgentErrorV1(
            "CONFLICT",
            `step "${request.stepId}" was already used with different input`,
          );
        }
        return Object.freeze({
          session: cloneAndFreeze(snapshot),
          record: cloneAndFreeze(existing),
        });
      }
      this.requireRevision(snapshot, request.expectedSessionRevision);
      if (snapshot.status !== "active") {
        throw new PortableAgentErrorV1(
          "SESSION_NOT_ACTIVE",
          `session "${sessionId}" is not active`,
        );
      }
      if (
        snapshot.nextStepSequence > snapshot.manifest.maximumStepsPerSession
      ) {
        throw validation("session step limit has been reached");
      }
      if (
        request.logicalTimeMs < snapshot.role.validFromLogicalMs ||
        request.logicalTimeMs >= snapshot.role.validUntilLogicalMs
      ) {
        throw validation(
          "the current role is not valid at the step logical time",
        );
      }
      const signal = combineSignals(operationSignal, options.signal);
      const startedAt = this.now();
      const result = await this.executeStep(
        snapshot,
        adapter,
        request,
        signal,
        options,
      );
      const completedAt = this.now();
      const record = cloneAndFreeze({
        schemaVersion: 1 as const,
        stepId: request.stepId,
        stepSequence: snapshot.nextStepSequence,
        roleBindingId: snapshot.role.roleBindingId,
        roleRevision: snapshot.role.roleRevision,
        interactionMode: request.interactionMode,
        status: result.status,
        request,
        result,
        startedAt,
        completedAt,
      });
      const session = await this.commit(snapshot, {
        status: result.status === "paused" ? "paused" : "active",
        nextStepSequence: snapshot.nextStepSequence + 1,
        stepRecords: [...snapshot.stepRecords, record],
        checkpoint: result.checkpoint ?? snapshot.checkpoint,
      });
      return Object.freeze({ session, record });
    });
  }

  async pause(
    sessionIdInput: AgentPlatID,
    options: PortableAgentStepOptionsV1 = {},
  ): Promise<PortableAgentSessionSnapshotV1> {
    const sessionId = identifier(sessionIdInput, "sessionId");
    const running = this.active.get(sessionId);
    if (running) {
      running.controller.abort("session_paused");
      await running.completed;
    }
    return this.exclusive(sessionId, async (operationSignal) => {
      const { snapshot, adapter } = await this.loadBound(sessionId);
      if (snapshot.status === "paused") return snapshot;
      if (snapshot.status !== "active") {
        throw new PortableAgentErrorV1(
          "SESSION_NOT_ACTIVE",
          `session "${sessionId}" cannot be paused`,
        );
      }
      let checkpoint = snapshot.checkpoint;
      if (snapshot.manifest.supportsCheckpoint) {
        checkpoint = await this.createCheckpoint(
          snapshot,
          adapter,
          combineSignals(operationSignal, options.signal),
          options,
        );
      }
      return this.commit(snapshot, { status: "paused", checkpoint });
    });
  }

  async resume(
    sessionIdInput: AgentPlatID,
    options: PortableAgentStepOptionsV1 = {},
  ): Promise<PortableAgentSessionSnapshotV1> {
    const sessionId = identifier(sessionIdInput, "sessionId");
    return this.exclusive(sessionId, async (operationSignal) => {
      const { snapshot, adapter } = await this.loadBound(sessionId);
      if (snapshot.status !== "paused") {
        throw new PortableAgentErrorV1(
          "SESSION_NOT_ACTIVE",
          `session "${sessionId}" is not paused`,
        );
      }
      if (snapshot.checkpoint !== null) {
        if (!snapshot.manifest.supportsRestore || !adapter.restore) {
          throw new PortableAgentErrorV1(
            "STATE_INVALID",
            "session checkpoint cannot be restored by its bound adapter",
          );
        }
        await adapter.restore(
          {
            schemaVersion: 1,
            sessionId,
            tenantId: snapshot.tenantId,
            agentId: snapshot.agentId,
            checkpoint: snapshot.checkpoint,
          },
          this.adapterContext(
            snapshot,
            combineSignals(operationSignal, options.signal),
            options,
          ),
        );
      }
      return this.commit(snapshot, { status: "active" });
    });
  }

  async close(
    sessionIdInput: AgentPlatID,
  ): Promise<PortableAgentSessionSnapshotV1> {
    const sessionId = identifier(sessionIdInput, "sessionId");
    const running = this.active.get(sessionId);
    if (running) {
      running.controller.abort("session_closed");
      await running.completed;
    }
    return this.exclusive(sessionId, async () => {
      const { snapshot } = await this.loadBound(sessionId);
      if (snapshot.status === "closed") return snapshot;
      return this.commit(snapshot, { status: "closed", closedAt: this.now() });
    });
  }

  private async executeStep(
    snapshot: PortableAgentSessionSnapshotV1,
    adapter: PortableAgentAdapterV1,
    request: PortableAgentStepRequestV1,
    signal: AbortSignal,
    options: PortableAgentStepOptionsV1,
  ): Promise<PortableAgentStepResultV1> {
    const preStep = await this.evaluateControl(
      "pre_step",
      snapshot,
      request,
      null,
      null,
    );
    if (preStep.disposition !== "allow") {
      return this.refusedResult(snapshot, request, preStep.reasonCode);
    }
    if (signal.aborted) {
      return this.pausedResult(snapshot, request, "execution_aborted");
    }
    let result: PortableAgentStepResultV1;
    try {
      result = normalizeStepResultV1(
        await adapter.step(
          {
            schemaVersion: 1,
            sessionId: snapshot.sessionId,
            tenantId: snapshot.tenantId,
            agentId: snapshot.agentId,
            stepSequence: snapshot.nextStepSequence,
            role: snapshot.role,
            request,
            previousCheckpoint: snapshot.checkpoint,
          },
          this.adapterContext(snapshot, signal, options, request.stepId),
        ),
        {
          sessionId: snapshot.sessionId,
          stepId: request.stepId,
          stepSequence: snapshot.nextStepSequence,
          manifest: snapshot.manifest,
        },
      );
    } catch {
      return signal.aborted
        ? this.pausedResult(snapshot, request, "execution_aborted")
        : this.failedResult(snapshot, request, "adapter_error");
    }
    if (result.status !== "completed") {
      return cloneAndFreeze({ ...result, outputs: [], actionProposals: [] });
    }
    for (const output of result.outputs) {
      const decision = await this.evaluateControl(
        "post_output",
        snapshot,
        request,
        output,
        null,
      );
      if (decision.disposition !== "allow") {
        return this.refusedResult(snapshot, request, decision.reasonCode);
      }
    }
    for (const action of result.actionProposals) {
      const decision = await this.evaluateControl(
        "pre_action",
        snapshot,
        request,
        null,
        action,
      );
      if (decision.disposition !== "allow") {
        return this.refusedResult(snapshot, request, decision.reasonCode);
      }
    }
    return result;
  }

  private async evaluateControl(
    checkpoint: PortableAgentControlPointV1,
    snapshot: PortableAgentSessionSnapshotV1,
    request: PortableAgentStepRequestV1,
    output: Parameters<
      PortableAgentSessionRuntimeOptionsV1["control"]["evaluate"]
    >[0]["output"],
    actionProposal: Parameters<
      PortableAgentSessionRuntimeOptionsV1["control"]["evaluate"]
    >[0]["actionProposal"],
  ): Promise<PortableAgentControlDecisionV1> {
    try {
      return normalizeControlDecisionV1(
        await this.control.evaluate({
          schemaVersion: 1,
          checkpoint,
          manifest: snapshot.manifest,
          sessionId: snapshot.sessionId,
          tenantId: snapshot.tenantId,
          agentId: snapshot.agentId,
          role: snapshot.role,
          request,
          output,
          actionProposal,
        }),
      );
    } catch {
      return Object.freeze({
        disposition: "deny" as const,
        reasonCode: "control_unavailable",
      });
    }
  }

  private refusedResult(
    snapshot: PortableAgentSessionSnapshotV1,
    request: PortableAgentStepRequestV1,
    reasonCode: string,
  ): PortableAgentStepResultV1 {
    return cloneAndFreeze({
      schemaVersion: 1,
      sessionId: snapshot.sessionId,
      stepId: request.stepId,
      stepSequence: snapshot.nextStepSequence,
      status: "refused",
      outputs: [],
      actionProposals: [],
      checkpoint: null,
      reasonCode: boundedText(reasonCode, "control reasonCode", 256),
      metadata: {},
    });
  }

  private pausedResult(
    snapshot: PortableAgentSessionSnapshotV1,
    request: PortableAgentStepRequestV1,
    reasonCode: string,
  ): PortableAgentStepResultV1 {
    return cloneAndFreeze({
      schemaVersion: 1,
      sessionId: snapshot.sessionId,
      stepId: request.stepId,
      stepSequence: snapshot.nextStepSequence,
      status: "paused",
      outputs: [],
      actionProposals: [],
      checkpoint: null,
      reasonCode,
      metadata: {},
    });
  }

  private failedResult(
    snapshot: PortableAgentSessionSnapshotV1,
    request: PortableAgentStepRequestV1,
    reasonCode: string,
  ): PortableAgentStepResultV1 {
    return cloneAndFreeze({
      schemaVersion: 1,
      sessionId: snapshot.sessionId,
      stepId: request.stepId,
      stepSequence: snapshot.nextStepSequence,
      status: "failed",
      outputs: [],
      actionProposals: [],
      checkpoint: null,
      reasonCode,
      metadata: {},
    });
  }

  private async createCheckpoint(
    snapshot: PortableAgentSessionSnapshotV1,
    adapter: PortableAgentAdapterV1,
    signal: AbortSignal,
    options: PortableAgentStepOptionsV1,
  ): Promise<PortableAgentCheckpointV1> {
    if (!adapter.checkpoint) {
      throw new PortableAgentErrorV1(
        "STATE_INVALID",
        "adapter checkpoint implementation is missing",
      );
    }
    return normalizeCheckpointV1(
      await adapter.checkpoint(
        {
          schemaVersion: 1,
          sessionId: snapshot.sessionId,
          tenantId: snapshot.tenantId,
          agentId: snapshot.agentId,
          throughStepSequence: snapshot.nextStepSequence - 1,
          previousCheckpoint: snapshot.checkpoint,
        },
        this.adapterContext(snapshot, signal, options),
      ),
      {
        sessionId: snapshot.sessionId,
        manifest: snapshot.manifest,
        maximumSequence: snapshot.nextStepSequence - 1,
      },
    );
  }

  private adapterContext(
    snapshot: PortableAgentSessionSnapshotV1,
    signal: AbortSignal,
    options: PortableAgentStepOptionsV1,
    stepId?: string,
  ): PortableAgentAdapterContextV1 {
    const tenant: TenantContext =
      options.tenant === undefined
        ? { tenantId: snapshot.tenantId }
        : cloneAndFreeze(options.tenant);
    if (tenant.tenantId !== snapshot.tenantId) {
      throw validation("step tenant context does not match the session");
    }
    return Object.freeze({
      tenant,
      agentId: snapshot.agentId,
      sessionId: snapshot.sessionId,
      ...(stepId === undefined ? {} : { stepId }),
      signal,
      ...(options.credentials === undefined
        ? {}
        : { credentials: Object.freeze({ ...options.credentials }) }),
      ...(options.metadata === undefined
        ? {}
        : { metadata: normalizeMetadata(options.metadata, "step.metadata") }),
    });
  }

  private async loadBound(sessionId: string): Promise<{
    readonly snapshot: PortableAgentSessionSnapshotV1;
    readonly adapter: PortableAgentAdapterV1;
  }> {
    const snapshot = await this.stateStore.load(sessionId);
    if (!snapshot) {
      throw new PortableAgentErrorV1(
        "NOT_FOUND",
        `session "${sessionId}" was not found`,
      );
    }
    return this.assertBoundSnapshot(snapshot, sessionId);
  }

  private assertBoundSnapshot(
    snapshotInput: PortableAgentSessionSnapshotV1,
    sessionId: string,
  ): {
    snapshot: PortableAgentSessionSnapshotV1;
    adapter: PortableAgentAdapterV1;
  } {
    const registered = this.registry.resolve({
      adapterId: snapshotInput.manifest.adapterId,
      adapterVersion: snapshotInput.manifest.adapterVersion,
    });
    if (!registered) {
      throw new PortableAgentErrorV1(
        "STATE_INVALID",
        "session adapter is no longer registered",
      );
    }
    const snapshot = assertStoredPortableSessionV1(snapshotInput, {
      sessionId,
      control: this.controlBinding(),
      manifest: registered.manifest,
    });
    return { snapshot, adapter: registered.adapter };
  }

  private async commit(
    snapshot: PortableAgentSessionSnapshotV1,
    changes: Partial<PortableAgentSessionSnapshotV1>,
  ): Promise<PortableAgentSessionSnapshotV1> {
    const updated = this.assertSnapshotSize({
      ...snapshot,
      ...changes,
      schemaVersion: 1,
      sessionId: snapshot.sessionId,
      revision: snapshot.revision + 1,
      updatedAt: this.now(),
    });
    await this.stateStore.save(updated, snapshot.revision);
    return cloneAndFreeze(updated);
  }

  private assertSnapshotSize(
    snapshot: PortableAgentSessionSnapshotV1,
  ): PortableAgentSessionSnapshotV1 {
    const normalized = assertStoredPortableSessionV1(snapshot, {
      sessionId: snapshot.sessionId,
      control: this.controlBinding(),
      manifest: snapshot.manifest,
    });
    if (
      jsonByteLength(
        normalizeJson(normalized, "session snapshot") as JsonValue,
      ) > this.maximumSessionSnapshotBytes
    ) {
      throw validation("session snapshot exceeds its byte limit");
    }
    return normalized;
  }

  private requireRevision(
    snapshot: PortableAgentSessionSnapshotV1,
    expectedRevision: number,
  ): void {
    if (
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 0 ||
      snapshot.revision !== expectedRevision
    ) {
      throw new PortableAgentErrorV1(
        "STATE_CONFLICT",
        `session "${snapshot.sessionId}" revision conflict`,
      );
    }
  }

  private controlBinding(): PortableAgentSessionSnapshotV1["controlBinding"] {
    return Object.freeze({
      controlId: this.control.controlId,
      controlVersion: this.control.controlVersion,
      implementationId: this.control.implementationId,
    });
  }

  private now(): string {
    const value = this.clock();
    if (!(value instanceof Date) || !Number.isFinite(value.valueOf())) {
      throw validation("clock must return a valid Date");
    }
    return value.toISOString();
  }

  private async exclusive<T>(
    sessionId: string,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (this.active.has(sessionId)) {
      throw new PortableAgentErrorV1(
        "SESSION_ACTIVE",
        `session "${sessionId}" already has an active operation`,
      );
    }
    const controller = new AbortController();
    let complete!: () => void;
    const completed = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const active = { controller, completed, complete };
    this.active.set(sessionId, active);
    try {
      return await operation(controller.signal);
    } finally {
      if (this.active.get(sessionId) === active) this.active.delete(sessionId);
      complete();
    }
  }
}

function combineSignals(
  operationSignal: AbortSignal,
  callerSignal?: AbortSignal,
): AbortSignal {
  return callerSignal === undefined
    ? operationSignal
    : AbortSignal.any([operationSignal, callerSignal]);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function boundedText(input: unknown, label: string, maximum: number): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.length > maximum ||
    input.trim() !== input ||
    /[\u0000-\u001f\u007f]/u.test(input)
  ) {
    throw validation(`${label} must be bounded text`);
  }
  return input;
}

function validation(message: string): PortableAgentErrorV1 {
  return new PortableAgentErrorV1("VALIDATION_ERROR", message);
}
