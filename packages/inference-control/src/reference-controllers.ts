import type { JsonValue } from "@agentplat/core";

import { sha256Hex } from "./sha256.js";

export interface RepresentationControlPolicyV1 {
  readonly policyDigest: string;
  readonly steeringStrengthBasisPoints: number;
  readonly prohibitedProjectionRemovalBasisPoints: number;
  readonly maximumDeltaNormBasisPoints: number;
  readonly minimumInputNorm: number;
  readonly maximumDimensions: number;
}

export interface RepresentationControlRequestV1 {
  readonly requestId: string;
  readonly bindingDigest: string;
  readonly roleVectorDigest: string;
  readonly activationDigest: string;
  readonly activation: readonly number[];
  readonly roleVector: readonly number[];
  readonly prohibitedVectors: readonly {
    readonly vectorDigest: string;
    readonly values: readonly number[];
  }[];
  readonly step: number;
  readonly logicalTimeMs: number;
}

export interface RepresentationControlReceiptV1 {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly bindingDigest: string;
  readonly policyDigest: string;
  readonly roleVectorDigest: string;
  readonly inputActivationDigest: string;
  readonly outputActivationDigest: string;
  readonly dimensions: number;
  readonly appliedStrengthBasisPoints: number;
  readonly removedProjectionBasisPoints: number;
  readonly deltaNormBasisPoints: number;
  readonly result: "applied" | "not_required" | "rejected";
  readonly reasonCode: string;
  readonly step: number;
  readonly logicalTimeMs: number;
  readonly receiptDigest: string;
}

/**
 * Reference activation steering controller. Vectors are volatile; the receipt
 * retains only their content digests and bounded control measurements.
 */
export class ReferenceRepresentationControllerV1 {
  readonly policy: RepresentationControlPolicyV1;

  constructor(policy: RepresentationControlPolicyV1) {
    validateRepresentationPolicy(policy);
    this.policy = immutable(policy);
  }

  intervene(request: RepresentationControlRequestV1): {
    readonly activation: readonly number[];
    readonly receipt: RepresentationControlReceiptV1;
  } {
    const dimensions = validateRepresentationRequest(request, this.policy);
    const actualActivationDigest = digestVector(request.activation);
    const actualRoleDigest = digestVector(request.roleVector);
    if (
      actualActivationDigest !== request.activationDigest ||
      actualRoleDigest !== request.roleVectorDigest ||
      request.prohibitedVectors.some((item) => digestVector(item.values) !== item.vectorDigest)
    ) return this.rejected(request, dimensions, "representation_digest_mismatch");

    const inputNorm = norm(request.activation);
    if (inputNorm < this.policy.minimumInputNorm)
      return this.rejected(request, dimensions, "activation_norm_below_minimum");

    let controlled = [...request.activation];
    const prohibitedBasis = orthonormalBasis(
      request.prohibitedVectors.map((item) => item.values),
    );
    const removal = this.policy.prohibitedProjectionRemovalBasisPoints / 10_000;
    for (const direction of prohibitedBasis) {
      const projection = dot(controlled, direction);
      controlled = subtract(controlled, scale(direction, projection * removal));
    }
    const role = normalize(request.roleVector);
    const roleProjection = dot(controlled, role);
    const targetRoleProjection = Math.max(roleProjection, inputNorm);
    const steering = this.policy.steeringStrengthBasisPoints / 10_000;
    controlled = add(
      controlled,
      scale(role, Math.max(0, targetRoleProjection - roleProjection) * steering),
    );

    let delta = subtract(controlled, request.activation);
    const maximumDelta = inputNorm * this.policy.maximumDeltaNormBasisPoints / 10_000;
    const deltaNorm = norm(delta);
    if (deltaNorm > maximumDelta && deltaNorm > 0) {
      delta = scale(delta, maximumDelta / deltaNorm);
      controlled = add(request.activation, delta);
    }
    controlled = controlled.map((item) => finiteRound(item));
    const outputActivationDigest = digestVector(controlled);
    const appliedDelta = norm(subtract(controlled, request.activation));
    const deltaNormBasisPoints = clampBps(Math.round(appliedDelta / inputNorm * 10_000));
    const removedProjectionBasisPoints = prohibitedBasis.length === 0
      ? 0
      : clampBps(
          Math.round(
            prohibitedBasis.reduce(
              (sum, direction) => sum + Math.abs(dot(request.activation, direction) - dot(controlled, direction)),
              0,
            ) / (inputNorm * prohibitedBasis.length) * 10_000,
          ),
        );
    const body = {
      schemaVersion: 1 as const,
      requestId: request.requestId,
      bindingDigest: request.bindingDigest,
      policyDigest: this.policy.policyDigest,
      roleVectorDigest: request.roleVectorDigest,
      inputActivationDigest: request.activationDigest,
      outputActivationDigest,
      dimensions,
      appliedStrengthBasisPoints: this.policy.steeringStrengthBasisPoints,
      removedProjectionBasisPoints,
      deltaNormBasisPoints,
      result: (deltaNormBasisPoints === 0 ? "not_required" : "applied") as
        | "not_required"
        | "applied",
      reasonCode: deltaNormBasisPoints === 0 ? "representation_within_bounds" : "representation_control_applied",
      step: request.step,
      logicalTimeMs: request.logicalTimeMs,
    };
    return Object.freeze({
      activation: Object.freeze(controlled),
      receipt: receipt(body),
    });
  }

