import {
  digestPlanningJsonV1,
  type PlanningDigestDomainV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import {
  createMorphogenesisBudgetEnvelopeV1,
  validateMorphogenesisBudgetEnvelopeV1,
} from "./morphogenesis-validation.js";
import type {
  MorphogenesisBudgetEnvelopeV1,
  MorphogenesisCurrencyAmountV1,
} from "./morphogenesis-contracts.js";

export interface MorphogenesisBudgetReservationRequestV1 {
  readonly schemaVersion: 1;
  readonly reservationId: AgentPlatID;
  readonly scopeDigest: PlanningDigestV1;
  readonly proposalDigest: PlanningDigestV1;
  readonly expectedMorphologyEpoch: number;
  readonly operationId: AgentPlatID;
  readonly budget: MorphogenesisBudgetEnvelopeV1;
  readonly reservedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly requestDigest: PlanningDigestV1;
}

export interface MorphogenesisBudgetReservationV1 {
  readonly schemaVersion: 1;
  readonly request: MorphogenesisBudgetReservationRequestV1;
  readonly status: "reserved" | "released" | "expired";
  readonly closedAtLogicalMs: number | null;
  readonly closeOperationId: AgentPlatID | null;
  readonly closeReasonCode: string | null;
  readonly reservationDigest: PlanningDigestV1;
}

export interface MorphogenesisBudgetReservationPortV1 {
  reserve(
    request: MorphogenesisBudgetReservationRequestV1,
  ): Promise<MorphogenesisBudgetReservationV1>;
  release(input: {
    readonly reservationId: AgentPlatID;
    readonly proposalDigest: PlanningDigestV1;
    readonly releaseOperationId: AgentPlatID;
    readonly reasonCode: string;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisBudgetReservationV1>;
  inspect(input: {
    readonly reservationId: AgentPlatID;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisBudgetReservationV1 | null>;
}

export function createMorphogenesisBudgetReservationRequestV1(
  input: Omit<
    MorphogenesisBudgetReservationRequestV1,
    "schemaVersion" | "requestDigest"
  >,
): MorphogenesisBudgetReservationRequestV1 {
  const body = freeze({
    schemaVersion: 1 as const,
    reservationId: id(input.reservationId, "budget reservation ID"),
    scopeDigest: sha(input.scopeDigest, "budget reservation scope digest"),
    proposalDigest: sha(
      input.proposalDigest,
      "budget reservation proposal digest",
    ),
    expectedMorphologyEpoch: positive(
      input.expectedMorphologyEpoch,
      "budget reservation morphology epoch",
    ),
    operationId: id(input.operationId, "budget reservation operation ID"),
    budget: validateMorphogenesisBudgetEnvelopeV1(input.budget),
    reservedAtLogicalMs: nonNegative(
      input.reservedAtLogicalMs,
      "budget reservation time",
    ),
    expiresAtLogicalMs: positive(
      input.expiresAtLogicalMs,
      "budget reservation expiry",
    ),
  });
  if (body.expiresAtLogicalMs <= body.reservedAtLogicalMs)
    fail("budget reservation validity window is invalid");
  return freeze({
    ...body,
    requestDigest: digest("morphogenesis-budget-reservation-request", body),
  });
}

export function validateMorphogenesisBudgetReservationRequestV1(
  input: unknown,
): MorphogenesisBudgetReservationRequestV1 {
  const value = exact(
    input,
    [
      "budget",
      "expectedMorphologyEpoch",
      "expiresAtLogicalMs",
      "operationId",
      "proposalDigest",
      "requestDigest",
      "reservationId",
      "reservedAtLogicalMs",
      "schemaVersion",
      "scopeDigest",
    ],
    "budget reservation request",
  );
  if (value.schemaVersion !== 1)
    fail("budget reservation request schema is invalid");
  const { requestDigest: _digest, schemaVersion: _schema, ...body } = value;
  const result = createMorphogenesisBudgetReservationRequestV1(
    body as Omit<
      MorphogenesisBudgetReservationRequestV1,
      "schemaVersion" | "requestDigest"
    >,
  );
  if (value.requestDigest !== result.requestDigest)
    fail("budget reservation request digest is invalid");
  return result;
}

export function createMorphogenesisBudgetReservationV1(input: {
  readonly request: MorphogenesisBudgetReservationRequestV1;
  readonly status: MorphogenesisBudgetReservationV1["status"];
  readonly closedAtLogicalMs: number | null;
  readonly closeOperationId: AgentPlatID | null;
  readonly closeReasonCode: string | null;
}): MorphogenesisBudgetReservationV1 {
  const request = validateMorphogenesisBudgetReservationRequestV1(input.request);
  if (!new Set(["reserved", "released", "expired"]).has(input.status))
    fail("budget reservation status is invalid");
  const terminal = input.status !== "reserved";
  const body = freeze({
    schemaVersion: 1 as const,
    request,
    status: input.status,
    closedAtLogicalMs:
      input.closedAtLogicalMs === null
        ? null
        : nonNegative(input.closedAtLogicalMs, "budget close time"),
    closeOperationId:
      input.closeOperationId === null
        ? null
        : id(input.closeOperationId, "budget close operation ID"),
    closeReasonCode:
      input.closeReasonCode === null
        ? null
        : token(input.closeReasonCode, "budget close reason"),
  });
  if (
    terminal !== (body.closedAtLogicalMs !== null) ||
    terminal !== (body.closeOperationId !== null) ||
    terminal !== (body.closeReasonCode !== null) ||
    (body.closedAtLogicalMs !== null &&
      body.closedAtLogicalMs < request.reservedAtLogicalMs)
  )
    fail("budget reservation terminal binding is invalid");
  return freeze({
    ...body,
    reservationDigest: digest("morphogenesis-budget-reservation", body),
  });
}

export function validateMorphogenesisBudgetReservationV1(
  input: unknown,
): MorphogenesisBudgetReservationV1 {
  const value = exact(
    input,
    [
      "closeOperationId",
      "closeReasonCode",
      "closedAtLogicalMs",
      "request",
      "reservationDigest",
      "schemaVersion",
      "status",
    ],
    "budget reservation",
  );
  if (value.schemaVersion !== 1)
    fail("budget reservation schema is invalid");
  const result = createMorphogenesisBudgetReservationV1({
    request: value.request as MorphogenesisBudgetReservationRequestV1,
    status: value.status as MorphogenesisBudgetReservationV1["status"],
    closedAtLogicalMs: value.closedAtLogicalMs as number | null,
    closeOperationId: value.closeOperationId as AgentPlatID | null,
    closeReasonCode: value.closeReasonCode as string | null,
  });
  if (value.reservationDigest !== result.reservationDigest)
    fail("budget reservation digest is invalid");
  return result;
}

/** Single-process reference. Applications supply durable atomic reservation. */
export class InMemoryMorphogenesisBudgetReservationPortV1
  implements MorphogenesisBudgetReservationPortV1
{
  readonly #reservations = new Map<string, MorphogenesisBudgetReservationV1>();
  readonly #capacity: MorphogenesisBudgetEnvelopeV1;
  readonly #scopeDigest: PlanningDigestV1;

  constructor(options: {
    readonly scopeDigest: PlanningDigestV1;
    readonly capacity: Omit<MorphogenesisBudgetEnvelopeV1, "budgetDigest">;
  }) {
    this.#scopeDigest = sha(options.scopeDigest, "budget authority scope digest");
    this.#capacity = createMorphogenesisBudgetEnvelopeV1(options.capacity);
  }

  async reserve(
    input: MorphogenesisBudgetReservationRequestV1,
  ): Promise<MorphogenesisBudgetReservationV1> {
    const request = validateMorphogenesisBudgetReservationRequestV1(input);
    if (request.scopeDigest !== this.#scopeDigest)
      fail("budget reservation is cross-scoped");
    this.#expire(request.reservedAtLogicalMs);
    const existing = this.#reservations.get(request.reservationId);
    if (existing) {
      if (existing.request.requestDigest !== request.requestDigest)
        fail("budget reservation identity was reused with changed input");
      return immutable(existing);
    }
    const active = [...this.#reservations.values()].filter(
      ({ status }) => status === "reserved",
    );
    assertCapacity(this.#capacity, [
      ...active.map(({ request: item }) => item.budget),
      request.budget,
    ]);
    const reservation = createMorphogenesisBudgetReservationV1({
      request,
      status: "reserved",
      closedAtLogicalMs: null,
      closeOperationId: null,
      closeReasonCode: null,
    });
    this.#reservations.set(request.reservationId, reservation);
    return immutable(reservation);
  }

  async release(input: {
    readonly reservationId: AgentPlatID;
    readonly proposalDigest: PlanningDigestV1;
    readonly releaseOperationId: AgentPlatID;
    readonly reasonCode: string;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisBudgetReservationV1> {
    const reservationId = id(input.reservationId, "budget reservation ID");
    const proposalDigest = sha(input.proposalDigest, "budget proposal digest");
    const releaseOperationId = id(
      input.releaseOperationId,
      "budget release operation ID",
    );
    const logicalTimeMs = nonNegative(input.logicalTimeMs, "budget release time");
    this.#expire(logicalTimeMs);
    const existing = this.#reservations.get(reservationId);
    if (!existing) fail("budget reservation is unavailable");
    if (existing.request.proposalDigest !== proposalDigest)
      fail("budget release proposal binding changed");
    if (existing.status !== "reserved") {
      if (
        existing.status === "released" &&
        existing.closeOperationId === releaseOperationId
      )
        return immutable(existing);
      fail("budget reservation is already terminal");
    }
    const released = createMorphogenesisBudgetReservationV1({
      request: existing.request,
      status: "released",
      closedAtLogicalMs: logicalTimeMs,
      closeOperationId: releaseOperationId,
      closeReasonCode: token(input.reasonCode, "budget release reason"),
    });
    this.#reservations.set(reservationId, released);
    return immutable(released);
  }

  async inspect(input: {
    readonly reservationId: AgentPlatID;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisBudgetReservationV1 | null> {
    const reservationId = id(input.reservationId, "budget reservation ID");
    this.#expire(nonNegative(input.logicalTimeMs, "budget inspection time"));
    const value = this.#reservations.get(reservationId);
    return value ? immutable(value) : null;
  }

  #expire(logicalTimeMs: number): void {
    for (const [reservationId, existing] of this.#reservations) {
      if (
        existing.status === "reserved" &&
        logicalTimeMs >= existing.request.expiresAtLogicalMs
      )
        this.#reservations.set(
          reservationId,
          createMorphogenesisBudgetReservationV1({
            request: existing.request,
            status: "expired",
            closedAtLogicalMs: logicalTimeMs,
            closeOperationId: `${reservationId}:expiry` as AgentPlatID,
            closeReasonCode: "reservation_expired",
          }),
        );
    }
  }
}

function assertCapacity(
  capacity: MorphogenesisBudgetEnvelopeV1,
  budgets: readonly MorphogenesisBudgetEnvelopeV1[],
): void {
  for (const field of ["maximumActiveAgents", "maximumDurationMs"] as const)
    if (budgets.some((budget) => budget[field] > capacity[field]))
      fail(`budget capacity ${field} is exhausted`);
  const additive = [
    "maximumNewAgents",
    "maximumConcurrentProvisioning",
    "maximumResourceUnits",
    "maximumInteractionUnits",
    "maximumActionUnits",
    "maximumInputTokens",
    "maximumOutputTokens",
    "maximumTotalTokens",
  ] as const;
  for (const field of additive) {
    const total = budgets.reduce(
      (sum, budget) => safeAdd(sum, budget[field], `budget ${field}`),
      0,
    );
    if (total > capacity[field]) fail(`budget capacity ${field} is exhausted`);
  }
  const costs = new Map<string, number>();
  for (const budget of budgets)
    for (const cost of budget.maximumCosts)
      costs.set(
        cost.currency,
        safeAdd(
          costs.get(cost.currency) ?? 0,
          cost.micros,
          `budget ${cost.currency} cost`,
        ),
      );
  const capacityCosts = new Map(
    capacity.maximumCosts.map((cost) => [cost.currency, cost.micros]),
  );
  for (const [currency, micros] of costs)
    if (micros > (capacityCosts.get(currency) ?? -1))
      fail(`budget capacity for ${currency} is exhausted`);
}

function safeAdd(left: number, right: number, label: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) fail(`${label} overflowed`);
  return result;
}

function exact(input: unknown, keys: readonly string[], label: string): Record<string, unknown> { if (!input || typeof input !== "object" || Array.isArray(input)) fail(`${label} must be an object`); const prototype = Object.getPrototypeOf(input); if (prototype !== Object.prototype && prototype !== null) fail(`${label} must be a plain object`); const actual = Object.keys(input as object).sort(); const expected = [...keys].sort(); if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} fields are invalid`); return input as Record<string, unknown>; }
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+=-]{0,255}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-= ]{0,511}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown, label: string): AgentPlatID { if (typeof value !== "string" || !IDENTIFIER.test(value)) fail(`${label} is invalid`); return value as AgentPlatID; }
function token(value: unknown, label: string): string { if (typeof value !== "string" || !TOKEN.test(value)) fail(`${label} is invalid`); return value; }
function sha(value: unknown, label: string): PlanningDigestV1 { if (typeof value !== "string" || !DIGEST.test(value)) fail(`${label} is invalid`); return value as PlanningDigestV1; }
function positive(value: unknown, label: string): number { const result = nonNegative(value, label); if (result < 1) fail(`${label} is invalid`); return result; }
function nonNegative(value: unknown, label: string): number { if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${label} is invalid`); return value as number; }
function digest(domain: PlanningDigestDomainV1, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain, value as PlanningJson); }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const key of Object.getOwnPropertyNames(value)) freeze((value as Record<string, unknown>)[key]); } return value; }
function immutable<T>(value: T): T { return freeze(structuredClone(value)); }
function fail(message: string): never { throw new TypeError(message); }
