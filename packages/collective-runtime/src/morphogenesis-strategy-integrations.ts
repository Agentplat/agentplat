import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import {
  createLocalStrategySafetySignalSourceV1,
  createLocalStrategyTrustSafetySignalV1,
} from "./strategy-adaptation-adapters.js";
import type { LocalStrategySelectionRequestV1 } from "./strategy-adaptation-contracts.js";
import {
  validateMorphogenesisStrategyCatalogV3,
  validateMorphogenesisStrategyContextV3,
  type MorphogenesisStrategyCatalogV3,
  type MorphogenesisStrategyContextV3,
} from "./morphogenesis-strategy-adaptation.js";

export interface MorphogenesisStrategyContextResolutionPortV3 {
  resolve(contextDigest: PlanningDigestV1): Promise<MorphogenesisStrategyContextV3 | null>;
}

export interface MorphogenesisStrategyTrustAssessmentPortV3 {
  assess(input: {
    readonly request: LocalStrategySelectionRequestV1;
    readonly context: MorphogenesisStrategyContextV3;
    readonly strategyId: AgentPlatID;
    readonly definitionDigest: PlanningDigestV1;
  }): Promise<{
    readonly contextDigest: PlanningDigestV1;
    readonly definitionDigest: PlanningDigestV1;
    readonly disposition: "eligible" | "restricted" | "quarantined" | "unavailable";
    readonly sourceId: AgentPlatID;
    readonly sourceVersion: number;
    readonly sourceImplementationDigest: PlanningDigestV1;
    readonly sourceRevision: number;
    readonly evidenceDigest: PlanningDigestV1;
    readonly observedAtLogicalMs: number;
    readonly expiresAtLogicalMs: number;
  }>;
}

/** Reuses the existing Trust safety dimension; favorable Trust never grants authority. */
export function createMorphogenesisStrategyTrustSafetySourceV3(input: {
  readonly catalog: MorphogenesisStrategyCatalogV3;
  readonly contexts: MorphogenesisStrategyContextResolutionPortV3;
  readonly trust: MorphogenesisStrategyTrustAssessmentPortV3;
}) {
  const catalog = validateMorphogenesisStrategyCatalogV3(input.catalog);
  return createLocalStrategySafetySignalSourceV1({
    dimension: "trust",
    async resolve({ request, strategy }) {
      const definition = catalog.strategies.find(({ strategy: local }) =>
        local.strategyId === strategy.strategyId && local.strategyDigest === strategy.strategyDigest);
      if (!definition) throw new TypeError("Morphogenesis Trust strategy is unavailable");
      const context = await input.contexts.resolve(request.contextDigest);
      if (!context || validateMorphogenesisStrategyContextV3(context).contextDigest !== request.contextDigest)
        throw new TypeError("Morphogenesis Trust context is unavailable or substituted");
      const assessment = await input.trust.assess({
        request,
        context,
        strategyId: strategy.strategyId,
        definitionDigest: definition.definitionDigest,
      });
      if (assessment.contextDigest !== context.contextDigest ||
          assessment.definitionDigest !== definition.definitionDigest)
        throw new TypeError("Morphogenesis Trust assessment is substituted");
      const evidenceDigest = sha(assessment.evidenceDigest);
      return createLocalStrategyTrustSafetySignalV1({
        request,
        strategy,
        binding: {
          signalId: `morphogenesis-trust:${evidenceDigest.slice(7, 39)}:${assessment.sourceRevision}`,
          sourceId: assessment.sourceId,
          sourceVersion: assessment.sourceVersion,
          sourceImplementationDigest: assessment.sourceImplementationDigest,
          sourceRevision: assessment.sourceRevision,
          observedAtLogicalMs: assessment.observedAtLogicalMs,
          expiresAtLogicalMs: assessment.expiresAtLogicalMs,
        },
        trustDisposition: assessment.disposition,
        reasonCodes: [`morphogenesis_trust_${assessment.disposition}`],
      });
    },
  });
}

export type MorphogenesisStrategyMemoryKindV3 =
  "selection" | "measurement" | "recommendation" | "review" | "transition";

