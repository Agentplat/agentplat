import {
  createMorphogenesisBudgetEnvelopeV1,
  createMorphogenesisBudgetReservationV1,
  validateMorphogenesisBudgetReservationRequestV1,
  validateMorphogenesisBudgetReservationV1,
  type MorphogenesisBudgetEnvelopeV1,
  type MorphogenesisBudgetReservationPortV1,
  type MorphogenesisBudgetReservationRequestV1,
  type MorphogenesisBudgetReservationV1,
} from "@agentplat/collective-runtime/morphogenesis";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool, PoolClient } from "pg";

import type { MorphogenesisPostgresRollbackWitnessV1 } from "./morphogenesis.js";

export interface MorphogenesisBudgetPostgresOptionsV1 {
  readonly scopeId: string;
  readonly scopeDigest: `sha256:${string}`;
  readonly capacity: Omit<MorphogenesisBudgetEnvelopeV1, "budgetDigest">;
  readonly rollbackWitness: MorphogenesisPostgresRollbackWitnessV1;
  readonly schema?: string;
}

interface BudgetRowV1 {
  readonly scope_digest: string;
  readonly request_digest: string;
  readonly proposal_digest: string;
  readonly expires_at_logical_ms: string | number;
  readonly status: string;
  readonly revision: string | number;
  readonly reservation_digest: string;
  readonly reservation: unknown;
}

