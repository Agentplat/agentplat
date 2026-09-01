import {
  digestPlanningJsonV1,
  type PlanningDigestDomainV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import type {
  MorphogenesisNeedV1,
  MorphogenesisPolicyRecordAnyV1,
  MorphogenesisReasonCodeV1,
} from "./morphogenesis-contracts.js";
import {
  validateMorphogenesisNeedV1,
  validateMorphogenesisPolicyAnyV1,
} from "./morphogenesis-validation.js";

export interface MorphogenesisTransformationHeadV1 {
  readonly schemaVersion: 1;
  readonly morphologyEpoch: number;
  readonly proposalDigest: PlanningDigestV1;
  readonly needReasonCode: MorphogenesisReasonCodeV1;
  readonly needSeverityBps: number;
  readonly acceptedAtLogicalMs: number;
  readonly receiptDigest: PlanningDigestV1;
  readonly transformationHeadDigest: PlanningDigestV1;
}

export interface MorphogenesisControlWindowV1 {
  readonly schemaVersion: 1;
  readonly windowId: AgentPlatID;
  readonly scopeDigest: PlanningDigestV1;
  readonly currentMorphologyEpoch: number;
  readonly observedAtLogicalMs: number;
  readonly transformations: readonly MorphogenesisTransformationHeadV1[];
  readonly windowDigest: PlanningDigestV1;
}

export function createMorphogenesisTransformationHeadV1(
  input: Omit<
    MorphogenesisTransformationHeadV1,
    "schemaVersion" | "transformationHeadDigest"
  >,
): MorphogenesisTransformationHeadV1 {
  const body = freeze({
    schemaVersion: 1 as const,
    morphologyEpoch: positive(input.morphologyEpoch, "transformation epoch"),
    proposalDigest: sha(input.proposalDigest, "transformation proposal digest"),
    needReasonCode: input.needReasonCode,
    needSeverityBps: bps(input.needSeverityBps, "transformation need severity"),
    acceptedAtLogicalMs: nonNegative(
      input.acceptedAtLogicalMs,
      "transformation acceptance time",
    ),
    receiptDigest: sha(input.receiptDigest, "transformation receipt digest"),
  });
  return freeze({
    ...body,
    transformationHeadDigest: digest("morphogenesis-transformation-head", body),
  });
}

export function validateMorphogenesisTransformationHeadV1(
  input: unknown,
): MorphogenesisTransformationHeadV1 {
  const value = exact(
    input,
    [
      "acceptedAtLogicalMs",
      "morphologyEpoch",
      "needReasonCode",
      "needSeverityBps",
      "proposalDigest",
      "receiptDigest",
      "schemaVersion",
      "transformationHeadDigest",
    ],
    "morphogenesis transformation head",
  );
  if (value.schemaVersion !== 1)
    fail("morphogenesis transformation head schema is invalid");
  const { transformationHeadDigest: _digest, schemaVersion: _schema, ...body } =
    value;
  const result = createMorphogenesisTransformationHeadV1(
    body as Omit<
      MorphogenesisTransformationHeadV1,
      "schemaVersion" | "transformationHeadDigest"
    >,
  );
  if (value.transformationHeadDigest !== result.transformationHeadDigest)
    fail("morphogenesis transformation head digest is invalid");
  return result;
}

export function createMorphogenesisControlWindowV1(
  input: Omit<
    MorphogenesisControlWindowV1,
    "schemaVersion" | "windowDigest"
  >,
  policyInput: MorphogenesisPolicyRecordAnyV1,
): MorphogenesisControlWindowV1 {
  const policy = validateMorphogenesisPolicyAnyV1(policyInput);
  const observedAtLogicalMs = nonNegative(
    input.observedAtLogicalMs,
    "control-window observation time",
  );
  if (!Array.isArray(input.transformations))
    fail("control-window transformations must be an array");
  const transformations = input.transformations
    .map(validateMorphogenesisTransformationHeadV1)
    .sort((left, right) => left.morphologyEpoch - right.morphologyEpoch);
  if (
    transformations.length >
    policy.policy.limits.maximumTransformationsPerWindow
  )
    fail("morphogenesis transformation window is exhausted");
  for (let index = 0; index < transformations.length; index += 1) {
    const item = transformations[index]!;
    if (
      item.acceptedAtLogicalMs > observedAtLogicalMs ||
      observedAtLogicalMs - item.acceptedAtLogicalMs >
        policy.policy.limits.transformationWindowMs ||
      item.morphologyEpoch >= input.currentMorphologyEpoch ||
      (index > 0 &&
        transformations[index - 1]!.morphologyEpoch >= item.morphologyEpoch)
    )
      fail("morphogenesis transformation window lineage is invalid");
  }
  const body = freeze({
    schemaVersion: 1 as const,
    windowId: id(input.windowId, "control window ID"),
    scopeDigest: sha(input.scopeDigest, "control window scope digest"),
    currentMorphologyEpoch: positive(
      input.currentMorphologyEpoch,
      "control window current epoch",
    ),
    observedAtLogicalMs,
    transformations: freeze(transformations),
  });
  return freeze({
    ...body,
    windowDigest: digest("morphogenesis-control-window", body),
  });
}

export function validateMorphogenesisControlWindowV1(
  input: unknown,
  policy: MorphogenesisPolicyRecordAnyV1,
): MorphogenesisControlWindowV1 {
  const value = exact(
    input,
    [
      "currentMorphologyEpoch",
      "observedAtLogicalMs",
      "schemaVersion",
      "scopeDigest",
      "transformations",
      "windowDigest",
      "windowId",
    ],
    "morphogenesis control window",
  );
  if (value.schemaVersion !== 1)
    fail("morphogenesis control window schema is invalid");
  const { windowDigest: _digest, schemaVersion: _schema, ...body } = value;
  const result = createMorphogenesisControlWindowV1(
    body as Omit<
      MorphogenesisControlWindowV1,
      "schemaVersion" | "windowDigest"
    >,
    policy,
  );
  if (value.windowDigest !== result.windowDigest)
    fail("morphogenesis control window digest is invalid");
  return result;
}

export function assertMorphogenesisControlWindowAllowsV1(input: {
  readonly policy: MorphogenesisPolicyRecordAnyV1;
  readonly window: MorphogenesisControlWindowV1;
  readonly need: MorphogenesisNeedV1;
  readonly logicalTimeMs: number;
}): void {
  const policy = validateMorphogenesisPolicyAnyV1(input.policy);
  const window = validateMorphogenesisControlWindowV1(input.window, policy);
  const need = validateMorphogenesisNeedV1(input.need, policy);
  const logicalTimeMs = nonNegative(
    input.logicalTimeMs,
    "morphogenesis control time",
  );
  if (
    window.scopeDigest !== need.scopeDigest ||
    window.currentMorphologyEpoch < 1 ||
    logicalTimeMs < window.observedAtLogicalMs ||
    logicalTimeMs >= need.expiresAtLogicalMs
  )
    fail("morphogenesis control context is stale or cross-scoped");
  const latest = window.transformations.at(-1);
  if (!latest) return;
  if (
    logicalTimeMs - latest.acceptedAtLogicalMs < policy.policy.limits.cooldownMs
  )
    fail("morphogenesis cooldown is active");
  if (
    latest.needReasonCode === need.reasonCode &&
    need.severityBps <
      Math.min(10_000, latest.needSeverityBps + policy.policy.limits.hysteresisBps)
  )
    fail("morphogenesis hysteresis margin is not satisfied");
}

function exact(input: unknown, keys: readonly string[], label: string): Record<string, unknown> { if (!input || typeof input !== "object" || Array.isArray(input)) fail(`${label} must be an object`); const prototype = Object.getPrototypeOf(input); if (prototype !== Object.prototype && prototype !== null) fail(`${label} must be a plain object`); const actual = Object.keys(input as object).sort(); const expected = [...keys].sort(); if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} fields are invalid`); return input as Record<string, unknown>; }
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+=-]{0,255}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown, label: string): AgentPlatID { if (typeof value !== "string" || !IDENTIFIER.test(value)) fail(`${label} is invalid`); return value as AgentPlatID; }
function sha(value: unknown, label: string): PlanningDigestV1 { if (typeof value !== "string" || !DIGEST.test(value)) fail(`${label} is invalid`); return value as PlanningDigestV1; }
function positive(value: unknown, label: string): number { const result = nonNegative(value, label); if (result < 1) fail(`${label} is invalid`); return result; }
function nonNegative(value: unknown, label: string): number { if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${label} is invalid`); return value as number; }
function bps(value: unknown, label: string): number { const result = nonNegative(value, label); if (result > 10_000) fail(`${label} is invalid`); return result; }
function digest(domain: PlanningDigestDomainV1, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain, value as PlanningJson); }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const key of Object.getOwnPropertyNames(value)) freeze((value as Record<string, unknown>)[key]); } return value; }
function fail(message: string): never { throw new TypeError(message); }