export interface MorphogenesisStrategyMemoryRecordV3 {
  readonly schemaVersion: 3;
  readonly recordId: AgentPlatID;
  readonly kind: MorphogenesisStrategyMemoryKindV3;
  readonly tenantId: AgentPlatID;
  readonly missionIntentId: AgentPlatID;
  readonly objectiveId: AgentPlatID;
  readonly scopeDigest: PlanningDigestV1;
  readonly subjectDigest: PlanningDigestV1;
  readonly relatedDigests: readonly PlanningDigestV1[];
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly recordedAtLogicalMs: number;
  readonly recordDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategyMemoryPortV3 {
  remember(record: MorphogenesisStrategyMemoryRecordV3): Promise<"created" | "replayed">;
  list(input: {
    readonly tenantId: AgentPlatID;
    readonly missionIntentId: AgentPlatID;
    readonly objectiveId: AgentPlatID;
    readonly maximumRecords: number;
  }): Promise<readonly MorphogenesisStrategyMemoryRecordV3[]>;
}

export function createMorphogenesisStrategyMemoryRecordV3(
  input: Omit<MorphogenesisStrategyMemoryRecordV3, "schemaVersion" | "recordDigest">,
): MorphogenesisStrategyMemoryRecordV3 {
  const body = freeze({
    schemaVersion: 3 as const,
    recordId: id(input.recordId),
    kind: one<MorphogenesisStrategyMemoryKindV3>(input.kind,
      new Set(["selection", "measurement", "recommendation", "review", "transition"])),
    tenantId: id(input.tenantId),
    missionIntentId: id(input.missionIntentId),
    objectiveId: id(input.objectiveId),
    scopeDigest: sha(input.scopeDigest),
    subjectDigest: sha(input.subjectDigest),
    relatedDigests: shas(input.relatedDigests, 0, 64),
    evidenceDigests: shas(input.evidenceDigests, 1, 128),
    recordedAtLogicalMs: nonNegative(input.recordedAtLogicalMs),
  });
  return freeze({ ...body, recordDigest: digest("morphogenesis-strategy-memory-record-v3", body) });
}

export function validateMorphogenesisStrategyMemoryRecordV3(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new TypeError("Morphogenesis strategy memory record is invalid");
  const value = input as MorphogenesisStrategyMemoryRecordV3;
  const { schemaVersion: _schema, recordDigest, ...body } = value;
  const rebuilt = createMorphogenesisStrategyMemoryRecordV3(body);
  if (value.schemaVersion !== 3 || recordDigest !== rebuilt.recordDigest)
    throw new TypeError("Morphogenesis strategy memory record digest is invalid");
  return rebuilt;
}

export class InMemoryMorphogenesisStrategyMemoryPortV3
  implements MorphogenesisStrategyMemoryPortV3
{
  readonly #records = new Map<string, MorphogenesisStrategyMemoryRecordV3>();
  async remember(input: MorphogenesisStrategyMemoryRecordV3) {
    const record = validateMorphogenesisStrategyMemoryRecordV3(input);
    const current = this.#records.get(record.recordId);
    if (current) {
      if (current.recordDigest !== record.recordDigest)
        throw new Error("Morphogenesis strategy memory identity conflict");
      return "replayed" as const;
    }
    this.#records.set(record.recordId, record);
    return "created" as const;
  }
  async list(input: {
    readonly tenantId: AgentPlatID;
    readonly missionIntentId: AgentPlatID;
    readonly objectiveId: AgentPlatID;
    readonly maximumRecords: number;
  }) {
    if (!Number.isSafeInteger(input.maximumRecords) || input.maximumRecords < 1 || input.maximumRecords > 10_000)
      throw new TypeError("Morphogenesis strategy memory limit is invalid");
    return freeze([...this.#records.values()].filter((record) =>
      record.tenantId === input.tenantId && record.missionIntentId === input.missionIntentId &&
      record.objectiveId === input.objectiveId).sort((a, b) =>
      a.recordedAtLogicalMs - b.recordedAtLogicalMs || a.recordId.localeCompare(b.recordId)
    ).slice(-input.maximumRecords));
  }
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown): AgentPlatID { if (typeof value !== "string" || !ID.test(value)) throw new TypeError("Morphogenesis strategy integration ID is invalid"); return value as AgentPlatID; }
function sha(value: unknown): PlanningDigestV1 { if (typeof value !== "string" || !SHA.test(value)) throw new TypeError("Morphogenesis strategy integration digest is invalid"); return value as PlanningDigestV1; }
function nonNegative(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0) throw new TypeError("Morphogenesis strategy integration time is invalid"); return value as number; }
function one<T extends string>(value: unknown, allowed: ReadonlySet<string>): T { if (typeof value !== "string" || !allowed.has(value)) throw new TypeError("Morphogenesis strategy integration kind is invalid"); return value as T; }
function shas(values: readonly unknown[], minimum: number, maximum: number) { const result = [...new Set(values.map(sha))].sort(); if (result.length < minimum || result.length > maximum || result.length !== values.length) throw new TypeError("Morphogenesis strategy integration digest set is invalid"); return freeze(result); }
function digest(domain: string, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain as never, value as PlanningJson); }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value as Record<string, unknown>)) freeze(item); } return value; }
