import type { JsonValue } from "@agentplat/core";
import { digestTrustJsonV1, TrustValidationError } from "./canonical.js";
import { evaluateEvidenceFusionV1 } from "./fusion.js";
import type {
  EvidenceFusionDecisionV1,
  EvidenceFusionEvaluationRequestV1,
  EvidenceTrustStateV1,
} from "./types.js";

/** Stable descriptor for a pluggable evidence-fusion algorithm. */
export interface EvidenceFusionStrategyDescriptorV1 {
  readonly schemaVersion: 1;
  readonly strategyId: string;
  readonly strategyVersion: number;
  readonly capabilities: readonly string[];
  readonly descriptorDigest: string;
}

export interface EvidenceFusionStrategyV1
  extends EvidenceFusionStrategyDescriptorV1 {
  evaluate(input: {
    readonly state: EvidenceTrustStateV1;
    readonly request: EvidenceFusionEvaluationRequestV1;
    readonly logicalTimeMs: number;
  }): EvidenceFusionDecisionV1;
}

const descriptorPayload = (
  strategy: Pick<
    EvidenceFusionStrategyDescriptorV1,
    "schemaVersion" | "strategyId" | "strategyVersion" | "capabilities"
  >,
) => ({
  schemaVersion: strategy.schemaVersion,
  strategyId: strategy.strategyId,
  strategyVersion: strategy.strategyVersion,
  capabilities: [...strategy.capabilities],
});

export function digestEvidenceFusionStrategyDescriptorV1(
  descriptor: Pick<
    EvidenceFusionStrategyDescriptorV1,
    "schemaVersion" | "strategyId" | "strategyVersion" | "capabilities"
  >,
): string {
  return digestTrustJsonV1(
    "trace",
    descriptorPayload(descriptor) as unknown as JsonValue,
  );
}

export function validateEvidenceFusionStrategyDescriptorV1(
  descriptor: EvidenceFusionStrategyDescriptorV1,
): EvidenceFusionStrategyDescriptorV1 {
  if (
    descriptor.schemaVersion !== 1 ||
    !descriptor.strategyId ||
    !Number.isSafeInteger(descriptor.strategyVersion) ||
    descriptor.strategyVersion < 1 ||
    !Array.isArray(descriptor.capabilities) ||
    descriptor.capabilities.some((item) => typeof item !== "string") ||
    [...descriptor.capabilities].sort().some((item, index, all) => index > 0 && item === all[index - 1]) ||
    descriptor.descriptorDigest !== digestEvidenceFusionStrategyDescriptorV1(descriptor)
  )
    throw new TrustValidationError("evidence fusion strategy descriptor is invalid");
  return Object.freeze({ ...descriptor, capabilities: Object.freeze([...descriptor.capabilities]) });
}

/** Registry with deterministic replacement semantics for strategy versions. */
export class EvidenceFusionStrategyRegistryV1 {
  readonly #strategies = new Map<string, EvidenceFusionStrategyV1>();

  register(strategy: EvidenceFusionStrategyV1): this {
    const validated = validateEvidenceFusionStrategyDescriptorV1(strategy);
    const key = `${validated.strategyId}\0${validated.strategyVersion}`;
    if (this.#strategies.has(key))
      throw new TrustValidationError("evidence fusion strategy version already registered");
    this.#strategies.set(key, strategy);
    return this;
  }

  get(strategyId: string, strategyVersion: number): EvidenceFusionStrategyV1 {
    const strategy = this.#strategies.get(`${strategyId}\0${strategyVersion}`);
    if (!strategy) throw new TrustValidationError("evidence fusion strategy is unavailable");
    return strategy;
  }

  list(): readonly EvidenceFusionStrategyDescriptorV1[] {
    return Object.freeze(
      [...this.#strategies.values()]
        .sort((a, b) => `${a.strategyId}\0${a.strategyVersion}`.localeCompare(`${b.strategyId}\0${b.strategyVersion}`))
        .map(({ evaluate: _evaluate, ...descriptor }) => Object.freeze(descriptor)),
    );
  }
}

/** Reference implementation preserving the existing deterministic fusion algorithm. */
const referenceEvaluateV1 = ({ state, request, logicalTimeMs }: {
  readonly state: EvidenceTrustStateV1;
  readonly request: EvidenceFusionEvaluationRequestV1;
  readonly logicalTimeMs: number;
}) => evaluateEvidenceFusionV1(state, request, logicalTimeMs);

const referenceDescriptorV1 = {
  schemaVersion: 1,
  strategyId: "weighted-threshold",
  strategyVersion: 1,
  capabilities: Object.freeze(["deterministic", "weighted-threshold", "dependency-aware"]),
} as const;
export const referenceEvidenceFusionStrategyV1: EvidenceFusionStrategyV1 = Object.freeze({
  ...referenceDescriptorV1,
  descriptorDigest: digestEvidenceFusionStrategyDescriptorV1(referenceDescriptorV1),
  evaluate: referenceEvaluateV1,
});

export const defaultEvidenceFusionStrategyV1 = referenceEvidenceFusionStrategyV1;
