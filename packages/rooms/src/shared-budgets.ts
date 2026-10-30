import { AgentPlatError } from "@agentplat/core";
import {
  boundedEventJsonV1,
  eventRecordDigestV1,
  eventTimestampV1,
  eventTokenV1,
} from "@agentplat/events";
import {
  MemoryOperationTablesV1,
  operationConflictV1 as conflict,
  operationIntegerV1 as integer,
  operationSumV1 as sum,
} from "./operations-records.js";
import { followupPageCursorV1 } from "./followup-records.js";
import { compareEventTokensV1 } from "@agentplat/events";
import type { RoomPlannerUsage } from "./room-planner-contracts.js";

export interface SharedBudgetScopeV1 {
  tenantId: string;
  accountId: string;
}
export interface SharedBudgetPrincipalV1 {
  tenantId: string;
  actorId: string;
}
export interface SharedBudgetPeriodV1 extends SharedBudgetScopeV1 {
  id: string;
  revision: number;
  currency: string;
  startsAt: string;
  endsAt: string;
  limitMicros: number;
  categoryLimits: Record<string, number>;
  suspended: boolean;
  spentMicros: number;
  heldMicros: number;
  categories: Record<string, { spentMicros: number; heldMicros: number }>;
  overrun: boolean;
  updatedAt: string;
}
export interface SharedBudgetReservationV1 extends SharedBudgetScopeV1 {
  operationId: string;
  periodId: string;
  currency: string;
  category: string;
  maximumMicros: number;
  reference: string;
  requestDigest: string;
  actorId: string;
  token: string;
  status: "running" | "uncertain" | "settled" | "released";
  startedAt: string;
  expiresAt: string;
  updatedAt: string;
  usage?: RoomPlannerUsage;
  settlementDigest?: string;
  proofRefs?: string[];
}
export interface SharedBudgetTransactionV1 {
  period(id: string): Promise<SharedBudgetPeriodV1 | undefined>;
  periods(startsAt: string, endsAt: string): Promise<SharedBudgetPeriodV1[]>;
  putPeriod(record: SharedBudgetPeriodV1): Promise<void>;
  reservation(
    operationId: string,
  ): Promise<SharedBudgetReservationV1 | undefined>;
  putReservation(record: SharedBudgetReservationV1): Promise<void>;
  reservations(
    periodId: string,
    after: string | undefined,
    limit: number,
  ): Promise<SharedBudgetReservationV1[]>;
  configuration(
    operationId: string,
  ): Promise<{ digest: string; period: SharedBudgetPeriodV1 } | undefined>;
  putConfiguration(
    operationId: string,
    receipt: { digest: string; period: SharedBudgetPeriodV1 },
  ): Promise<void>;
}
/** Serialize the entire callback per native tenant/account and commit all its writes atomically. */
export interface SharedBudgetStoreV1 {
  transaction<T>(
    scope: SharedBudgetScopeV1,
    work: (tx: SharedBudgetTransactionV1) => Promise<T>,
  ): Promise<T>;
}
export interface SharedBudgetAccessV1<Context> {
  authenticate(context: Context): Promise<SharedBudgetPrincipalV1 | null>;
  authorize(
    principal: SharedBudgetPrincipalV1,
    request: {
      operation: "configure" | "read" | "admit" | "settle" | "reconcile";
      accountId: string;
      operationId?: string;
      category?: string;
      reference?: string;
    },
  ): Promise<boolean>;
}
export interface ConfigureSharedBudgetV1 {
  accountId: string;
  id: string;
  operationId: string;
  expectedRevision: number | null;
  currency: string;
  startsAt: string;
  endsAt: string;
  limitMicros: number;
  categoryLimits: Record<string, number>;
  suspended?: boolean;
  acknowledgeOverrunRefs?: string[];
}
export interface AdmitSharedBudgetV1 {
  accountId: string;
  operationId: string;
  currency: string;
  category: string;
  maximumMicros: number;
  reference: string;
  leaseMs?: number;
}
export type SharedBudgetAdmissionV1 =
  | { admitted: true; reservation: SharedBudgetReservationV1 }
  | {
      admitted: false;
      reason:
        | "no_period"
        | "suspended"
        | "overrun"
        | "total_limit"
        | "category_limit"
        | "currency_mismatch"
        | "already_admitted";
      reservation?: SharedBudgetReservationV1;
    };

