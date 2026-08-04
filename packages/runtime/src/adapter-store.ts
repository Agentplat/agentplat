import type { AgentPlatID } from "@agentplat/core";

import type {
  PortableAgentSessionSnapshotV1,
  PortableAgentStateStoreV1,
} from "./adapter-contracts.js";
import { PortableAgentErrorV1 } from "./adapter-errors.js";
import {
  assertStoredPortableSessionV1,
  cloneAndFreeze,
} from "./adapter-validation.js";

/** Revision-checked, process-local session store for prototypes and tests. */
export class InMemoryPortableAgentStateStoreV1 implements PortableAgentStateStoreV1 {
  private readonly sessions = new Map<
    AgentPlatID,
    PortableAgentSessionSnapshotV1
  >();

  async load(
    sessionId: AgentPlatID,
  ): Promise<PortableAgentSessionSnapshotV1 | undefined> {
    const snapshot = this.sessions.get(sessionId);
    return snapshot === undefined ? undefined : cloneAndFreeze(snapshot);
  }

  async save(
    snapshotInput: PortableAgentSessionSnapshotV1,
    expectedRevision: number | null,
  ): Promise<void> {
    const snapshot = assertStoredPortableSessionV1(snapshotInput);
    const existing = this.sessions.get(snapshot.sessionId);
    if (expectedRevision === null) {
      if (existing !== undefined || snapshot.revision !== 0) {
        throw new PortableAgentErrorV1(
          "STATE_CONFLICT",
          `session "${snapshot.sessionId}" already exists`,
        );
      }
    } else if (
      existing === undefined ||
      existing.revision !== expectedRevision ||
      snapshot.revision !== expectedRevision + 1
    ) {
      throw new PortableAgentErrorV1(
        "STATE_CONFLICT",
        `session "${snapshot.sessionId}" revision conflict`,
      );
    }
    this.sessions.set(snapshot.sessionId, cloneAndFreeze(snapshot));
  }
}