  private rejected(
    request: RepresentationControlRequestV1,
    dimensions: number,
    reasonCode: string,
  ) {
    const body = {
      schemaVersion: 1 as const,
      requestId: request.requestId,
      bindingDigest: request.bindingDigest,
      policyDigest: this.policy.policyDigest,
      roleVectorDigest: request.roleVectorDigest,
      inputActivationDigest: request.activationDigest,
      outputActivationDigest: request.activationDigest,
      dimensions,
      appliedStrengthBasisPoints: 0,
      removedProjectionBasisPoints: 0,
      deltaNormBasisPoints: 0,
      result: "rejected" as const,
      reasonCode,
      step: request.step,
      logicalTimeMs: request.logicalTimeMs,
    };
    return Object.freeze({
      activation: Object.freeze([...request.activation]),
      receipt: receipt(body),
    });
  }
}

export type BlackBoxContextZoneV1 =
  | "authority"
  | "mission"
  | "role"
  | "local"
  | "peer"
  | "retrieval"
  | "tool"
  | "provider";

export interface BlackBoxContextItemV1 {
  readonly itemId: string;
  readonly content: string;
  readonly contentDigest: string;
  readonly sourceZone: BlackBoxContextZoneV1;
  readonly trustBasisPoints: number;
  readonly riskBasisPoints: number;
  readonly tokenEstimate: number;
  readonly essential: boolean;
  readonly independenceGroup: string;
}

export interface BlackBoxControlPolicyV1 {
  readonly policyDigest: string;
  readonly maximumContextTokens: number;
  readonly maximumContextItems: number;
  readonly maximumContextItemBytes: number;
  readonly minimumTrustBasisPoints: number;
  readonly maximumRiskBasisPoints: number;
  readonly maximumItemsPerIndependenceGroup: number;
  readonly allowedToolNames: readonly string[];
  readonly protectedZones: readonly BlackBoxContextZoneV1[];
  readonly roleReinforcement: string;
  readonly roleReinforcementDigest: string;
}

export interface BlackBoxControlRequestV1 {
  readonly requestId: string;
  readonly bindingDigest: string;
  readonly step: number;
  readonly logicalTimeMs: number;
  readonly context: readonly BlackBoxContextItemV1[];
  readonly requestedToolNames: readonly string[];
  readonly memoryQueryDigest: string | null;
}

