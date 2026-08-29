import type { JsonObject } from "@agentplat/core";
import {
  WorkflowValidationErrorV1,
  digestWorkflowJsonV1,
  type GateProviderPortV1,
  type ProcessGateRequestV1,
  type ProcessGateResultV1,
  type ProcessRunnerV1,
} from "@agentplat/workflows";
import type {
  AgentRoomOperationalEvent,
  AgentRoomOperationalEventReader,
  AgentRoomProjectionCheckpointStore,
  Approval,
  RoomService,
  RoomState,
} from "@agentplat/rooms";

export * from "./autonomy.js";

export const AGENT_ROOM_APPROVAL_GATE_TYPE_V1 =
  "agentplat.room.approval.v1" as const;

export interface AgentRoomGateConfigurationV1 {
  readonly roomId: string;
  readonly targetType: "room" | "task" | "artifact" | "action";
  readonly targetId: string;
  readonly action?: string;
  readonly requestedBy?: string;
}

export interface AgentRoomGateProviderOptionsV1 {
  readonly rooms: Pick<
    RoomService,
    "getRoomState" | "requestApproval" | "expireApproval"
  >;
  readonly expirationActorId?: string;
}

/** Generic gate provider backed only by authoritative Agent Room approvals. */
export class AgentRoomGateProviderV1 implements GateProviderPortV1 {
  constructor(readonly options: AgentRoomGateProviderOptionsV1) {}

  async resolve(input: ProcessGateRequestV1): Promise<ProcessGateResultV1> {
    if (input.gateType !== AGENT_ROOM_APPROVAL_GATE_TYPE_V1)
      fail("room_gate_type_invalid");
    const configuration = validateAgentRoomGateConfigurationV1(
      input.configuration,
    );
    const gateRequestId = workflowRoomGateRequestIdV1(
      input.runId,
      input.stageId,
    );
    let state = await this.options.rooms.getRoomState(
      input.tenantId,
      configuration.roomId,
    );
    let chain = approvalChain(state, gateRequestId);
    if (chain.length === 0) {
      await this.#request(input, configuration, gateRequestId, 1);
      state = await this.options.rooms.getRoomState(
        input.tenantId,
        configuration.roomId,
      );
      chain = approvalChain(state, gateRequestId);
    }
    const approval = chain.at(-1);
    if (!approval) fail("room_gate_approval_missing_after_request");
    assertApprovalBinding(approval, configuration, gateRequestId);
    if (approval.status === "approved")
      return { status: "approved", gateRequestId };
    if (approval.status === "rejected")
      return {
        status: "rejected",
        gateRequestId,
        reasonCode: "room_approval_rejected",
      };
    if (approval.status === "expired")
      return {
        status: "expired",
        gateRequestId,
        reasonCode: "room_approval_expired",
      };
    if (approval.status === "needs_revision") {
      if (configuration.targetType !== "artifact")
        return {
          status: "rejected",
          gateRequestId,
          reasonCode: "room_approval_needs_revision",
        };
      const artifact = state.artifacts.find(
        (candidate) => candidate.id === configuration.targetId,
      );
      if (
        artifact &&
        artifact.currentVersion > (approval.targetVersion ?? 0) &&
        (!input.expiresAt ||
          Date.parse(input.logicalTime) < Date.parse(input.expiresAt))
      ) {
        await this.#request(
          input,
          configuration,
          gateRequestId,
          chain.length + 1,
        );
      }
      return { status: "waiting", gateRequestId };
    }
    if (
      input.expiresAt &&
      Date.parse(input.logicalTime) >= Date.parse(input.expiresAt)
    ) {
      const expired = await this.options.rooms.expireApproval(
        input.tenantId,
        approval.id,
        {
          expiredBy: this.options.expirationActorId,
          expectedExpiresAt: input.expiresAt,
        },
      );
      if (expired.status !== "expired") fail("room_gate_expiry_not_terminal");
      return {
        status: "expired",
        gateRequestId,
        reasonCode: "room_approval_expired",
      };
    }
    return { status: "waiting", gateRequestId };
  }

  async #request(
    input: ProcessGateRequestV1,
    configuration: AgentRoomGateConfigurationV1,
    gateRequestId: string,
    ordinal: number,
  ): Promise<void> {
    await this.options.rooms.requestApproval(
      input.tenantId,
      configuration.roomId,
      {
        id: `${gateRequestId}:approval:${ordinal}`,
        targetType: configuration.targetType,
        targetId: configuration.targetId,
        action: configuration.action,
        requestedBy: configuration.requestedBy,
        expiresAt: input.expiresAt,
      },
    );
  }
}

