import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";
import type { MorphologyHeadV1 } from "./morphogenesis-contracts.js";
import { validateMorphologyHeadV1 } from "./morphogenesis-validation.js";

/** Immutable evidence that another proposal consumed this exact predecessor. */
export interface MorphogenesisSupersessionBindingV1 {
  readonly schemaVersion: 1;
  readonly resolutionId: AgentPlatID;
  readonly executionStateKey: AgentPlatID;
  readonly executionRecordDigest: PlanningDigestV1;
  readonly scopeDigest: PlanningDigestV1;
  readonly proposalDigest: PlanningDigestV1;
  readonly expectedMorphologyEpoch: number;
  readonly winningHead: MorphologyHeadV1;
  readonly startedAtLogicalMs: number;
  readonly supersessionDigest: PlanningDigestV1;
}

/** Cleanup evidence, not an activation receipt or permission to mutate the winner. */
export interface MorphogenesisSupersessionReceiptV1 {
  readonly schemaVersion: 1;
  readonly resolutionId: AgentPlatID;
  readonly supersessionDigest: PlanningDigestV1;
  readonly proposalDigest: PlanningDigestV1;
  readonly decisionDigest: PlanningDigestV1;
  readonly winningHeadDigest: PlanningDigestV1;
  readonly continuityReceiptDigest: PlanningDigestV1;
  readonly fenceReceiptDigest: PlanningDigestV1;
  readonly terminalAgentReceiptDigest: PlanningDigestV1;
  readonly budgetReleaseDigest: PlanningDigestV1;
  readonly resolvedAtLogicalMs: number;
  readonly receiptDigest: PlanningDigestV1;
}

export function createMorphogenesisSupersessionBindingV1(
  input: Omit<MorphogenesisSupersessionBindingV1, "schemaVersion" | "supersessionDigest">,
): MorphogenesisSupersessionBindingV1 {
  const winningHead = validateMorphologyHeadV1(input.winningHead);
  const body = {
    schemaVersion: 1 as const,
    resolutionId: id(input.resolutionId),
    executionStateKey: id(input.executionStateKey),
    executionRecordDigest: sha(input.executionRecordDigest),
    scopeDigest: sha(input.scopeDigest),
    proposalDigest: sha(input.proposalDigest),
    expectedMorphologyEpoch: integer(input.expectedMorphologyEpoch, 1),
    winningHead,
    startedAtLogicalMs: integer(input.startedAtLogicalMs, 0),
  };
  if (winningHead.scopeDigest !== body.scopeDigest ||
      winningHead.morphologyEpoch !== body.expectedMorphologyEpoch + 1 ||
      winningHead.acceptedProposalDigest === null ||
      winningHead.acceptedProposalDigest === body.proposalDigest ||
      winningHead.decisionDigest === null || winningHead.receiptDigest === null ||
      winningHead.predecessorHeadDigest === null ||
      winningHead.logicalTimeHighWaterMs > body.startedAtLogicalMs)
    fail("supersession requires another proposal's exact direct successor");
  return freeze({ ...body, supersessionDigest: digestPlanningJsonV1(
    "morphogenesis-supersession-binding", body as unknown as PlanningJson) });
}

export function validateMorphogenesisSupersessionBindingV1(input: unknown): MorphogenesisSupersessionBindingV1 {
  const value = object(input);
  exact(value, ["schemaVersion", "resolutionId", "executionStateKey", "executionRecordDigest", "scopeDigest",
    "proposalDigest", "expectedMorphologyEpoch", "winningHead", "startedAtLogicalMs", "supersessionDigest"]);
  const { schemaVersion, supersessionDigest, ...body } = value;
  const result = createMorphogenesisSupersessionBindingV1(body as unknown as Parameters<typeof createMorphogenesisSupersessionBindingV1>[0]);
  if (schemaVersion !== 1 || supersessionDigest !== result.supersessionDigest) fail("supersession binding digest is invalid");
  return result;
}

export function createMorphogenesisSupersessionReceiptV1(
  input: Omit<MorphogenesisSupersessionReceiptV1, "schemaVersion" | "receiptDigest">,
): MorphogenesisSupersessionReceiptV1 {
  const body = {
    schemaVersion: 1 as const,
    resolutionId: id(input.resolutionId),
    supersessionDigest: sha(input.supersessionDigest),
    proposalDigest: sha(input.proposalDigest),
    decisionDigest: sha(input.decisionDigest),
    winningHeadDigest: sha(input.winningHeadDigest),
    continuityReceiptDigest: sha(input.continuityReceiptDigest),
    fenceReceiptDigest: sha(input.fenceReceiptDigest),
    terminalAgentReceiptDigest: sha(input.terminalAgentReceiptDigest),
    budgetReleaseDigest: sha(input.budgetReleaseDigest),
    resolvedAtLogicalMs: integer(input.resolvedAtLogicalMs, 0),
  };
  return freeze({ ...body, receiptDigest: digestPlanningJsonV1(
    "morphogenesis-supersession-receipt", body as unknown as PlanningJson) });
}

export function validateMorphogenesisSupersessionReceiptV1(input: unknown): MorphogenesisSupersessionReceiptV1 {
  const value = object(input);
  exact(value, ["schemaVersion", "resolutionId", "supersessionDigest", "proposalDigest", "decisionDigest", "winningHeadDigest",
    "continuityReceiptDigest", "fenceReceiptDigest", "terminalAgentReceiptDigest", "budgetReleaseDigest", "resolvedAtLogicalMs", "receiptDigest"]);
  const { schemaVersion, receiptDigest, ...body } = value;
  const result = createMorphogenesisSupersessionReceiptV1(body as unknown as Parameters<typeof createMorphogenesisSupersessionReceiptV1>[0]);
  if (schemaVersion !== 1 || receiptDigest !== result.receiptDigest) fail("supersession receipt digest is invalid");
  return result;
}

function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.getOwnPropertySymbols(input).length)
    fail("supersession record must be an object");
  if (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
    fail("supersession record must be a plain object");
  return input as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) fail("supersession record fields are invalid");
}
function id(value: unknown): AgentPlatID {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:@/+=-]{0,255}$/u.test(value)) fail("supersession ID is invalid");
  return value as AgentPlatID;
}
function sha(value: unknown): PlanningDigestV1 {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) fail("supersession digest is invalid");
  return value as PlanningDigestV1;
}
function integer(value: unknown, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) fail("supersession time or epoch is invalid");
  return value as number;
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) freeze((value as Record<string, unknown>)[key]);
  }
  return value;
}
function fail(message: string): never { throw new TypeError(message); }
