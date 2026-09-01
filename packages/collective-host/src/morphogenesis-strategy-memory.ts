import type { AgentPlatID } from "@agentplat/core";
import type { MemoryStore } from "@agentplat/memory";
import {
  validateMorphogenesisStrategyMemoryRecordV3,
  type MorphogenesisStrategyMemoryPortV3,
  type MorphogenesisStrategyMemoryRecordV3,
} from "@agentplat/collective-runtime/morphogenesis";

/**
 * Content-free projection into AgentPlat Memory. Governance state remains the
 * authority; Memory is a scoped recall/index surface only.
 */
export class AgentPlatMemoryMorphogenesisStrategyPortV3
  implements MorphogenesisStrategyMemoryPortV3
{
  constructor(readonly options: {
    readonly store: MemoryStore;
    readonly tenantId: AgentPlatID;
    readonly sessionId: AgentPlatID;
    readonly agentId: AgentPlatID;
    readonly logicalTimeToIso: (logicalTimeMs: number) => string;
  }) {
    if (!options?.store || typeof options.logicalTimeToIso !== "function")
      throw new TypeError("Morphogenesis strategy Memory options are required");
  }

  async remember(input: MorphogenesisStrategyMemoryRecordV3) {
    const record = validateMorphogenesisStrategyMemoryRecordV3(input);
    if (record.tenantId !== this.options.tenantId)
      throw new TypeError("Morphogenesis strategy Memory tenant is invalid");
    await this.#ensureSession(record.recordedAtLogicalMs);
    const messages = await this.options.store.listMessages(
      this.options.tenantId,
      this.options.sessionId,
    );
    const retained = messages.find(({ id }) => id === record.recordId);
    const content = JSON.stringify(record);
    if (retained) {
      if (retained.content !== content)
        throw new Error("Morphogenesis strategy Memory identity conflict");
      return "replayed" as const;
    }
    const createdAt = this.#instant(record.recordedAtLogicalMs);
    await this.options.store.appendMessage({
      id: record.recordId,
      tenantId: record.tenantId,
      sessionId: this.options.sessionId,
      role: "system",
      name: "agentplat.morphogenesis.strategy.v3",
      content,
      metadata: {
        schemaVersion: 3,
        kind: record.kind,
        scopeDigest: record.scopeDigest,
        recordDigest: record.recordDigest,
        authorityGranted: false,
      },
      createdAt,
    });
    return "created" as const;
  }

  async list(input: {
    readonly tenantId: AgentPlatID;
    readonly missionIntentId: AgentPlatID;
    readonly objectiveId: AgentPlatID;
    readonly maximumRecords: number;
  }) {
    if (input.tenantId !== this.options.tenantId ||
        !Number.isSafeInteger(input.maximumRecords) || input.maximumRecords < 1 ||
        input.maximumRecords > 10_000)
      throw new TypeError("Morphogenesis strategy Memory query is invalid");
    const session = await this.options.store.getSession(input.tenantId, this.options.sessionId);
    if (!session) return Object.freeze([]);
    const records = (await this.options.store.listMessages(input.tenantId, this.options.sessionId))
      .filter(({ name }) => name === "agentplat.morphogenesis.strategy.v3")
      .map(({ content }) => validateMorphogenesisStrategyMemoryRecordV3(JSON.parse(content)))
      .filter((record) => record.missionIntentId === input.missionIntentId &&
        record.objectiveId === input.objectiveId)
      .sort((a, b) => a.recordedAtLogicalMs - b.recordedAtLogicalMs ||
        a.recordId.localeCompare(b.recordId))
      .slice(-input.maximumRecords);
    return Object.freeze(records);
  }

  async #ensureSession(logicalTimeMs: number) {
    const current = await this.options.store.getSession(
      this.options.tenantId,
      this.options.sessionId,
    );
    if (current) {
      if (current.agentId !== this.options.agentId)
        throw new TypeError("Morphogenesis strategy Memory session owner is invalid");
      return;
    }
    await this.options.store.createSession({
      id: this.options.sessionId,
      tenantId: this.options.tenantId,
      agentId: this.options.agentId,
      title: "Agent Morphogenesis Strategy Evidence",
      metadata: { contentClass: "morphogenesis_strategy_v3", authorityGranted: false },
      createdAt: this.#instant(logicalTimeMs),
      updatedAt: this.#instant(logicalTimeMs),
    });
  }

  #instant(logicalTimeMs: number) {
    const value = this.options.logicalTimeToIso(logicalTimeMs);
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
      throw new TypeError("Morphogenesis strategy Memory time is invalid");
    return value;
  }
}