export interface BlackBoxControlReceiptV1 {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly bindingDigest: string;
  readonly policyDigest: string;
  readonly selectedItemDigests: readonly string[];
  readonly excludedItemDigests: readonly string[];
  readonly allowedToolNames: readonly string[];
  readonly deniedToolNames: readonly string[];
  readonly selectedTokens: number;
  readonly roleReinforcementDigest: string;
  readonly memoryQueryDigest: string | null;
  readonly disposition: "allow" | "modify" | "abstain";
  readonly reasonCodes: readonly string[];
  readonly step: number;
  readonly logicalTimeMs: number;
  readonly receiptDigest: string;
}

/** Deterministic context, memory and tool controller for opaque model APIs. */
export class ReferenceBlackBoxControllerV1 {
  readonly policy: BlackBoxControlPolicyV1;

  constructor(policy: BlackBoxControlPolicyV1) {
    validateBlackBoxPolicy(policy);
    this.policy = immutable(policy);
  }

  control(request: BlackBoxControlRequestV1): {
    readonly context: readonly BlackBoxContextItemV1[];
    readonly allowedToolNames: readonly string[];
    readonly roleReinforcement: string;
    readonly receipt: BlackBoxControlReceiptV1;
  } {
    validateBlackBoxRequest(request, this.policy);
    const reasons = new Set<string>();
    const excluded: BlackBoxContextItemV1[] = [];
    const candidates: BlackBoxContextItemV1[] = [];
    for (const item of request.context) {
      const protectedItem = this.policy.protectedZones.includes(item.sourceZone);
      if (digestText(item.content) !== item.contentDigest) {
        excluded.push(item);
        reasons.add("context_digest_mismatch");
      } else if (!protectedItem && item.riskBasisPoints > this.policy.maximumRiskBasisPoints) {
        excluded.push(item);
        reasons.add("context_risk_above_threshold");
      } else if (!protectedItem && item.trustBasisPoints < this.policy.minimumTrustBasisPoints) {
        excluded.push(item);
        reasons.add("context_trust_below_threshold");
      } else candidates.push(item);
    }
    candidates.sort((left, right) =>
      Number(this.policy.protectedZones.includes(right.sourceZone)) -
        Number(this.policy.protectedZones.includes(left.sourceZone)) ||
      Number(right.essential) - Number(left.essential) ||
      right.trustBasisPoints - left.trustBasisPoints ||
      left.riskBasisPoints - right.riskBasisPoints ||
      left.itemId.localeCompare(right.itemId),
    );
    const selected: BlackBoxContextItemV1[] = [];
    const groupCounts = new Map<string, number>();
    let tokens = 0;
    for (const item of candidates) {
      const count = groupCounts.get(item.independenceGroup) ?? 0;
      if (count >= this.policy.maximumItemsPerIndependenceGroup) {
        excluded.push(item);
        reasons.add("context_dependency_group_capped");
        continue;
      }
      if (tokens + item.tokenEstimate > this.policy.maximumContextTokens) {
        excluded.push(item);
        reasons.add("context_budget_exhausted");
        continue;
      }
      selected.push(item);
      tokens += item.tokenEstimate;
      groupCounts.set(item.independenceGroup, count + 1);
    }
    const allowedSet = new Set(this.policy.allowedToolNames);
    const allowedToolNames = [...new Set(request.requestedToolNames.filter((item) => allowedSet.has(item)))].sort();
    const deniedToolNames = [...new Set(request.requestedToolNames.filter((item) => !allowedSet.has(item)))].sort();
    if (deniedToolNames.length) reasons.add("tool_not_authorized");
    const protectedUnavailable = this.policy.protectedZones.some(
      (zone) => request.context.some((item) => item.sourceZone === zone) && !selected.some((item) => item.sourceZone === zone),
    );
    if (protectedUnavailable) reasons.add("protected_context_unavailable");
    const disposition = protectedUnavailable
      ? "abstain"
      : excluded.length || deniedToolNames.length
        ? "modify"
        : "allow";
    if (reasons.size === 0) reasons.add("black_box_context_within_bounds");
    const body = {
      schemaVersion: 1 as const,
      requestId: request.requestId,
      bindingDigest: request.bindingDigest,
      policyDigest: this.policy.policyDigest,
      selectedItemDigests: selected.map((item) => item.contentDigest).sort(),
      excludedItemDigests: excluded.map((item) => item.contentDigest).sort(),
      allowedToolNames,
      deniedToolNames,
      selectedTokens: tokens,
      roleReinforcementDigest: this.policy.roleReinforcementDigest,
      memoryQueryDigest: request.memoryQueryDigest,
      disposition: disposition as "allow" | "modify" | "abstain",
      reasonCodes: [...reasons].sort(),
      step: request.step,
      logicalTimeMs: request.logicalTimeMs,
    };
    return Object.freeze({
      context: Object.freeze(selected.map((item) => Object.freeze(structuredClone(item)))),
      allowedToolNames: Object.freeze(allowedToolNames),
      roleReinforcement: this.policy.roleReinforcement,
      receipt: blackBoxReceipt(body),
    });
  }
}

