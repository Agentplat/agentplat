import type { AgentPlatID } from '@agentplat/core';

import type {
  CollectiveExecutionSnapshot,
  CollectiveStateStore,
} from './contracts.js';
import { CollectiveRuntimeError } from './errors.js';
import { cloneAndFreeze } from './validation.js';

/** Revision-checked, process-local store for prototypes and deterministic tests. */
export class InMemoryCollectiveStateStore implements CollectiveStateStore {
  private readonly executions = new Map<
    AgentPlatID,
    CollectiveExecutionSnapshot
  >();

  async load(
    executionId: AgentPlatID
  ): Promise<CollectiveExecutionSnapshot | undefined> {
    const snapshot = this.executions.get(executionId);
    return snapshot === undefined ? undefined : cloneAndFreeze(snapshot);
  }

  async save(
    snapshot: CollectiveExecutionSnapshot,
    expectedRevision: number | null
  ): Promise<void> {
    const existing = this.executions.get(snapshot.executionId);
    if (expectedRevision === null) {
      if (existing !== undefined || snapshot.revision !== 0) {
        throw new CollectiveRuntimeError(
          'STATE_CONFLICT',
          `execution "${snapshot.executionId}" already exists`
        );
      }
    } else if (
      existing === undefined ||
      existing.revision !== expectedRevision ||
      snapshot.revision !== expectedRevision + 1
    ) {
      throw new CollectiveRuntimeError(
        'STATE_CONFLICT',
        `execution "${snapshot.executionId}" revision conflict`
      );
    }
    this.executions.set(snapshot.executionId, cloneAndFreeze(snapshot));
  }
}