function scope(record: SharedBudgetScopeV1, expected: SharedBudgetScopeV1) {
  if (
    record.tenantId !== expected.tenantId ||
    record.accountId !== expected.accountId
  )
    throw new AgentPlatError(
      "ADAPTER_ERROR",
      "Budget adapter returned another scope",
    );
}
function usage(value: RoomPlannerUsage) {
  for (const field of ["costMicros", "inputTokens", "outputTokens"] as const)
    integer(value?.[field]);
}
function proof(refs: string[]) {
  if (!Array.isArray(refs) || !refs.length || refs.length > 32)
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Verified proof references are required",
    );
  refs.forEach(eventTokenV1);
}
export class InMemorySharedBudgetStoreV1 implements SharedBudgetStoreV1 {
  private tables = new MemoryOperationTablesV1();
  transaction<T>(
    scope: SharedBudgetScopeV1,
    work: (tx: SharedBudgetTransactionV1) => Promise<T>,
  ) {
    return this.tables.transaction(
      JSON.stringify([scope.tenantId, scope.accountId]),
      async (tx) =>
        work({
          period: async (id) => tx.get("period", id),
          periods: async (start, end) =>
            tx
              .values<SharedBudgetPeriodV1>("period")
              .filter((r) => r.startsAt < end && r.endsAt > start),
          putPeriod: async (r) => {
            tx.put("period", r.id, r);
          },
          reservation: async (id) => tx.get("reservation", id),
          putReservation: async (r) => {
            tx.put("reservation", r.operationId, r);
          },
          reservations: async (periodId, after, limit) =>
            tx
              .values<SharedBudgetReservationV1>("reservation")
              .filter(
                (r) =>
                  r.periodId === periodId &&
                  (!after || compareEventTokensV1(r.operationId, after) > 0),
              )
              .sort((a, b) =>
                compareEventTokensV1(a.operationId, b.operationId),
              )
              .slice(0, limit),
          configuration: async (id) => tx.get("configuration", id),
          putConfiguration: async (id, r) => {
            tx.put("configuration", id, r);
          },
        }),
    );
  }
}
/** One shared cost ledger; Room and workflow call journals retain results, not a second account charge. */
export class SharedBudgetServiceV1<Context> {
  constructor(
    private store: SharedBudgetStoreV1,
    private access: SharedBudgetAccessV1<Context>,
    private options: { clock?: () => Date; id?: () => string } = {},
  ) {}
  private now() {
    const now = (this.options.clock?.() ?? new Date()).toISOString();
    eventTimestampV1(now);
    return now;
  }
  private async permit(
    context: Context,
    request: Parameters<SharedBudgetAccessV1<Context>["authorize"]>[1],
  ) {
    const p = await this.access.authenticate(context);
    if (!p)
      throw new AgentPlatError(
        "UNAUTHORIZED",
        "Budget authentication required",
      );
    eventTokenV1(p.tenantId);
    eventTokenV1(p.actorId);
    eventTokenV1(request.accountId);
    if (
      !(await this.access.authorize(
        structuredClone(p),
        structuredClone(request),
      ))
    )
      throw new AgentPlatError("FORBIDDEN", "Budget access denied");
    return structuredClone(p);
  }
  async configure(context: Context, request: ConfigureSharedBudgetV1) {
    const input = structuredClone(request);
    boundedEventJsonV1(input);
    [input.id, input.operationId, input.currency].forEach(eventTokenV1);
    eventTimestampV1(input.startsAt);
    eventTimestampV1(input.endsAt);
    integer(input.limitMicros);
    if (input.expectedRevision !== null) integer(input.expectedRevision);
    if (
      input.startsAt >= input.endsAt ||
      !input.categoryLimits ||
      Array.isArray(input.categoryLimits) ||
      Object.keys(input.categoryLimits).length > 64
    )
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Invalid budget period or categories",
      );
    for (const [key, value] of Object.entries(input.categoryLimits)) {
      eventTokenV1(key);
      integer(value);
    }
    if (input.acknowledgeOverrunRefs) proof(input.acknowledgeOverrunRefs);
    const p = await this.permit(context, {
      operation: "configure",
      accountId: input.accountId,
      operationId: input.operationId,
    });
    const native = { tenantId: p.tenantId, accountId: input.accountId };
    const digest = await eventRecordDigestV1({ actorId: p.actorId, input });
    return this.store.transaction(native, async (tx) => {
      const replay = await tx.configuration(input.operationId);
      if (replay) {
        scope(replay.period, native);
        if (replay.digest !== digest) conflict();
        return replay.period;
      }
      const old = await tx.period(input.id);
      if (old) scope(old, native);
      if ((old?.revision ?? null) !== input.expectedRevision) conflict();
      if (
        old &&
        (old.currency !== input.currency ||
          old.startsAt !== input.startsAt ||
          old.endsAt !== input.endsAt)
      )
        conflict("Period currency and boundaries are immutable");
      for (const other of await tx.periods(input.startsAt, input.endsAt)) {
        scope(other, native);
        if (other.id !== input.id) conflict("Budget periods cannot overlap");
      }
      if (old && sum(old.spentMicros, old.heldMicros) > input.limitMicros)
        conflict("Budget cannot discard usage or held reservations");
      const categories = old?.categories ?? {};
      for (const [key, c] of Object.entries(categories))
        if (
          Object.hasOwn(input.categoryLimits, key) &&
          sum(c.spentMicros, c.heldMicros) > input.categoryLimits[key]
        )
          conflict("Category limit cannot discard usage or reservations");
      const next: SharedBudgetPeriodV1 = {
        ...native,
        id: input.id,
        revision: (old?.revision ?? 0) + 1,
        currency: input.currency,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        limitMicros: input.limitMicros,
        categoryLimits: input.categoryLimits,
        suspended: input.suspended ?? false,
        spentMicros: old?.spentMicros ?? 0,
        heldMicros: old?.heldMicros ?? 0,
        categories,
        overrun: !!old?.overrun && !input.acknowledgeOverrunRefs,
        updatedAt: this.now(),
      };
      await tx.putPeriod(next);
      await tx.putConfiguration(input.operationId, { digest, period: next });
      return next;
    });
  }
  async read(context: Context, accountId: string, periodId: string) {
    eventTokenV1(periodId);
    const p = await this.permit(context, { operation: "read", accountId }),
      native = { tenantId: p.tenantId, accountId };
    return this.store.transaction(native, async (tx) => {
      const r = await tx.period(periodId);
      if (r) scope(r, native);
      return r;
    });
  }
  async reservation(context: Context, accountId: string, operationId: string) {
    eventTokenV1(operationId);
    const p = await this.permit(context, {
        operation: "read",
        accountId,
        operationId,
      }),
      native = { tenantId: p.tenantId, accountId };
    return this.store.transaction(native, async (tx) => {
      const r = await tx.reservation(operationId);
      if (r) scope(r, native);
      return r;
    });
  }
  async reservations(
    context: Context,
    accountId: string,
    periodId: string,
    input: { cursor?: string; limit?: number } = {},
  ) {
    input = structuredClone(input);
    eventTokenV1(periodId);
    const limit = input.limit ?? 50;
    integer(limit, 200);
    if (!limit) conflict();
    const p = await this.permit(context, { operation: "read", accountId }),
      native = { tenantId: p.tenantId, accountId };
    const page = await followupPageCursorV1(
      { ...native, periodId },
      input.cursor,
      "id",
    );
    const rows = await this.store.transaction(native, (tx) =>
      tx.reservations(periodId, page.after as string | undefined, limit + 1),
    );
    for (const row of rows) {
      scope(row, native);
      if (row.periodId !== periodId) conflict("Budget period query changed");
      await this.permit(context, {
        operation: "read",
        accountId,
        operationId: row.operationId,
        category: row.category,
        reference: row.reference,
      });
    }
    const items = rows.slice(0, limit);
    return {
      items,
      ...(rows.length > limit
        ? { cursor: page.encode(items.at(-1)!.operationId) }
        : {}),
    };
  }
  async admit(
    context: Context,
    request: AdmitSharedBudgetV1,
    expectedTenantId?: string,
  ): Promise<SharedBudgetAdmissionV1> {
    const input = structuredClone(request);
    boundedEventJsonV1(input);
    [
      input.operationId,
      input.currency,
      input.category,
      input.reference,
    ].forEach(eventTokenV1);
    integer(input.maximumMicros);
    const leaseMs = input.leaseMs ?? 300_000;
    integer(leaseMs, 600_000);
    if (leaseMs < 1000)
      throw new AgentPlatError("VALIDATION_ERROR", "Invalid budget lease");
    const p = await this.permit(context, {
      operation: "admit",
      accountId: input.accountId,
      operationId: input.operationId,
      category: input.category,
      reference: input.reference,
    });
    if (expectedTenantId !== undefined && p.tenantId !== expectedTenantId)
      throw new AgentPlatError(
        "FORBIDDEN",
        "Budget tenant does not match the caller scope",
      );
    const native = { tenantId: p.tenantId, accountId: input.accountId };
    const digest = await eventRecordDigestV1({ actorId: p.actorId, input });
    return this.store.transaction(native, async (tx) => {
      const old = await tx.reservation(input.operationId);
      if (old) {
        scope(old, native);
        if (old.requestDigest !== digest) conflict();
        return {
          admitted: false,
          reason: "already_admitted",
          reservation: old,
        };
      }
      const now = this.now(),
        candidates = await tx.periods(
          now,
          new Date(Date.parse(now) + 1).toISOString(),
        );
      if (!candidates.length) return { admitted: false, reason: "no_period" };
      if (candidates.length !== 1) conflict("Budget periods overlap");
      const period = candidates[0];
      scope(period, native);
      if (period.currency !== input.currency)
        return { admitted: false, reason: "currency_mismatch" };
      if (period.suspended) return { admitted: false, reason: "suspended" };
      if (period.overrun) return { admitted: false, reason: "overrun" };
      if (
        !Object.hasOwn(period.categories, input.category) &&
        Object.keys(period.categories).length >= 128
      )
        throw new AgentPlatError(
          "VALIDATION_ERROR",
          "Budget category inventory exceeds its bound",
        );
      if (
        sum(period.spentMicros, period.heldMicros, input.maximumMicros) >
        period.limitMicros
      )
        return { admitted: false, reason: "total_limit" };
      const category = Object.hasOwn(period.categories, input.category)
        ? period.categories[input.category]
        : { spentMicros: 0, heldMicros: 0 };
      if (
        Object.hasOwn(period.categoryLimits, input.category) &&
        sum(category.spentMicros, category.heldMicros, input.maximumMicros) >
          period.categoryLimits[input.category]
      )
        return { admitted: false, reason: "category_limit" };
      period.heldMicros = sum(period.heldMicros, input.maximumMicros);
      Object.defineProperty(period.categories, input.category, {
        value: {
          ...category,
          heldMicros: sum(category.heldMicros, input.maximumMicros),
        },
        enumerable: true,
        configurable: true,
        writable: true,
      });
      period.updatedAt = now;
      const reservation: SharedBudgetReservationV1 = {
        ...native,
        operationId: input.operationId,
        periodId: period.id,
        currency: period.currency,
        category: input.category,
        maximumMicros: input.maximumMicros,
        reference: input.reference,
        requestDigest: digest,
        actorId: p.actorId,
        token: this.options.id?.() ?? globalThis.crypto.randomUUID(),
        status: "running",
        startedAt: now,
        expiresAt: new Date(Date.parse(now) + leaseMs).toISOString(),
        updatedAt: now,
      };
      eventTokenV1(reservation.token);
      await tx.putPeriod(period);
      await tx.putReservation(reservation);
      return { admitted: true, reservation };
    });
  }
  async assertCurrent(context: Context, request: SharedBudgetReservationV1) {
    const claim = structuredClone(request);
    const current = await this.reservation(
      context,
      claim.accountId,
      claim.operationId,
    );
    if (
      !current ||
      current.token !== claim.token ||
      current.actorId !== claim.actorId ||
      current.status !== "running" ||
      current.expiresAt <= this.now()
    )
      conflict("Budget admission is no longer current");
    const p = await this.permit(context, {
      operation: "admit",
      accountId: claim.accountId,
      operationId: claim.operationId,
      category: current.category,
      reference: current.reference,
    });
    if (p.actorId !== current.actorId || p.tenantId !== claim.tenantId)
      throw new AgentPlatError(
        "FORBIDDEN",
        "Budget claim belongs to another actor",
      );
    const period = await this.read(context, claim.accountId, current.periodId);
    if (
      !period ||
      period.suspended ||
      period.overrun ||
      this.now() >= period.endsAt
    )
      conflict("Budget period is unavailable");
  }
  async uncertain(context: Context, request: SharedBudgetReservationV1) {
    const claim = structuredClone(request);
    const p = await this.permit(context, {
      operation: "settle",
      accountId: claim.accountId,
      operationId: claim.operationId,
    });
    return this.store.transaction(
      { tenantId: p.tenantId, accountId: claim.accountId },
      async (tx) => {
        const current = await tx.reservation(claim.operationId);
        if (
          !current ||
          current.tenantId !== claim.tenantId ||
          current.token !== claim.token ||
          current.actorId !== p.actorId
        )
          conflict();
        if (current.status === "running") {
          current.status = "uncertain";
          current.updatedAt = this.now();
          await tx.putReservation(current);
        }
        return current;
      },
    );
  }
  async settle(
    context: Context,
    request: SharedBudgetReservationV1,
    reportedUsage: RoomPlannerUsage,
  ) {
    const claim = structuredClone(request),
      actual = structuredClone(reportedUsage);
    usage(actual);
    const p = await this.permit(context, {
      operation: "settle",
      accountId: claim.accountId,
      operationId: claim.operationId,
    });
    const native = { tenantId: p.tenantId, accountId: claim.accountId };
    return this.store.transaction(native, async (tx) => {
      const current = await tx.reservation(claim.operationId);
      if (
        !current ||
        current.tenantId !== claim.tenantId ||
        current.token !== claim.token ||
        current.actorId !== p.actorId
      )
        conflict();
      return this.finish(tx, native, current, actual);
    });
  }
  private async finish(
    tx: SharedBudgetTransactionV1,
    native: SharedBudgetScopeV1,
    current: SharedBudgetReservationV1,
    actual?: RoomPlannerUsage,
    proofRefs?: string[],
  ) {
    scope(current, native);
    const digest = await eventRecordDigestV1({ usage: actual ?? null });
    if (
      current.status === "released" &&
      actual &&
      actual.costMicros === 0 &&
      actual.inputTokens === 0 &&
      actual.outputTokens === 0
    )
      return current;
    if (current.settlementDigest) {
      if (current.settlementDigest !== digest)
        conflict("Budget settlement changed");
      return current;
    }
    const period = await tx.period(current.periodId);
    if (!period) conflict("Reservation period is missing");
    scope(period, native);
    const c = period.categories[current.category];
    if (!c) conflict("Reservation category is missing");
    period.heldMicros -= current.maximumMicros;
    c.heldMicros -= current.maximumMicros;
    integer(period.heldMicros);
    integer(c.heldMicros);
    if (actual) {
      period.spentMicros = sum(period.spentMicros, actual.costMicros);
      c.spentMicros = sum(c.spentMicros, actual.costMicros);
      if (actual.costMicros > current.maximumMicros) period.overrun = true;
    }
    current.status = actual ? "settled" : "released";
    current.updatedAt = period.updatedAt = this.now();
    current.settlementDigest = digest;
    if (actual) current.usage = actual;
    if (proofRefs) current.proofRefs = proofRefs;
    await tx.putPeriod(period);
    await tx.putReservation(current);
    return current;
  }
  async reconcile(
    context: Context,
    accountId: string,
    operationId: string,
    input: {
      proofRefs: string[];
      outcome:
        { kind: "spent"; usage: RoomPlannerUsage } | { kind: "not_started" };
    },
  ) {
    input = structuredClone(input);
    eventTokenV1(operationId);
    proof(input.proofRefs);
    boundedEventJsonV1(input);
    if (!["spent", "not_started"].includes(input.outcome.kind))
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Invalid budget reconciliation",
      );
    if (input.outcome.kind === "spent") usage(input.outcome.usage);
    const p = await this.permit(context, {
        operation: "reconcile",
        accountId,
        operationId,
      }),
      native = { tenantId: p.tenantId, accountId };
    return this.store.transaction(native, async (tx) => {
      const current = await tx.reservation(operationId);
      if (!current) conflict();
      scope(current, native);
      if (
        !current.settlementDigest &&
        current.status === "running" &&
        current.expiresAt > this.now()
      )
        conflict("An active budget call cannot be reconciled");
      return this.finish(
        tx,
        native,
        current,
        input.outcome.kind === "spent" ? input.outcome.usage : undefined,
        input.proofRefs,
      );
    });
  }
}