export interface WorkflowRoomGateProjectorOptionsV1 {
  readonly events: AgentRoomOperationalEventReader;
  readonly checkpoints: AgentRoomProjectionCheckpointStore;
  readonly rooms: Pick<RoomService, "getRoomState">;
  readonly runner: ProcessRunnerV1;
}

/** Projects Room decisions into idempotent wakeups, never into authority. */
export class WorkflowRoomGateProjectorV1 {
  constructor(readonly options: WorkflowRoomGateProjectorOptionsV1) {}

  async project(input: {
    readonly tenantId: string;
    readonly roomId: string;
    readonly limit?: number;
  }): Promise<{ readonly projected: number; readonly sequence: number }> {
    const projectionId = `workflow-room-gates:${input.tenantId}:${input.roomId}`;
    let sequence = await this.options.checkpoints.load(projectionId);
    const events = await this.options.events.listAfter({
      tenantId: input.tenantId,
      roomId: input.roomId,
      afterSequence: sequence,
      limit: input.limit ?? 100,
    });
    for (const event of events) {
      await this.#projectEvent(event);
      if (
        !(await this.options.checkpoints.compareAndSet({
          projectionId,
          expectedSequence: sequence,
          nextSequence: event.sequence,
        }))
      )
        fail("room_gate_projection_checkpoint_conflict");
      sequence = event.sequence;
    }
    return Object.freeze({ projected: events.length, sequence });
  }

  async projectAll(limit = 1_000): Promise<readonly unknown[]> {
    if (!this.options.events.listScopes)
      fail("room_gate_scope_discovery_unavailable");
    const results = [];
    for (const scope of await this.options.events.listScopes(limit))
      results.push(await this.project(scope));
    return Object.freeze(results);
  }

  async #projectEvent(event: AgentRoomOperationalEvent): Promise<void> {
    if (event.source !== "events") return;
    const state = await this.options.rooms.getRoomState(
      event.tenantId,
      event.roomId,
    );
    const approvals = approvalsForEvent(event, state);
    for (const approval of approvals) {
      const parsed = parseWorkflowRoomApprovalIdV1(approval.id);
      if (!parsed) continue;
      if (approval.roomId !== event.roomId)
        fail("room_gate_event_room_mismatch");
      const run = await this.options.runner.describe({
        tenantId: event.tenantId,
        runId: parsed.runId,
      });
      if (!run) continue;
      const logicalTime =
        event.occurredAt >= run.updatedAt ? event.occurredAt : run.updatedAt;
      const identity = `room-event:${event.sourceId}:${approval.id}`;
      await this.options.runner.signal({
        tenantId: event.tenantId,
        runId: parsed.runId,
        operationId: identity,
        idempotencyKey: identity,
        logicalTime,
        signal: {
          signalId: identity,
          signalType: "agentplat.room.approval.changed",
          correlationKey: parsed.stageId,
          payload: {
            roomId: approval.roomId,
            approvalId: approval.id,
            status: approval.status,
            targetId: approval.targetId,
            targetVersion: approval.targetVersion ?? null,
          },
          sourceType: "agentplat.room.operational-event",
          sourceId: event.sourceId,
          sourceRevision: event.sequence,
          receivedAt: event.occurredAt,
        },
      });
    }
  }
}