function receipt(
  body: Omit<RepresentationControlReceiptV1, "receiptDigest">,
): RepresentationControlReceiptV1 {
  return Object.freeze({
    ...body,
    receiptDigest: digestJson("representation-control-receipt-v1", body as unknown as JsonValue),
  });
}

function blackBoxReceipt(
  body: Omit<BlackBoxControlReceiptV1, "receiptDigest">,
): BlackBoxControlReceiptV1 {
  return Object.freeze({
    ...body,
    receiptDigest: digestJson("black-box-control-receipt-v1", body as unknown as JsonValue),
  });
}

export function createRepresentationControlPolicyV1(
  input: Omit<RepresentationControlPolicyV1, "policyDigest">,
): RepresentationControlPolicyV1 {
  validateRepresentationPolicyBody(input);
  const body = immutable(input);
  return immutable({
    ...body,
    policyDigest: digestJson("representation-control-policy-v1", body as unknown as JsonValue),
  });
}

export function createBlackBoxControlPolicyV1(
  input: Omit<BlackBoxControlPolicyV1, "policyDigest">,
): BlackBoxControlPolicyV1 {
  validateBlackBoxPolicyBody(input);
  const body = immutable(input);
  return immutable({
    ...body,
    policyDigest: digestJson("black-box-control-policy-v1", body as unknown as JsonValue),
  });
}

function validateRepresentationPolicy(policy: RepresentationControlPolicyV1): void {
  digest(policy.policyDigest, "policyDigest");
  const { policyDigest, ...body } = policy;
  validateRepresentationPolicyBody(body);
  if (digestJson("representation-control-policy-v1", body as unknown as JsonValue) !== policyDigest)
    throw new TypeError("representation_control_policy_digest_mismatch");
}

function validateRepresentationPolicyBody(policy: Omit<RepresentationControlPolicyV1, "policyDigest">): void {
  bps(policy.steeringStrengthBasisPoints, "steeringStrengthBasisPoints");
  bps(policy.prohibitedProjectionRemovalBasisPoints, "prohibitedProjectionRemovalBasisPoints");
  bps(policy.maximumDeltaNormBasisPoints, "maximumDeltaNormBasisPoints");
  if (!Number.isFinite(policy.minimumInputNorm) || policy.minimumInputNorm <= 0)
    throw new RangeError("minimumInputNorm_invalid");
  integer(policy.maximumDimensions, "maximumDimensions", 1, 1_000_000);
}

