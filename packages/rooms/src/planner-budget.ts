import { AgentPlatError } from "@agentplat/core";
import { eventRecordDigestV1, eventTokenV1 } from "@agentplat/events";
import type {
  RoomPlannerOperation,
  RoomPlannerScope,
  RoomPlannerSharedBudgetPortV1,
  RoomPlannerUsage,
} from "./room-planner-contracts.js";
import {
  SharedBudgetServiceV1,
  type AdmitSharedBudgetV1,
  type SharedBudgetAdmissionV1,
  type SharedBudgetReservationV1,
} from "./shared-budgets.js";

/** Connect every Planner/reason/task/review/direct call to the same native account. */
export function createRoomPlannerSharedBudgetV1<Context>(options: {
  service: SharedBudgetServiceV1<Context>;
  bindingId: string;
  context(scope: RoomPlannerScope): Promise<Context>;
  accountId(scope: RoomPlannerScope): string;
  currency: string;
  category(scope: RoomPlannerScope, operation: RoomPlannerOperation): string;
}): RoomPlannerSharedBudgetPortV1 {
  eventTokenV1(options.bindingId);
  const key = async (
    scope: RoomPlannerScope,
    operation: RoomPlannerOperation,
  ) => ({
    accountId: options.accountId(scope),
    operationId: `planner:${await eventRecordDigestV1({ tenantId: scope.tenantId, roomId: scope.roomId, operationId: operation.id })}`,
  });
  const receipt = async (
    scope: RoomPlannerScope,
    operation: RoomPlannerOperation,
  ) => {
    const context = await options.context(scope),
      input = await key(scope, operation);
    const record = await options.service.reservation(
      context,
      input.accountId,
      input.operationId,
    );
    if (record && record.tenantId !== scope.tenantId)
      throw new AgentPlatError("FORBIDDEN", "Planner and budget tenant differ");
    return { context, record };
  };
  return {
    bindingId: options.bindingId,
    admit: async (scope, operation) => {
      const result = await options.service.admit(
        await options.context(scope),
        {
          ...(await key(scope, operation)),
          currency: options.currency,
          category: options.category(scope, operation),
          maximumMicros: operation.reservedMicros,
          reference: (await key(scope, operation)).operationId,
          leaseMs: Math.max(
            1000,
            Math.min(
              600_000,
              Date.parse(operation.expiresAt) - Date.parse(operation.startedAt),
            ),
          ),
        },
        scope.tenantId,
      );
      if (result.reservation && result.reservation.tenantId !== scope.tenantId)
        throw new AgentPlatError(
          "FORBIDDEN",
          "Planner and budget tenant differ",
        );
      return result;
    },
    assertCurrent: async (scope, operation) => {
      const { context, record } = await receipt(scope, operation);
      if (!record || record.token !== operation.sharedBudget?.token)
        throw new AgentPlatError("CONFLICT", "Planner budget receipt changed");
      await options.service.assertCurrent(context, record);
    },
    settle: async (scope, operation, usage) => {
      const { context, record } = await receipt(scope, operation);
      if (!record) {
        if (
          usage.costMicros === 0 &&
          usage.inputTokens === 0 &&
          usage.outputTokens === 0
        )
          return;
        throw new AgentPlatError(
          "CONFLICT",
          "No shared reservation covers this usage",
        );
      }
      await options.service.settle(context, record, usage);
    },
    uncertain: async (scope, operation) => {
      const { context, record } = await receipt(scope, operation);
      if (record) await options.service.uncertain(context, record);
    },
  };
}

/** A failed call with independently reported usage is charged, including repairs and invalid output. */
export class SharedBudgetCallErrorV1 extends Error {
  constructor(
    message: string,
    readonly usage: RoomPlannerUsage,
  ) {
    super(message);
  }
}
/** Compose at a workflow/evidence effect boundary; stored workflow results still own result recovery. */
export async function runSharedBudgetCallV1<Context, Value>(
  service: SharedBudgetServiceV1<Context>,
  context: Context,
  input: AdmitSharedBudgetV1,
  invoke: (call: {
    reservation: SharedBudgetReservationV1;
    assertCurrent(): Promise<void>;
  }) => Promise<{ value: Value; usage: RoomPlannerUsage }>,
): Promise<{ admission: SharedBudgetAdmissionV1; value?: Value }> {
  const admission = await service.admit(context, input);
  if (!admission.admitted) return { admission };
  try {
    const call = {
      reservation: admission.reservation,
      assertCurrent: () =>
        service.assertCurrent(context, admission.reservation),
    };
    await call.assertCurrent();
    const result = await invoke(call);
    await service.settle(context, admission.reservation, result.usage);
    return { admission, value: result.value };
  } catch (error) {
    if (error instanceof SharedBudgetCallErrorV1)
      await service.settle(context, admission.reservation, error.usage);
    else await service.uncertain(context, admission.reservation);
    throw error;
  }
}