export function validateAgentRoomGateConfigurationV1(
  input: JsonObject | undefined,
): AgentRoomGateConfigurationV1 {
  if (!input || Array.isArray(input) || typeof input !== "object")
    fail("room_gate_configuration_invalid");
  const expected = [
    "roomId",
    "targetType",
    "targetId",
    ...(input.action !== undefined ? ["action"] : []),
    ...(input.requestedBy !== undefined ? ["requestedBy"] : []),
  ].sort();
  const actual = Object.getOwnPropertyNames(input).sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail("room_gate_configuration_shape_invalid");
  required(input.roomId, "roomId");
  required(input.targetId, "targetId");
  if (
    typeof input.targetType !== "string" ||
    !["room", "task", "artifact", "action"].includes(input.targetType)
  )
    fail("room_gate_target_type_invalid");
  if (input.action !== undefined) required(input.action, "action");
  if (input.requestedBy !== undefined)
    required(input.requestedBy, "requestedBy");
  return Object.freeze({
    roomId: input.roomId,
    targetType: input.targetType as AgentRoomGateConfigurationV1["targetType"],
    targetId: input.targetId,
    ...(input.action !== undefined ? { action: input.action } : {}),
    ...(input.requestedBy !== undefined
      ? { requestedBy: input.requestedBy }
      : {}),
  });
}

export function workflowRoomGateRequestIdV1(
  runId: string,
  stageId: string,
): string {
  required(runId, "runId");
  required(stageId, "stageId");
  return `workflow-room:${encodeURIComponent(runId)}:${encodeURIComponent(stageId)}`;
}

export function parseWorkflowRoomApprovalIdV1(approvalId: string): {
  readonly runId: string;
  readonly stageId: string;
  readonly ordinal: number;
} | null {
  const match = /^workflow-room:([^:]+):([^:]+):approval:([1-9][0-9]*)$/u.exec(
    approvalId,
  );
  if (!match) return null;
  const ordinal = Number(match[3]);
  if (!Number.isSafeInteger(ordinal)) return null;
  try {
    return Object.freeze({
      runId: decodeURIComponent(match[1]),
      stageId: decodeURIComponent(match[2]),
      ordinal,
    });
  } catch {
    return null;
  }
}

function approvalChain(state: RoomState, gateRequestId: string): Approval[] {
  return state.approvals
    .filter((approval) => approval.id.startsWith(`${gateRequestId}:approval:`))
    .filter((approval) => parseWorkflowRoomApprovalIdV1(approval.id))
    .sort(
      (left, right) =>
        parseWorkflowRoomApprovalIdV1(left.id)!.ordinal -
        parseWorkflowRoomApprovalIdV1(right.id)!.ordinal,
    );
}

function assertApprovalBinding(
  approval: Approval,
  configuration: AgentRoomGateConfigurationV1,
  gateRequestId: string,
): void {
  if (
    !approval.id.startsWith(`${gateRequestId}:approval:`) ||
    approval.roomId !== configuration.roomId ||
    approval.targetType !== configuration.targetType ||
    approval.targetId !== configuration.targetId ||
    approval.action !== configuration.action
  )
    fail("room_gate_approval_binding_mismatch");
}

function approvalsForEvent(
  event: AgentRoomOperationalEvent,
  state: RoomState,
): Approval[] {
  if (
    [
      "approval_requested",
      "approval_granted",
      "approval_rejected",
      "approval_needs_revision",
      "approval_expired",
    ].includes(event.eventType)
  ) {
    const approvalId = event.payload.approvalId;
    if (typeof approvalId !== "string")
      fail("room_gate_event_approval_missing");
    const approval = state.approvals.find(
      (candidate) => candidate.id === approvalId,
    );
    if (!approval) fail("room_gate_event_approval_not_found");
    return [approval];
  }
  if (event.eventType === "artifact_updated") {
    const artifactId = event.payload.artifactId;
    if (typeof artifactId !== "string") return [];
    return state.approvals.filter(
      (approval) =>
        approval.targetType === "artifact" &&
        approval.targetId === artifactId &&
        approval.status === "needs_revision" &&
        parseWorkflowRoomApprovalIdV1(approval.id),
    );
  }
  return [];
}

function required(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 512 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    fail(`room_gate_${label}_invalid`);
}

function fail(message: string): never {
  throw new WorkflowValidationErrorV1(message);
}