function validateRepresentationRequest(
  request: RepresentationControlRequestV1,
  policy: RepresentationControlPolicyV1,
): number {
  identifier(request.requestId, "requestId");
  digest(request.bindingDigest, "bindingDigest");
  digest(request.roleVectorDigest, "roleVectorDigest");
  digest(request.activationDigest, "activationDigest");
  integer(request.step, "step", 0, Number.MAX_SAFE_INTEGER);
  integer(request.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
  const dimensions = request.activation.length;
  if (dimensions < 1 || dimensions > policy.maximumDimensions || request.roleVector.length !== dimensions)
    throw new RangeError("representation_dimensions_invalid");
  validateVector(request.activation, dimensions);
  validateVector(request.roleVector, dimensions);
  if (request.prohibitedVectors.length > 256)
    throw new RangeError("prohibited_vector_limit_exceeded");
  for (const item of request.prohibitedVectors) {
    digest(item.vectorDigest, "prohibitedVector.vectorDigest");
    validateVector(item.values, dimensions);
  }
  return dimensions;
}

function validateBlackBoxPolicy(policy: BlackBoxControlPolicyV1): void {
  digest(policy.policyDigest, "policyDigest");
  const { policyDigest, ...body } = policy;
  validateBlackBoxPolicyBody(body);
  if (digestJson("black-box-control-policy-v1", body as unknown as JsonValue) !== policyDigest)
    throw new TypeError("black_box_control_policy_digest_mismatch");
}

function validateBlackBoxPolicyBody(policy: Omit<BlackBoxControlPolicyV1, "policyDigest">): void {
  integer(policy.maximumContextTokens, "maximumContextTokens", 1, 10_000_000);
  integer(policy.maximumContextItems, "maximumContextItems", 1, 100_000);
  integer(policy.maximumContextItemBytes, "maximumContextItemBytes", 1, 1_048_576);
  bps(policy.minimumTrustBasisPoints, "minimumTrustBasisPoints");
  bps(policy.maximumRiskBasisPoints, "maximumRiskBasisPoints");
  integer(policy.maximumItemsPerIndependenceGroup, "maximumItemsPerIndependenceGroup", 1, 10_000);
  canonicalTokens(policy.allowedToolNames, "allowedToolNames");
  const allowedZones: readonly BlackBoxContextZoneV1[] = [
    "authority", "local", "mission", "peer", "provider", "retrieval", "role", "tool",
  ];
  if (
    new Set(policy.protectedZones).size !== policy.protectedZones.length ||
    policy.protectedZones.some((item) => !allowedZones.includes(item)) ||
    policy.protectedZones.some((item, index) => index > 0 && policy.protectedZones[index - 1] > item)
  ) throw new TypeError("protectedZones_must_be_canonical");
  if (typeof policy.roleReinforcement !== "string" || policy.roleReinforcement.length === 0 || policy.roleReinforcement.length > 32_768)
    throw new TypeError("roleReinforcement_invalid");
  digest(policy.roleReinforcementDigest, "roleReinforcementDigest");
  if (digestText(policy.roleReinforcement) !== policy.roleReinforcementDigest)
    throw new TypeError("roleReinforcementDigest_mismatch");
}

function validateBlackBoxRequest(request: BlackBoxControlRequestV1, policy: BlackBoxControlPolicyV1): void {
  identifier(request.requestId, "requestId");
  digest(request.bindingDigest, "bindingDigest");
  integer(request.step, "step", 0, Number.MAX_SAFE_INTEGER);
  integer(request.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
  if (request.context.length > policy.maximumContextItems) throw new RangeError("context_item_limit_exceeded");
  canonicalTokens([...new Set(request.requestedToolNames)].sort(), "requestedToolNames");
  if (request.memoryQueryDigest !== null) digest(request.memoryQueryDigest, "memoryQueryDigest");
  const ids = new Set<string>();
  for (const item of request.context) {
    identifier(item.itemId, "context.itemId");
    if (ids.has(item.itemId)) throw new TypeError("context_item_duplicate");
    ids.add(item.itemId);
    digest(item.contentDigest, "context.contentDigest");
    if (typeof item.content !== "string" || new TextEncoder().encode(item.content).byteLength > policy.maximumContextItemBytes)
      throw new RangeError("context_item_bytes_exceeded");
    if (!( ["authority", "local", "mission", "peer", "provider", "retrieval", "role", "tool"] as const).includes(item.sourceZone))
      throw new TypeError("context_source_zone_invalid");
    bps(item.trustBasisPoints, "context.trustBasisPoints");
    bps(item.riskBasisPoints, "context.riskBasisPoints");
    integer(item.tokenEstimate, "context.tokenEstimate", 1, 10_000_000);
    if (typeof item.essential !== "boolean") throw new TypeError("context_essential_flag_invalid");
    identifier(item.independenceGroup, "context.independenceGroup");
  }
}

function validateVector(vector: readonly number[], dimensions: number): void {
  if (!Array.isArray(vector) || vector.length !== dimensions || vector.some((item) => !Number.isFinite(item) || Math.abs(item) > 1_000_000))
    throw new TypeError("representation_vector_invalid");
  if (norm(vector) === 0) throw new TypeError("representation_vector_zero");
}

function orthonormalBasis(vectors: readonly (readonly number[])[]): readonly number[][] {
  const basis: number[][] = [];
  for (const source of vectors) {
    let candidate = [...source];
    for (const prior of basis) candidate = subtract(candidate, scale(prior, dot(candidate, prior)));
    if (norm(candidate) > 1e-12) basis.push(normalize(candidate));
  }
  return basis;
}

function normalize(vector: readonly number[]): number[] {
  const magnitude = norm(vector);
  return vector.map((item) => item / magnitude);
}

function norm(vector: readonly number[]): number {
  return Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0));
}