/** PostgreSQL-backed, scope-serialized Morphogenesis budget authority. */
export class PostgresMorphogenesisBudgetReservationPortV1
  implements MorphogenesisBudgetReservationPortV1
{
  readonly #prefix: string;
  readonly #capacity: MorphogenesisBudgetEnvelopeV1;

  constructor(
    readonly pool: Pool,
    readonly options: MorphogenesisBudgetPostgresOptionsV1,
  ) {
    if (
      !pool ||
      !identifier(options?.scopeId) ||
      !digest(options?.scopeDigest) ||
      !options.rollbackWitness
    )
      throw new TypeError("Morphogenesis PostgreSQL budget options are invalid");
    this.#capacity = createMorphogenesisBudgetEnvelopeV1(options.capacity);
    this.#prefix = `${quotePostgresIdentifier(
      normalizePostgresIdentifier(
        options.schema ?? defaultPostgresSchema,
        "schema",
      ),
    )}.`;
  }

  async reserve(
    input: MorphogenesisBudgetReservationRequestV1,
  ): Promise<MorphogenesisBudgetReservationV1> {
    const request = validateMorphogenesisBudgetReservationRequestV1(input);
    if (request.scopeDigest !== this.options.scopeDigest)
      fail("budget reservation is cross-scoped");
    const result = await this.#transaction(async (client) => {
      await this.#lock(client);
      const current = await this.#load(client, request.reservationId, true);
      if (current) {
        const retained = await this.#expireIfRequired(
          client,
          current,
          request.reservedAtLogicalMs,
        );
        if (retained.request.requestDigest !== request.requestDigest)
          fail("budget reservation identity was reused with changed input");
        return {
          reservation: retained,
          transition:
            retained === current
              ? null
              : {
                  previousRevision: 0,
                  previousDigest: current.reservationDigest,
                  nextRevision: 1,
                  nextDigest: retained.reservationDigest,
                },
        };
      }
      const activeRows = await client.query<BudgetRowV1>(
        `SELECT scope_digest, request_digest, proposal_digest,
                expires_at_logical_ms, status, revision,
                reservation_digest, reservation
           FROM ${this.#prefix}morphogenesis_budget_reservations
          WHERE scope_id = $1 AND status = 'reserved'
            AND expires_at_logical_ms > $2
          ORDER BY reservation_id COLLATE "C"
          FOR UPDATE`,
        [this.options.scopeId, request.reservedAtLogicalMs],
      );
      const active = activeRows.rows.map((row) => this.#validateRow(row));
      assertCapacity(this.#capacity, [
        ...active.map(({ request: value }) => value.budget),
        request.budget,
      ]);
      const reservation = createMorphogenesisBudgetReservationV1({
        request,
        status: "reserved",
        closedAtLogicalMs: null,
        closeOperationId: null,
        closeReasonCode: null,
      });
      await client.query(
        `INSERT INTO ${this.#prefix}morphogenesis_budget_reservations
          (scope_id, scope_digest, reservation_id, request_digest,
           proposal_digest, expires_at_logical_ms, status, revision,
           reservation_digest, reservation)
         VALUES ($1,$2,$3,$4,$5,$6,'reserved',0,$7,$8::jsonb)`,
        [
          this.options.scopeId,
          request.scopeDigest,
          request.reservationId,
          request.requestDigest,
          request.proposalDigest,
          request.expiresAtLogicalMs,
          reservation.reservationDigest,
          JSON.stringify(reservation),
        ],
      );
      return {
        reservation,
        transition: {
          previousRevision: null,
          previousDigest: null,
          nextRevision: 0,
          nextDigest: reservation.reservationDigest,
        },
      };
    });
    await this.#recordWitness(result.reservation, result.transition);
    await this.#verifyWitness(result.reservation);
    return immutable(result.reservation);
  }

  async release(input: {
    readonly reservationId: string;
    readonly proposalDigest: `sha256:${string}`;
    readonly releaseOperationId: string;
    readonly reasonCode: string;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisBudgetReservationV1> {
    if (
      !identifier(input.reservationId) ||
      !digest(input.proposalDigest) ||
      !identifier(input.releaseOperationId) ||
      !token(input.reasonCode) ||
      !nonNegative(input.logicalTimeMs)
    )
      fail("budget release input is invalid");
    const result = await this.#transaction(async (client) => {
      await this.#lock(client);
      const loaded = await this.#load(client, input.reservationId, true);
      if (!loaded) fail("budget reservation is unavailable");
      const current = await this.#expireIfRequired(
        client,
        loaded,
        input.logicalTimeMs,
      );
      if (current.request.proposalDigest !== input.proposalDigest)
        fail("budget release proposal binding changed");
      if (current.status !== "reserved") {
        if (
          current.status === "released" &&
          current.closeOperationId === input.releaseOperationId
        )
          return { reservation: current, transition: null };
        fail("budget reservation is already terminal");
      }
      const released = createMorphogenesisBudgetReservationV1({
        request: current.request,
        status: "released",
        closedAtLogicalMs: input.logicalTimeMs,
        closeOperationId: input.releaseOperationId,
        closeReasonCode: input.reasonCode,
      });
      await this.#update(client, released, 1);
      return {
        reservation: released,
        transition: {
          previousRevision: 0,
          previousDigest: current.reservationDigest,
          nextRevision: 1,
          nextDigest: released.reservationDigest,
        },
      };
    });
    await this.#recordWitness(result.reservation, result.transition);
    await this.#verifyWitness(result.reservation);
    return immutable(result.reservation);
  }

  async inspect(input: {
    readonly reservationId: string;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisBudgetReservationV1 | null> {
    if (!identifier(input.reservationId) || !nonNegative(input.logicalTimeMs))
      fail("budget inspection input is invalid");
    const result = await this.#transaction(async (client) => {
      await this.#lock(client);
      const loaded = await this.#load(client, input.reservationId, true);
      if (!loaded) return { reservation: null, transition: null };
      const reservation = await this.#expireIfRequired(
        client,
        loaded,
        input.logicalTimeMs,
      );
      return {
        reservation,
        transition:
          reservation === loaded
            ? null
            : {
                previousRevision: 0,
                previousDigest: loaded.reservationDigest,
                nextRevision: 1,
                nextDigest: reservation.reservationDigest,
              },
      };
    });
    if (!result.reservation) return null;
    await this.#recordWitness(result.reservation, result.transition);
    await this.#verifyWitness(result.reservation);
    return immutable(result.reservation);
  }

  async #expireIfRequired(
    client: PoolClient,
    current: MorphogenesisBudgetReservationV1,
    logicalTimeMs: number,
  ): Promise<MorphogenesisBudgetReservationV1> {
    if (
      current.status !== "reserved" ||
      logicalTimeMs < current.request.expiresAtLogicalMs
    )
      return current;
    const expired = createMorphogenesisBudgetReservationV1({
      request: current.request,
      status: "expired",
      closedAtLogicalMs: logicalTimeMs,
      closeOperationId: `${current.request.reservationId}:expiry`,
      closeReasonCode: "reservation_expired",
    });
    await this.#update(client, expired, 1);
    return expired;
  }

  async #load(
    client: PoolClient,
    reservationId: string,
    forUpdate: boolean,
  ): Promise<MorphogenesisBudgetReservationV1 | null> {
    const result = await client.query<BudgetRowV1>(
      `SELECT scope_digest, request_digest, proposal_digest,
              expires_at_logical_ms, status, revision,
              reservation_digest, reservation
         FROM ${this.#prefix}morphogenesis_budget_reservations
        WHERE scope_id = $1 AND reservation_id = $2
        ${forUpdate ? "FOR UPDATE" : ""}`,
      [this.options.scopeId, reservationId],
    );
    return result.rows[0] ? this.#validateRow(result.rows[0]) : null;
  }

  #validateRow(row: BudgetRowV1): MorphogenesisBudgetReservationV1 {
    const reservation = validateMorphogenesisBudgetReservationV1(
      row.reservation,
    );
    const revision = reservation.status === "reserved" ? 0 : 1;
    if (
      row.scope_digest !== this.options.scopeDigest ||
      row.scope_digest !== reservation.request.scopeDigest ||
      row.request_digest !== reservation.request.requestDigest ||
      row.proposal_digest !== reservation.request.proposalDigest ||
      Number(row.expires_at_logical_ms) !==
        reservation.request.expiresAtLogicalMs ||
      row.status !== reservation.status ||
      Number(row.revision) !== revision ||
      row.reservation_digest !== reservation.reservationDigest
    )
      fail("Morphogenesis PostgreSQL budget row diverged");
    return reservation;
  }

  async #update(
    client: PoolClient,
    reservation: MorphogenesisBudgetReservationV1,
    revision: number,
  ): Promise<void> {
    const result = await client.query(
      `UPDATE ${this.#prefix}morphogenesis_budget_reservations
          SET status = $3, revision = $4, reservation_digest = $5,
              reservation = $6::jsonb, updated_at = transaction_timestamp()
        WHERE scope_id = $1 AND reservation_id = $2 AND revision = 0`,
      [
        this.options.scopeId,
        reservation.request.reservationId,
        reservation.status,
        revision,
        reservation.reservationDigest,
        JSON.stringify(reservation),
      ],
    );
    if ((result.rowCount ?? 0) !== 1)
      fail("Morphogenesis PostgreSQL budget transition conflicted");
  }

  #revision(reservation: MorphogenesisBudgetReservationV1): number {
    return reservation.status === "reserved" ? 0 : 1;
  }

  async #verifyWitness(
    reservation: MorphogenesisBudgetReservationV1,
  ): Promise<void> {
    if (
      !(await this.options.rollbackWitness.verify({
        scopeId: this.options.scopeId,
        stateKind: "morphogenesis-budget-reservation",
        stateKey: reservation.request.reservationId,
        revision: this.#revision(reservation),
        digest: reservation.reservationDigest,
      }))
    )
      fail("Morphogenesis PostgreSQL budget rollback witness diverged");
  }

  async #recordWitness(
    reservation: MorphogenesisBudgetReservationV1,
    transition: {
      readonly previousRevision: number | null;
      readonly previousDigest: `sha256:${string}` | null;
      readonly nextRevision: number;
      readonly nextDigest: `sha256:${string}`;
    } | null,
  ): Promise<void> {
    if (
      transition &&
      !(await this.options.rollbackWitness.record({
        scopeId: this.options.scopeId,
        stateKind: "morphogenesis-budget-reservation",
        stateKey: reservation.request.reservationId,
        ...transition,
      }))
    )
      fail("Morphogenesis PostgreSQL budget rollback witness rejected state");
  }

  async #lock(client: PoolClient): Promise<void> {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`${this.options.scopeId}:morphogenesis-budget`],
    );
  }

  async #transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
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
  for (const field of [
    "maximumNewAgents",
    "maximumConcurrentProvisioning",
    "maximumResourceUnits",
    "maximumInteractionUnits",
    "maximumActionUnits",
    "maximumInputTokens",
    "maximumOutputTokens",
    "maximumTotalTokens",
  ] as const) {
    const total = budgets.reduce((sum, budget) => safeAdd(sum, budget[field]), 0);
    if (total > capacity[field]) fail(`budget capacity ${field} is exhausted`);
  }
  const costs = new Map<string, number>();
  for (const budget of budgets)
    for (const cost of budget.maximumCosts)
      costs.set(cost.currency, safeAdd(costs.get(cost.currency) ?? 0, cost.micros));
  const ceilings = new Map(
    capacity.maximumCosts.map(({ currency, micros }) => [currency, micros]),
  );
  for (const [currency, micros] of costs)
    if (micros > (ceilings.get(currency) ?? -1))
      fail(`budget capacity for ${currency} is exhausted`);
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) fail("budget capacity overflowed");
  return result;
}

function identifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:@/+=-]{0,255}$/u.test(value)
  );
}

function token(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:@/+-= ]{0,511}$/u.test(value)
  );
}

function digest(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function nonNegative(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function immutable<T>(value: T): T {
  return structuredClone(value);
}

function fail(message: string): never {
  throw new TypeError(message);
}
