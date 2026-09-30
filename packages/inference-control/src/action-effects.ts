import type { ToolInvocationResult } from '@agentplat/tools';
import { actionInputDigest, controlDigest, type ActionDispatcher, type ControlJsonObject } from './tools.js';

/** Host-attested adapter capabilities, not proof of an arbitrary external service. */
export interface ActionExternalEffectCapabilitiesV1 {
  readonly executorId: string;
  readonly executorVersion: number;
  readonly atomicPreconditions: boolean;
  readonly idempotency: 'native' | 'durable_adapter' | 'none';
  readonly receiptLookup: boolean;
}
export interface ActionExternalEffectReceiptV1 {
  readonly schemaVersion: 1;
  readonly idempotencyKey: string;
  readonly actionDigest: string;
  readonly inputDigest: string;
  readonly preconditionsDigest: string;
  readonly outcome: 'succeeded' | 'not_applied';
  readonly proofRef: string;
  readonly result: ToolInvocationResult;
}
export interface ActionConditionalExecutionPortV1 {
  readonly capabilities: ActionExternalEffectCapabilitiesV1;
  /**
   * Apply preconditions and effect atomically at the destination, retaining an
   * immutable receipt under the idempotency key. A not_applied receipt proves
   * this attempt cannot apply later under that key. Throws mean uncertainty.
   */
  execute(input: Parameters<ActionDispatcher['dispatch']>[0] & {
    readonly preconditions: ControlJsonObject;
    readonly preconditionsDigest: string;
  }): Promise<ActionExternalEffectReceiptV1>;
}
/** Exact conditional-write contract; it does not issue grants or reserve budgets. */
export function createConditionalActionDispatcherV1(options: {
  readonly dispatcherId: string;
  readonly dispatcherVersion: number;
  readonly fencingMode: 'local_only' | 'downstream_atomic';
  readonly port: ActionConditionalExecutionPortV1;
  /** Load immutable reviewed constraints, not a newly read permissive baseline. */
  readonly resolvePreconditions: (input: Parameters<ActionDispatcher['dispatch']>[0]) => Promise<{
    readonly preconditions: ControlJsonObject;
    readonly approvedPreconditionsDigest: string;
  }>;
}): ActionDispatcher {
  const capabilities = Object.freeze({ ...options.port.capabilities });
  if (!options.dispatcherId.trim() || !Number.isSafeInteger(options.dispatcherVersion) || options.dispatcherVersion < 1 ||
      !capabilities.executorId.trim() || !Number.isSafeInteger(capabilities.executorVersion) || capabilities.executorVersion < 1 ||
      capabilities.atomicPreconditions !== true || capabilities.idempotency === 'none' ||
      !['native','durable_adapter'].includes(capabilities.idempotency) || capabilities.receiptLookup !== true)
    throw new Error('conditional_action_capabilities_required');
  const execute = options.port.execute.bind(options.port);
  return Object.freeze({ dispatcherId: options.dispatcherId, dispatcherVersion: options.dispatcherVersion,
    fencingMode: options.fencingMode,
    async dispatch(input: Parameters<ActionDispatcher['dispatch']>[0]): Promise<ToolInvocationResult> {
      const constraints = await options.resolvePreconditions(input);
      const preconditions = structuredClone(constraints.preconditions);
      if (!preconditions || typeof preconditions !== 'object' || Array.isArray(preconditions))
        throw new Error('conditional_action_preconditions_mismatch');
      const preconditionsDigest = controlDigest('grant', preconditions);
      if (preconditionsDigest !== constraints.approvedPreconditionsDigest)
        throw new Error('conditional_action_preconditions_mismatch');
      const expected = { idempotencyKey: input.permit.idempotencyKey, actionDigest: input.permit.actionDigest,
        inputDigest: actionInputDigest(input.input), preconditionsDigest };
      const receipt = await execute({ ...input, preconditions, preconditionsDigest });
      if (receipt.schemaVersion !== 1 || receipt.idempotencyKey !== expected.idempotencyKey ||
          receipt.actionDigest !== expected.actionDigest || receipt.inputDigest !== expected.inputDigest ||
          receipt.preconditionsDigest !== expected.preconditionsDigest ||
          !['succeeded','not_applied'].includes(receipt.outcome) || typeof receipt.proofRef !== 'string' || !receipt.proofRef.trim() ||
          !receipt.result || typeof receipt.result.ok !== 'boolean' ||
          receipt.result.ok !== (receipt.outcome === 'succeeded'))
        throw new Error('conditional_action_receipt_mismatch');
      // Settlement/refund remains the existing admission reconciliation owner's job.
      return structuredClone(receipt.result);
    },
  });
}