function dot(left: readonly number[], right: readonly number[]): number {
  return left.reduce((sum, item, index) => sum + item * right[index], 0);
}

function add(left: readonly number[], right: readonly number[]): number[] {
  return left.map((item, index) => item + right[index]);
}

function subtract(left: readonly number[], right: readonly number[]): number[] {
  return left.map((item, index) => item - right[index]);
}

function scale(vector: readonly number[], factor: number): number[] {
  return vector.map((item) => item * factor);
}

function finiteRound(value: number): number {
  const rounded = Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
  if (!Number.isFinite(rounded)) throw new RangeError("representation_arithmetic_overflow");
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function digestRepresentationVectorV1(vector: readonly number[]): string {
  return digestVector(vector);
}

export function digestBlackBoxContentV1(content: string): string {
  return digestText(content);
}

function digestVector(vector: readonly number[]): string {
  return digestJson("representation-vector-v1", vector.map(finiteRound));
}

function digestText(value: string): string {
  return `sha256:${sha256Hex(new TextEncoder().encode(`black-box-content-v1\u0000${value}`))}`;
}

function digestJson(domain: string, value: JsonValue): string {
  return `sha256:${sha256Hex(new TextEncoder().encode(`${domain}\u0000${canonical(value)}`))}`;
}

function canonical(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value))
    throw new TypeError(`${label}_invalid`);
}

function identifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(value))
    throw new TypeError(`${label}_invalid`);
}

function canonicalTokens(values: readonly string[], label: string): void {
  if (values.length > 10_000 || values.some((item) => !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(item)))
    throw new TypeError(`${label}_invalid`);
  const canonicalValues = [...new Set(values)].sort();
  if (canonicalValues.length !== values.length || canonicalValues.some((item, index) => item !== values[index]))
    throw new TypeError(`${label}_must_be_canonical`);
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum)
    throw new RangeError(`${label}_invalid`);
  return value as number;
}

function bps(value: unknown, label: string): number {
  return integer(value, label, 0, 10_000);
}

function clampBps(value: number): number {
  return Math.max(0, Math.min(10_000, Math.round(value)));
}

function immutable<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return;
    for (const child of Object.values(item as Record<string, unknown>)) freeze(child);
    Object.freeze(item);
  };
  freeze(clone);
  return clone;
}
