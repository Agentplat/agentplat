import type {
  ToolHandler,
  ToolInvocationContext,
  ToolInvocationResult,
  ToolRegistry,
} from "@agentplat/tools";
import {
  canonicalizeControlJsonV1,
  digestControlJsonV1,
  utf8ByteLength,
} from "./canonical.js";

export const MAX_ACTION_INPUT_BYTES_V1 = 65_536;
export const MAX_CONTROL_JSON_DEPTH_V1 = 64;
export const MAX_CONTROL_JSON_NODES_V1 = 65_536;

export type ControlJson =
  | null
  | boolean
  | number
  | string
  | readonly ControlJson[]
  | { readonly [key: string]: ControlJson };
export type ControlJsonObject = { readonly [key: string]: ControlJson };
export type GrantStatus =
  "issued" | "reserved" | "dispatched" | "failed" | "indeterminate" | "expired";

export interface StandaloneActionScope {
  readonly schemaVersion: 1;
  readonly kind: "standalone";
  readonly tenantId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly organizationId: string | null;
  readonly workspaceId: string | null;
  readonly policyId: string;
  readonly policyVersion: number;
}
export interface CoordinatedActionScope {
  readonly schemaVersion: 1;
  readonly kind: "coordinated";
  readonly tenantId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly meshId: string;
  readonly objectiveId: string;
  readonly objectiveRevision: number;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly peerId: string;
  readonly instanceId: string;
  readonly assignmentAuthorityId: string;
  readonly assignmentEpoch: number;
  readonly fencingToken: string;
  readonly leaseExpiresAtLogicalMs: number;
  readonly authorityGeneration: number;
  readonly objectiveTerminal: boolean;
  readonly workTerminal: boolean;
}
export type ActionScope = StandaloneActionScope | CoordinatedActionScope;
export interface ActionBinding {
  readonly schemaVersion: 1;
  readonly actionBindingId: string;
  readonly actionBindingVersion: number;
  readonly namespace: string;
  readonly toolId: string;
  readonly operation: string;
  readonly dispatcherId: string;
  readonly dispatcherVersion: number;
  readonly contextResolverId: string;
  readonly contextResolverVersion: number;
  readonly fencingMode: "local_only" | "downstream_atomic";
  readonly handlerDigest: string;
}
export interface ActionReservation {
  readonly schemaVersion: 1;
  readonly reservationId: string;
  readonly dispatchAttemptId: string;
  readonly reservedByGatewayId: string;
  readonly reservedStateGeneration: number;
  readonly authorityGeneration: number | null;
  readonly fencingToken: string | null;
  readonly reservedAtLogicalMs: number;
}
export interface ActionGrant {
  readonly schemaVersion: 1;
  readonly grantId: string;
  readonly stateGeneration: number;
  readonly scope: ActionScope;
  readonly scopeDigest: string;
  readonly namespace: string;
  readonly toolId: string;
  readonly operation: string;
  readonly actionBindingId: string;
  readonly actionBindingVersion: number;
  readonly handlerDigest: string;
  readonly inputDigest: string;
  readonly actionDigest: string;
  readonly assessmentRequestId: string;
  readonly assessmentId: string;
  readonly assessmentTargetDigest: string;
  readonly idempotencyKey: string;
  readonly issuedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly singleUse: true;
  readonly status: GrantStatus;
  readonly reservation: ActionReservation | null;
}
export interface ActionIdempotencyRecord {
  readonly schemaVersion: 1;
  readonly scopeDigest: string;
  readonly idempotencyKey: string;
  readonly actionDigest: string;
  readonly grantId: string;
  readonly retainedOutcome: GrantStatus;
}
export interface ActionDispatchPermit {
  readonly schemaVersion: 1;
  readonly grantId: string;
  readonly reservationId: string;
  readonly dispatchAttemptId: string;
  readonly gatewayId: string;
  readonly scopeDigest: string;
  readonly actionDigest: string;
  readonly idempotencyKey: string;
  readonly authorityGeneration: number | null;
  readonly fencingToken: string | null;
}
export type AuthorityResult =
  | {
      readonly schemaVersion: 1;
      readonly status: "current";
      readonly resolverId: string;
      readonly resolverVersion: number;
      readonly scopeDigest: string;
      readonly actionDigest: string;
      readonly scope: ActionScope;
      readonly authorityGeneration: number | null;
      readonly fencingToken: string | null;
    }
  | {
      readonly schemaVersion: 1;
      readonly status: "stale" | "unavailable";
      readonly resolverId: string;
      readonly resolverVersion: number;
      readonly scopeDigest: string;
      readonly actionDigest: string;
    };
export interface ActionAuthorityResolver {
  readonly resolverId: string;
  readonly resolverVersion: number;
  resolve(
    scope: ActionScope,
    actionDigest: string,
    logicalTimeMs: number,
  ): Promise<AuthorityResult>;
}
export interface ActionAssessmentResolver {
  readonly assessorId: string;
  readonly assessorVersion: number;
  /**
   * Atomically consumes the exact assessment on first use. Repeating the call
   * for the same reserved grant is an idempotent currentness check and must
   * return false after run cancellation, generation advance or revocation.
   */
  consumeCurrent(grant: ActionGrant, logicalTimeMs: number): Promise<boolean>;
}
export interface ActionInvocationContextResolver {
  readonly contextResolverId: string;
  readonly contextResolverVersion: number;
  resolve(
    scope: ActionScope,
    binding: ActionBinding,
  ): Promise<ToolInvocationContext>;
}
export interface ActionDispatcher {
  readonly dispatcherId: string;
  readonly dispatcherVersion: number;
  readonly fencingMode: "local_only" | "downstream_atomic";
  dispatch(input: {
    readonly binding: ActionBinding;
    readonly input: ControlJsonObject;
    readonly context: ToolInvocationContext;
    readonly permit: ActionDispatchPermit;
  }): Promise<ToolInvocationResult>;
}
export interface ActionGatewayLimitsV1 {
  readonly maxActionInputBytes?: number;
}

export function canonicalControlJson(value: ControlJson): string {
  return canonicalizeControlJsonV1(value as never);
}
export function controlDigest(
  domain:
    | "action"
    | "action-input"
    | "scope"
    | "grant"
    | "handler-binding"
    | "message",
  value: ControlJson,
): string {
  if (domain === "grant") return digestControlJsonV1("state", value as never);
  return digestControlJsonV1(domain, value as never);
}
export function actionInputDigest(input: ControlJsonObject): string {
  return controlDigest("action-input", input);
}
export function scopeDigest(scope: ActionScope): string {
  return controlDigest("scope", scope as unknown as ControlJson);
}
export function actionDigest(
  grant: ActionGrant,
  binding: ActionBinding,
): string {
  return controlDigest("action", {
    scopeDigest: grant.scopeDigest,
    namespace: binding.namespace,
    toolId: binding.toolId,
    operation: binding.operation,
    actionBindingId: binding.actionBindingId,
    actionBindingVersion: binding.actionBindingVersion,
    handlerDigest: binding.handlerDigest,
    inputDigest: grant.inputDigest,
  });
}

function freezeGrant(grant: ActionGrant): ActionGrant {
  return Object.freeze({
    ...grant,
    scope: freezeScope(grant.scope),
    reservation: grant.reservation
      ? Object.freeze({ ...grant.reservation })
      : null,
  });
}
function idempotencyKey(scope: string, key: string): string {
  return `${scope.length}:${scope}${key.length}:${key}`;
}
function assertTime(time: number): void {
  if (!Number.isSafeInteger(time) || time < 0)
    throw new TypeError("logicalTimeMs must be a non-negative safe integer");
}

export type ActionGrantRepositoryValueV1<T> = T | Promise<T>;

export interface ActionGrantRepositoryCreateResultV1 {
  readonly status: "created" | "existing" | "conflict";
  readonly conflictKind: "grant" | "idempotency" | null;
  readonly grant: ActionGrant | null;
}

export interface ActionGrantRepositoryCasResultV1 {
  readonly status: "updated" | "conflict";
  readonly grant: ActionGrant | null;
}

/**
 * Opaque grant storage port. Semantic transitions remain owned by the gateway;
 * repositories only provide exact create/load/idempotency and generation CAS.
 */
export interface ActionGrantRepository {
  readonly gatewayId: string;
  observeLogicalTime(logicalTimeMs: number): ActionGrantRepositoryValueV1<void>;
  loadGrant(
    grantId: string,
  ): ActionGrantRepositoryValueV1<ActionGrant | undefined>;
  loadIdempotency(
    scopeDigest: string,
    key: string,
  ): ActionGrantRepositoryValueV1<ActionIdempotencyRecord | undefined>;
  createGrant(input: {
    readonly grant: ActionGrant;
    readonly idempotency: ActionIdempotencyRecord;
  }): ActionGrantRepositoryValueV1<ActionGrantRepositoryCreateResultV1>;
  compareAndSwapGrant(input: {
    readonly grantId: string;
    readonly expectedStateGeneration: number;
    readonly expectedGrantDigest: string;
    readonly nextGrant: ActionGrant;
    readonly nextIdempotency: ActionIdempotencyRecord;
  }): ActionGrantRepositoryValueV1<ActionGrantRepositoryCasResultV1>;
}

/** In-memory, single-process ledger. Reservation is synchronous and linearized. */
export class LocalGrantLedger implements ActionGrantRepository {
  private readonly grants = new Map<string, ActionGrant>();
  private readonly idempotency = new Map<string, ActionIdempotencyRecord>();
  private highWater = 0;
  constructor(readonly gatewayId: string) {}
  issue(grant: ActionGrant): ActionGrant {
    this.time(grant.issuedAtLogicalMs);
    if (
      grant.schemaVersion !== 1 ||
      grant.expiresAtLogicalMs <= grant.issuedAtLogicalMs ||
      grant.expiresAtLogicalMs - grant.issuedAtLogicalMs > 120_000 ||
      !grant.singleUse ||
      grant.status !== "issued" ||
      grant.reservation !== null ||
      !isActionScopeV1(grant.scope) ||
      scopeDigest(grant.scope) !== grant.scopeDigest ||
      !/^sha256:[0-9a-f]{64}$/.test(grant.inputDigest) ||
      !/^sha256:[0-9a-f]{64}$/.test(grant.actionDigest)
    )
      throw new TypeError("Invalid Action Grant");
    const prior = this.grants.get(grant.grantId);
    if (prior) {
      if (
        controlDigest("grant", prior as unknown as ControlJson) !==
        controlDigest("grant", grant as unknown as ControlJson)
      )
        throw new Error("state_conflict");
      return prior;
    }
    const key = idempotencyKey(grant.scopeDigest, grant.idempotencyKey);
    const previous = this.idempotency.get(key);
    if (previous) {
      if (previous.actionDigest !== grant.actionDigest)
        throw new Error("grant_idempotency_conflict");
      return this.grants.get(previous.grantId)!;
    }
    const retained = freezeGrant(grant);
    this.grants.set(retained.grantId, retained);
    this.idempotency.set(
      key,
      Object.freeze({
        schemaVersion: 1,
        scopeDigest: retained.scopeDigest,
        idempotencyKey: retained.idempotencyKey,
        actionDigest: retained.actionDigest,
        grantId: retained.grantId,
        retainedOutcome: retained.status,
      }),
    );
    return retained;
  }
  snapshot(): ActionGrantLedgerSnapshot {
    return Object.freeze({
      schemaVersion: 1,
      highWaterLogicalMs: this.highWater,
      grants: Object.freeze(
        [...this.grants.values()].map((grant) => freezeGrant(grant)),
      ),
    });
  }
  restore(snapshot: ActionGrantLedgerSnapshot): void {
    if (
      !snapshot ||
      !isPlainRecord(snapshot) ||
      snapshot.schemaVersion !== 1 ||
      !isPlainArray(snapshot.grants) ||
      !Number.isSafeInteger(snapshot.highWaterLogicalMs) ||
      snapshot.highWaterLogicalMs < 0 ||
      snapshot.highWaterLogicalMs < this.highWater
    )
      throw new TypeError("Invalid Action Grant snapshot");
    const grants = new Map<string, ActionGrant>();
    const idempotency = new Map<string, ActionIdempotencyRecord>();
    for (const source of snapshot.grants) {
      assertGrantSnapshot(source, snapshot.highWaterLogicalMs);
      const grant =
        source.status === "reserved"
          ? {
              ...source,
              status: "indeterminate" as const,
              stateGeneration: source.stateGeneration + 1,
            }
          : source;
      const frozen = freezeGrant(grant);
      if (grants.has(frozen.grantId)) throw new Error("state_conflict");
      const key = idempotencyKey(frozen.scopeDigest, frozen.idempotencyKey);
      const previous = idempotency.get(key);
      if (previous && previous.actionDigest !== frozen.actionDigest)
        throw new Error("grant_idempotency_conflict");
      if (previous) throw new Error("state_conflict");
      grants.set(frozen.grantId, frozen);
      idempotency.set(
        key,
        Object.freeze({
          schemaVersion: 1,
          scopeDigest: grant.scopeDigest,
          idempotencyKey: grant.idempotencyKey,
          actionDigest: grant.actionDigest,
          grantId: grant.grantId,
          retainedOutcome: grant.status,
        }),
      );
    }
    this.grants.clear();
    this.idempotency.clear();
    for (const [id, grant] of grants) this.grants.set(id, grant);
    for (const [key, record] of idempotency) this.idempotency.set(key, record);
    this.highWater = snapshot.highWaterLogicalMs;
  }
  get(grantId: string): ActionGrant | undefined {
    return this.grants.get(grantId);
  }
  observeLogicalTime(logicalTimeMs: number): void {
    this.time(logicalTimeMs);
  }
  loadGrant(grantId: string): ActionGrant | undefined {
    return this.grants.get(grantId);
  }
  loadIdempotency(
    scope: string,
    key: string,
  ): ActionIdempotencyRecord | undefined {
    return this.idempotency.get(idempotencyKey(scope, key));
  }
  createGrant(input: {
    readonly grant: ActionGrant;
    readonly idempotency: ActionIdempotencyRecord;
  }): ActionGrantRepositoryCreateResultV1 {
    assertRepositoryPair(input.grant, input.idempotency);
    const prior = this.grants.get(input.grant.grantId);
    if (prior) {
      const same = grantStateDigest(prior) === grantStateDigest(input.grant);
      return Object.freeze({
        status: same ? "existing" : "conflict",
        conflictKind: same ? null : "grant",
        grant: prior,
      });
    }
    const key = idempotencyKey(
      input.idempotency.scopeDigest,
      input.idempotency.idempotencyKey,
    );
    const previous = this.idempotency.get(key);
    if (previous) {
      const found = this.grants.get(previous.grantId) ?? null;
      const same =
        previous.actionDigest === input.idempotency.actionDigest &&
        found !== null;
      return Object.freeze({
        status: same ? "existing" : "conflict",
        conflictKind: same ? null : "idempotency",
        grant: found,
      });
    }
    const grant = freezeGrant(input.grant);
    const record = freezeIdempotency(input.idempotency);
    this.grants.set(grant.grantId, grant);
    this.idempotency.set(key, record);
    return Object.freeze({
      status: "created",
      conflictKind: null,
      grant,
    });
  }
  compareAndSwapGrant(input: {
    readonly grantId: string;
    readonly expectedStateGeneration: number;
    readonly expectedGrantDigest: string;
    readonly nextGrant: ActionGrant;
    readonly nextIdempotency: ActionIdempotencyRecord;
  }): ActionGrantRepositoryCasResultV1 {
    const current = this.grants.get(input.grantId);
    if (
      !current ||
      current.stateGeneration !== input.expectedStateGeneration ||
      grantStateDigest(current) !== input.expectedGrantDigest
    )
      return Object.freeze({ status: "conflict", grant: current ?? null });
    if (
      input.nextGrant.grantId !== input.grantId ||
      input.nextGrant.scopeDigest !== current.scopeDigest ||
      input.nextGrant.idempotencyKey !== current.idempotencyKey
    )
      throw new Error("state_conflict");
    assertRepositoryPair(input.nextGrant, input.nextIdempotency);
    const grant = freezeGrant(input.nextGrant);
    this.grants.set(grant.grantId, grant);
    this.idempotency.set(
      idempotencyKey(grant.scopeDigest, grant.idempotencyKey),
      freezeIdempotency(input.nextIdempotency),
    );
    return Object.freeze({ status: "updated", grant });
  }
  private time(value: number): void {
    assertTime(value);
    if (value < this.highWater) throw new Error("logical_time_rollback");
    this.highWater = value;
  }
}

export interface ActionGrantLedgerSnapshot {
  readonly schemaVersion: 1;
  readonly highWaterLogicalMs: number;
  readonly grants: readonly ActionGrant[];
}

/** Issues through the same exact-create port used by durable repositories. */
export async function issueActionGrantV1(
  repository: ActionGrantRepository,
  source: ActionGrant,
): Promise<ActionGrant> {
  assertIssuableGrant(source);
  await repository.observeLogicalTime(source.issuedAtLogicalMs);
  const grant = freezeGrant(source);
  const idempotency = idempotencyForGrant(grant);
  const result = await repository.createGrant({ grant, idempotency });
  if (result.status === "conflict")
    throw new Error(
      result.conflictKind === "idempotency"
        ? "grant_idempotency_conflict"
        : "state_conflict",
    );
  if (!result.grant) throw new Error("repository_unavailable");
  assertGrantSnapshot(result.grant, Number.MAX_SAFE_INTEGER);
  if (result.status === "created") {
    if (grantStateDigest(result.grant) !== grantStateDigest(grant))
      throw new Error("state_conflict");
  } else if (
    result.grant.scopeDigest !== grant.scopeDigest ||
    result.grant.idempotencyKey !== grant.idempotencyKey ||
    result.grant.actionDigest !== grant.actionDigest
  ) {
    throw new Error("state_conflict");
  }
  return result.grant;
}

/** Resolves an indeterminate grant only from an explicit authoritative proof. */
export async function reconcileActionGrantV1(
  repository: ActionGrantRepository,
  input: {
    readonly grantId: string;
    readonly reservationId: string;
    readonly dispatchAttemptId: string;
    readonly outcome: "dispatched" | "failed";
  },
): Promise<ActionGrant> {
  const grant = await repository.loadGrant(input.grantId);
  if (!grant) throw new Error("grant_missing");
  assertGrantSnapshot(grant, Number.MAX_SAFE_INTEGER);
  if (
    (grant.status === "dispatched" || grant.status === "failed") &&
    grant.status === input.outcome &&
    grant.reservation?.reservationId === input.reservationId &&
    grant.reservation.dispatchAttemptId === input.dispatchAttemptId
  )
    return grant;
  if (
    grant.status !== "indeterminate" ||
    grant.reservation?.reservationId !== input.reservationId ||
    grant.reservation.dispatchAttemptId !== input.dispatchAttemptId
  )
    throw new Error("state_conflict");
  const next = freezeGrant({
    ...grant,
    stateGeneration: grant.stateGeneration + 1,
    status: input.outcome,
  });
  if (!(await compareAndSwapGrantState(repository, grant, next)))
    throw new Error("state_conflict");
  return next;
}

/** Gateway-only semantic mutation helpers; intentionally not exported. */
async function reserveGrantForGateway(
  repository: ActionGrantRepository,
  grantId: string,
  gatewayId: string,
  time: number,
  authority: AuthorityResult,
): Promise<ActionGrant> {
  await repository.observeLogicalTime(time);
  const grant = await repository.loadGrant(grantId);
  if (!grant) throw new Error("grant_missing");
  assertGrantSnapshot(grant, Number.MAX_SAFE_INTEGER);
  if (grant.status !== "issued") throw new Error("grant_consumed");
  if (time >= grant.expiresAtLogicalMs) {
    const expired = freezeGrant({
      ...grant,
      stateGeneration: grant.stateGeneration + 1,
      status: "expired",
    });
    const written = await compareAndSwapGrantState(repository, grant, expired);
    if (!written) throw new Error("state_conflict");
    throw new Error("grant_expired");
  }
  assertCurrentAuthority(grant.scope, grant.scopeDigest, authority);
  const reservation = Object.freeze({
    schemaVersion: 1 as const,
    reservationId: `${grantId}:reservation:${grant.stateGeneration + 1}`,
    dispatchAttemptId: `${grantId}:dispatch:${grant.stateGeneration + 1}`,
    reservedByGatewayId: gatewayId,
    reservedStateGeneration: grant.stateGeneration + 1,
    authorityGeneration: authorityGenerationFor(grant.scope, authority),
    fencingToken: fencingTokenFor(grant.scope, authority),
    reservedAtLogicalMs: time,
  });
  const next = freezeGrant({
    ...grant,
    stateGeneration: grant.stateGeneration + 1,
    status: "reserved",
    reservation,
  });
  if (!(await compareAndSwapGrantState(repository, grant, next)))
    throw new Error("grant_consumed");
  return next;
}
async function settleGrantForGateway(
  repository: ActionGrantRepository,
  grantId: string,
  reservationId: string,
  dispatchAttemptId: string,
  status: Extract<GrantStatus, "dispatched" | "failed" | "indeterminate">,
): Promise<ActionGrant> {
  const grant = await repository.loadGrant(grantId);
  if (!grant) throw new Error("grant_missing");
  assertGrantSnapshot(grant, Number.MAX_SAFE_INTEGER);
  if (
    grant.status === status &&
    grant.reservation?.reservationId === reservationId &&
    grant.reservation.dispatchAttemptId === dispatchAttemptId
  )
    return grant;
  if (
    grant.status !== "reserved" ||
    grant.reservation?.reservationId !== reservationId ||
    grant.reservation.dispatchAttemptId !== dispatchAttemptId
  )
    throw new Error("state_conflict");
  const next = freezeGrant({
    ...grant,
    stateGeneration: grant.stateGeneration + 1,
    status,
  });
  if (!(await compareAndSwapGrantState(repository, grant, next))) {
    const current = await repository.loadGrant(grantId);
    if (
      current?.status === status &&
      current.reservation?.reservationId === reservationId &&
      current.reservation.dispatchAttemptId === dispatchAttemptId
    )
      return current;
    throw new Error("state_conflict");
  }
  return next;
}

async function compareAndSwapGrantState(
  repository: ActionGrantRepository,
  current: ActionGrant,
  next: ActionGrant,
): Promise<boolean> {
  const result = await repository.compareAndSwapGrant({
    grantId: current.grantId,
    expectedStateGeneration: current.stateGeneration,
    expectedGrantDigest: grantStateDigest(current),
    nextGrant: next,
    nextIdempotency: idempotencyForGrant(next),
  });
  return (
    result.status === "updated" &&
    result.grant !== null &&
    grantStateDigest(result.grant) === grantStateDigest(next)
  );
}

function assertGrantSnapshot(grant: ActionGrant, highWater: number): void {
  if (
    !isPlainRecord(grant) ||
    !hasExactKeys(grant, [
      "schemaVersion",
      "grantId",
      "stateGeneration",
      "scope",
      "scopeDigest",
      "namespace",
      "toolId",
      "operation",
      "actionBindingId",
      "actionBindingVersion",
      "handlerDigest",
      "inputDigest",
      "actionDigest",
      "assessmentRequestId",
      "assessmentId",
      "assessmentTargetDigest",
      "idempotencyKey",
      "issuedAtLogicalMs",
      "expiresAtLogicalMs",
      "singleUse",
      "status",
      "reservation",
    ]) ||
    grant.schemaVersion !== 1 ||
    !nonEmptyString(grant.grantId) ||
    !positiveInteger(grant.stateGeneration) ||
    !isActionScopeV1(grant.scope) ||
    scopeDigest(grant.scope) !== grant.scopeDigest ||
    !isDigest(grant.inputDigest) ||
    !isDigest(grant.actionDigest) ||
    !isDigest(grant.handlerDigest) ||
    !Number.isSafeInteger(grant.issuedAtLogicalMs) ||
    grant.issuedAtLogicalMs < 0 ||
    grant.issuedAtLogicalMs > highWater ||
    !Number.isSafeInteger(grant.expiresAtLogicalMs) ||
    grant.expiresAtLogicalMs <= grant.issuedAtLogicalMs ||
    grant.expiresAtLogicalMs - grant.issuedAtLogicalMs > 120_000 ||
    !grant.singleUse ||
    !isGrantStatus(grant.status) ||
    !nonEmptyString(grant.idempotencyKey) ||
    !nonEmptyString(grant.scopeDigest)
  )
    throw new TypeError("Invalid Action Grant snapshot");
  if (grant.status === "issued" || grant.status === "expired") {
    if (grant.reservation !== null)
      throw new TypeError("Invalid Action Grant snapshot");
  } else if (!isActionReservation(grant.reservation, highWater, grant)) {
    throw new TypeError("Invalid Action Grant snapshot");
  }
}

function isActionReservation(
  value: ActionReservation | null,
  highWater: number,
  grant: ActionGrant,
): value is ActionReservation {
  return Boolean(
    value &&
    isPlainRecord(value) &&
    hasExactKeys(value, [
      "schemaVersion",
      "reservationId",
      "dispatchAttemptId",
      "reservedByGatewayId",
      "reservedStateGeneration",
      "authorityGeneration",
      "fencingToken",
      "reservedAtLogicalMs",
    ]) &&
    value.schemaVersion === 1 &&
    nonEmptyString(value.reservationId) &&
    nonEmptyString(value.dispatchAttemptId) &&
    nonEmptyString(value.reservedByGatewayId) &&
    positiveInteger(value.reservedStateGeneration) &&
    value.reservedStateGeneration <= grant.stateGeneration &&
    Number.isSafeInteger(value.reservedAtLogicalMs) &&
    value.reservedAtLogicalMs >= grant.issuedAtLogicalMs &&
    value.reservedAtLogicalMs <= highWater &&
    (value.authorityGeneration === null ||
      (Number.isSafeInteger(value.authorityGeneration) &&
        value.authorityGeneration >= 0)) &&
    (value.fencingToken === null || nonEmptyString(value.fencingToken)),
  );
}

function assertIssuableGrant(grant: ActionGrant): void {
  assertGrantSnapshot(grant, grant.issuedAtLogicalMs);
  if (grant.status !== "issued" || grant.reservation !== null)
    throw new TypeError("Invalid Action Grant");
}

function grantStateDigest(grant: ActionGrant): string {
  return controlDigest("grant", grant as unknown as ControlJson);
}

function idempotencyForGrant(grant: ActionGrant): ActionIdempotencyRecord {
  return Object.freeze({
    schemaVersion: 1,
    scopeDigest: grant.scopeDigest,
    idempotencyKey: grant.idempotencyKey,
    actionDigest: grant.actionDigest,
    grantId: grant.grantId,
    retainedOutcome: grant.status,
  });
}

function freezeIdempotency(
  value: ActionIdempotencyRecord,
): ActionIdempotencyRecord {
  return Object.freeze({ ...value });
}

function assertRepositoryPair(
  grant: ActionGrant,
  record: ActionIdempotencyRecord,
): void {
  assertGrantSnapshot(grant, Number.MAX_SAFE_INTEGER);
  if (
    !isPlainRecord(record) ||
    !hasExactKeys(record, [
      "schemaVersion",
      "scopeDigest",
      "idempotencyKey",
      "actionDigest",
      "grantId",
      "retainedOutcome",
    ]) ||
    record.schemaVersion !== 1 ||
    record.scopeDigest !== grant.scopeDigest ||
    record.idempotencyKey !== grant.idempotencyKey ||
    record.actionDigest !== grant.actionDigest ||
    record.grantId !== grant.grantId ||
    record.retainedOutcome !== grant.status
  )
    throw new TypeError("Invalid Action Grant repository record");
}

function assertCurrentAuthority(
  scope: ActionScope,
  expectedScopeDigest: string,
  authority: AuthorityResult,
): void {
  if (
    authority.status !== "current" ||
    !isActionScopeV1(authority.scope) ||
    scopeDigest(authority.scope) !== expectedScopeDigest
  )
    throw new Error("grant_scope_mismatch");
  if (
    scope.kind === "coordinated" &&
    (authority.authorityGeneration !== scope.authorityGeneration ||
      authority.fencingToken !== scope.fencingToken)
  )
    throw new Error("grant_fence_stale");
  if (
    scope.kind === "standalone" &&
    ((authority.authorityGeneration != null) !==
      (authority.fencingToken != null) ||
      (authority.authorityGeneration != null &&
        (!Number.isSafeInteger(authority.authorityGeneration) ||
          authority.authorityGeneration < 0)) ||
      (authority.fencingToken != null &&
        !nonEmptyString(authority.fencingToken)))
  )
    throw new Error("grant_fence_stale");
}

export function normalizeAuthorityResultV1(
  resolver: Pick<ActionAuthorityResolver, "resolverId" | "resolverVersion">,
  scope: ActionScope,
  actionDigestValue: string,
  value: unknown,
): AuthorityResult {
  if (!isPlainRecord(value) || value.schemaVersion !== 1)
    throw new Error("authority_result_invalid");
  const expectedScopeDigest = scopeDigest(scope);
  const common =
    value.resolverId === resolver.resolverId &&
    value.resolverVersion === resolver.resolverVersion &&
    value.scopeDigest === expectedScopeDigest &&
    value.actionDigest === actionDigestValue &&
    isDigest(value.scopeDigest) &&
    isDigest(value.actionDigest);
  if (!common) throw new Error("authority_result_invalid");
  if (value.status === "stale" || value.status === "unavailable") {
    if (
      !hasExactKeys(value, [
        "schemaVersion",
        "status",
        "resolverId",
        "resolverVersion",
        "scopeDigest",
        "actionDigest",
      ])
    )
      throw new Error("authority_result_invalid");
    return Object.freeze({ ...value }) as AuthorityResult;
  }
  if (
    value.status !== "current" ||
    !hasExactKeys(value, [
      "schemaVersion",
      "status",
      "resolverId",
      "resolverVersion",
      "scopeDigest",
      "actionDigest",
      "scope",
      "authorityGeneration",
      "fencingToken",
    ]) ||
    !isActionScopeV1(value.scope) ||
    scopeDigest(value.scope) !== expectedScopeDigest ||
    (value.authorityGeneration !== null &&
      (typeof value.authorityGeneration !== "number" ||
        !Number.isSafeInteger(value.authorityGeneration) ||
        value.authorityGeneration < 0)) ||
    (value.fencingToken !== null && !nonEmptyString(value.fencingToken))
  )
    throw new Error("authority_result_invalid");
  return Object.freeze({
    ...value,
    scope: freezeScope(value.scope),
  }) as AuthorityResult;
}

function authorityGenerationFor(
  scope: ActionScope,
  authority: AuthorityResult,
): number | null {
  if (authority.status !== "current") return null;
  return scope.kind === "coordinated"
    ? scope.authorityGeneration
    : (authority.authorityGeneration ?? null);
}
function fencingTokenFor(
  scope: ActionScope,
  authority: AuthorityResult,
): string | null {
  if (authority.status !== "current") return null;
  return scope.kind === "coordinated"
    ? scope.fencingToken
    : (authority.fencingToken ?? null);
}
function authorityMatchesReservation(
  scope: ActionScope,
  expectedScopeDigest: string,
  authority: AuthorityResult,
  reservation: ActionReservation,
): boolean {
  try {
    assertCurrentAuthority(scope, expectedScopeDigest, authority);
    return (
      authorityGenerationFor(scope, authority) ===
        reservation.authorityGeneration &&
      fencingTokenFor(scope, authority) === reservation.fencingToken
    );
  } catch {
    return false;
  }
}

function freezeScope(scope: ActionScope): ActionScope {
  if (scope.kind === "standalone")
    return Object.freeze({
      schemaVersion: scope.schemaVersion,
      kind: scope.kind,
      tenantId: scope.tenantId,
      runId: scope.runId,
      agentId: scope.agentId,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      policyId: scope.policyId,
      policyVersion: scope.policyVersion,
    });
  return Object.freeze({ ...scope });
}
function freezeBinding(binding: ActionBinding): ActionBinding {
  return Object.freeze({ ...binding });
}
export function boundedCanonicalControlJsonV1(
  value: unknown,
  maximumBytes: number,
  reasonCode: "action_not_permitted" | "message_not_permitted",
): string {
  try {
    if (
      !Number.isSafeInteger(maximumBytes) ||
      maximumBytes < 1 ||
      maximumBytes > MAX_ACTION_INPUT_BYTES_V1
    )
      throw new TypeError("Invalid canonical JSON byte limit");
    let nodes = 0;
    let canonicalBytes = 0;
    const addCanonicalBytes = (bytes: number): void => {
      canonicalBytes += bytes;
      if (canonicalBytes > maximumBytes)
        throw new TypeError("Canonical JSON exceeds its byte limit");
    };
    const active = new Set<object>();
    const stack: Array<
      | {
          readonly kind: "enter";
          readonly value: unknown;
          readonly depth: number;
        }
      | { readonly kind: "exit"; readonly value: object }
    > = [{ kind: "enter", value, depth: 0 }];
    while (stack.length) {
      const item = stack.pop()!;
      if (item.kind === "exit") {
        active.delete(item.value);
        continue;
      }
      nodes += 1;
      if (nodes > MAX_CONTROL_JSON_NODES_V1)
        throw new TypeError("Canonical JSON contains too many nodes");
      if (item.depth > MAX_CONTROL_JSON_DEPTH_V1)
        throw new TypeError("Canonical JSON is too deeply nested");
      if (item.value === null) {
        addCanonicalBytes(4);
        continue;
      }
      const valueType = typeof item.value;
      if (valueType === "string") {
        if ((item.value as string).length > maximumBytes)
          throw new TypeError("Canonical JSON exceeds its byte limit");
        addCanonicalBytes(utf8ByteLength(JSON.stringify(item.value as string)));
        continue;
      }
      if (valueType === "boolean") {
        addCanonicalBytes(item.value ? 4 : 5);
        continue;
      }
      if (valueType === "number") {
        if (!Number.isFinite(item.value))
          throw new TypeError("Canonical JSON requires finite numbers");
        addCanonicalBytes(
          Object.is(item.value, -0)
            ? 1
            : utf8ByteLength(JSON.stringify(item.value)),
        );
        continue;
      }
      if (valueType !== "object")
        throw new TypeError("Canonical JSON contains a non-JSON value");
      const objectValue = item.value as object;
      if (active.has(objectValue))
        throw new TypeError("Canonical JSON cannot contain cycles");
      active.add(objectValue);
      stack.push({ kind: "exit", value: objectValue });
      const keys = Reflect.ownKeys(objectValue);
      if (keys.some((key) => typeof key === "symbol"))
        throw new TypeError("Canonical JSON cannot contain symbol keys");
      if (Array.isArray(objectValue)) {
        if (Object.getPrototypeOf(objectValue) !== Array.prototype)
          throw new TypeError("Canonical JSON requires plain arrays");
        if (keys.length !== objectValue.length + 1 || !keys.includes("length"))
          throw new TypeError("Canonical JSON arrays cannot have extra keys");
        addCanonicalBytes(2 + Math.max(0, objectValue.length - 1));
        for (let index = objectValue.length - 1; index >= 0; index -= 1) {
          const descriptor = Object.getOwnPropertyDescriptor(
            objectValue,
            String(index),
          );
          if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
            throw new TypeError(
              "Canonical JSON cannot contain sparse arrays or accessors",
            );
          stack.push({
            kind: "enter",
            value: descriptor.value,
            depth: item.depth + 1,
          });
        }
        continue;
      }
      const prototype = Object.getPrototypeOf(objectValue);
      if (prototype !== Object.prototype && prototype !== null)
        throw new TypeError("Canonical JSON requires plain objects");
      addCanonicalBytes(2 + Math.max(0, keys.length - 1));
      for (let index = keys.length - 1; index >= 0; index -= 1) {
        const key = keys[index] as string;
        if (key.length > maximumBytes)
          throw new TypeError("Canonical JSON exceeds its byte limit");
        addCanonicalBytes(utf8ByteLength(JSON.stringify(key)) + 1);
        const descriptor = Object.getOwnPropertyDescriptor(objectValue, key);
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
          throw new TypeError(
            "Canonical JSON cannot contain accessors or hidden properties",
          );
        stack.push({
          kind: "enter",
          value: descriptor.value,
          depth: item.depth + 1,
        });
      }
    }
    const canonical = canonicalizeControlJsonV1(value as never);
    if (utf8ByteLength(canonical) > maximumBytes)
      throw new TypeError("Canonical JSON exceeds its byte limit");
    return canonical;
  } catch {
    throw new Error(reasonCode);
  }
}
function freezeControlJsonObject(
  value: ControlJsonObject,
  maximumBytes: number,
): ControlJsonObject {
  return deepFreeze(
    JSON.parse(
      boundedCanonicalControlJsonV1(
        value,
        maximumBytes,
        "action_not_permitted",
      ),
    ) as ControlJsonObject,
  );
}
function freezeToolContext(
  value: ToolInvocationContext,
): ToolInvocationContext {
  return deepFreeze(JSON.parse(JSON.stringify(value)) as ToolInvocationContext);
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
  }
  return value;
}
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.values(Object.getOwnPropertyDescriptors(value)).every(
      (descriptor) => "value" in descriptor,
    )
  );
}
function isPlainArray(value: unknown): value is readonly unknown[] {
  return (
    Array.isArray(value) &&
    Object.getPrototypeOf(value) === Array.prototype &&
    Object.values(Object.getOwnPropertyDescriptors(value)).every(
      (descriptor) => "value" in descriptor,
    )
  );
}
function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}
function isGrantStatus(value: unknown): value is GrantStatus {
  return (
    value === "issued" ||
    value === "reserved" ||
    value === "dispatched" ||
    value === "failed" ||
    value === "indeterminate" ||
    value === "expired"
  );
}
export function isActionScopeV1(value: unknown): value is ActionScope {
  if (!isPlainRecord(value) || value.schemaVersion !== 1) return false;
  const common =
    nonEmptyString(value.tenantId) &&
    nonEmptyString(value.runId) &&
    nonEmptyString(value.agentId) &&
    nonEmptyString(value.policyId) &&
    positiveInteger(value.policyVersion);
  if (!common) return false;
  if (value.kind === "standalone")
    return (
      hasExactKeys(value, [
        "schemaVersion",
        "kind",
        "tenantId",
        "runId",
        "agentId",
        "organizationId",
        "workspaceId",
        "policyId",
        "policyVersion",
      ]) &&
      (typeof value.organizationId === "string" ||
        value.organizationId === null) &&
      (typeof value.workspaceId === "string" || value.workspaceId === null)
    );
  return (
    value.kind === "coordinated" &&
    hasExactKeys(value, [
      "schemaVersion",
      "kind",
      "tenantId",
      "runId",
      "agentId",
      "policyId",
      "policyVersion",
      "meshId",
      "objectiveId",
      "objectiveRevision",
      "workItemId",
      "workItemRevision",
      "peerId",
      "instanceId",
      "assignmentAuthorityId",
      "assignmentEpoch",
      "fencingToken",
      "leaseExpiresAtLogicalMs",
      "authorityGeneration",
      "objectiveTerminal",
      "workTerminal",
    ]) &&
    [
      value.meshId,
      value.objectiveId,
      value.workItemId,
      value.peerId,
      value.instanceId,
      value.assignmentAuthorityId,
      value.fencingToken,
    ].every(nonEmptyString) &&
    [
      value.objectiveRevision,
      value.workItemRevision,
      value.assignmentEpoch,
      value.leaseExpiresAtLogicalMs,
      value.authorityGeneration,
    ].every(
      (item) =>
        typeof item === "number" && Number.isSafeInteger(item) && item >= 0,
    ) &&
    typeof value.objectiveTerminal === "boolean" &&
    typeof value.workTerminal === "boolean"
  );
}
function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.getOwnPropertyNames(value).sort();
  const sorted = [...expected].sort();
  return (
    Object.getOwnPropertySymbols(value).length === 0 &&
    actual.length === sorted.length &&
    actual.every((key, index) => key === sorted[index])
  );
}

export class ActionGateway {
  readonly binding: ActionBinding;
  readonly dispatcher: ActionDispatcher;
  readonly contextResolver: ActionInvocationContextResolver;
  readonly authorityResolver: ActionAuthorityResolver;
  readonly assessmentResolver: ActionAssessmentResolver;
  readonly maxActionInputBytes: number;
  constructor(
    readonly ledger: ActionGrantRepository,
    binding: ActionBinding,
    dispatcher: ActionDispatcher,
    contextResolver: ActionInvocationContextResolver,
    authorityResolver: ActionAuthorityResolver,
    assessmentResolver: ActionAssessmentResolver,
    limits: ActionGatewayLimitsV1 = {},
  ) {
    if (
      !nonEmptyString(authorityResolver.resolverId) ||
      !positiveInteger(authorityResolver.resolverVersion)
    )
      throw new Error("dependency_rebind_failed");
    const maxActionInputBytes =
      limits.maxActionInputBytes ?? MAX_ACTION_INPUT_BYTES_V1;
    if (
      !Number.isSafeInteger(maxActionInputBytes) ||
      maxActionInputBytes < 1 ||
      maxActionInputBytes > MAX_ACTION_INPUT_BYTES_V1
    )
      throw new Error("dependency_rebind_failed");
    this.maxActionInputBytes = maxActionInputBytes;
    this.binding = freezeBinding(binding);
    this.dispatcher = Object.freeze({
      dispatcherId: dispatcher.dispatcherId,
      dispatcherVersion: dispatcher.dispatcherVersion,
      fencingMode: dispatcher.fencingMode,
      dispatch: dispatcher.dispatch.bind(dispatcher),
    });
    this.contextResolver = Object.freeze({
      contextResolverId: contextResolver.contextResolverId,
      contextResolverVersion: contextResolver.contextResolverVersion,
      resolve: contextResolver.resolve.bind(contextResolver),
    });
    this.authorityResolver = Object.freeze({
      resolverId: authorityResolver.resolverId,
      resolverVersion: authorityResolver.resolverVersion,
      resolve: authorityResolver.resolve.bind(authorityResolver),
    });
    this.assessmentResolver = Object.freeze({
      assessorId: assessmentResolver.assessorId,
      assessorVersion: assessmentResolver.assessorVersion,
      consumeCurrent:
        assessmentResolver.consumeCurrent.bind(assessmentResolver),
    });
  }
  async invoke(input: {
    readonly schemaVersion: 1;
    readonly grantId: string;
    readonly input?: ControlJsonObject;
    readonly logicalTimeMs: number;
  }): Promise<ToolInvocationResult> {
    if (
      !isPlainRecord(input) ||
      !hasExactKeys(
        input,
        Object.hasOwn(input, "input")
          ? ["schemaVersion", "grantId", "input", "logicalTimeMs"]
          : ["schemaVersion", "grantId", "logicalTimeMs"],
      ) ||
      input.schemaVersion !== 1 ||
      !nonEmptyString(input.grantId)
    )
      throw new Error("action_not_permitted");
    const value = freezeControlJsonObject(
      input.input ?? {},
      this.maxActionInputBytes,
    );
    const digest = actionInputDigest(value);
    const grant = await this.ledger.loadGrant(input.grantId);
    if (!grant) throw new Error("grant_missing");
    assertGrantSnapshot(grant, Number.MAX_SAFE_INTEGER);
    if (
      grant.actionBindingId !== this.binding.actionBindingId ||
      grant.actionBindingVersion !== this.binding.actionBindingVersion ||
      grant.namespace !== this.binding.namespace ||
      grant.toolId !== this.binding.toolId ||
      grant.operation !== this.binding.operation ||
      grant.handlerDigest !== this.binding.handlerDigest ||
      this.binding.dispatcherId !== this.dispatcher.dispatcherId ||
      this.binding.dispatcherVersion !== this.dispatcher.dispatcherVersion ||
      this.binding.contextResolverId !==
        this.contextResolver.contextResolverId ||
      this.binding.contextResolverVersion !==
        this.contextResolver.contextResolverVersion ||
      this.binding.fencingMode !== this.dispatcher.fencingMode ||
      grant.inputDigest !== digest ||
      grant.actionDigest !== actionDigest(grant, this.binding)
    )
      throw new Error("grant_action_mismatch");
    if (
      grant.scope.kind === "coordinated" &&
      (this.binding.fencingMode !== "downstream_atomic" ||
        this.dispatcher.fencingMode !== "downstream_atomic")
    )
      throw new Error("dependency_rebind_failed");
    if (
      !(await this.assessmentResolver.consumeCurrent(
        grant,
        input.logicalTimeMs,
      ))
    )
      throw new Error("grant_assessment_mismatch");
    const first = normalizeAuthorityResultV1(
      this.authorityResolver,
      grant.scope,
      grant.actionDigest,
      await this.authorityResolver.resolve(
        grant.scope,
        grant.actionDigest,
        input.logicalTimeMs,
      ),
    );
    const reserved = await reserveGrantForGateway(
      this.ledger,
      grant.grantId,
      this.ledger.gatewayId,
      input.logicalTimeMs,
      first,
    );
    const reservation = reserved.reservation!;
    try {
      const context = freezeToolContext(
        await this.contextResolver.resolve(reserved.scope, this.binding),
      );
      if (
        context.tenant.tenantId !== reserved.scope.tenantId ||
        context.toolId !== this.binding.toolId ||
        context.runId !== reserved.scope.runId
      )
        throw new Error("invocation_context_mismatch");
      const latest = normalizeAuthorityResultV1(
        this.authorityResolver,
        reserved.scope,
        reserved.actionDigest,
        await this.authorityResolver.resolve(
          reserved.scope,
          reserved.actionDigest,
          input.logicalTimeMs,
        ),
      );
      if (
        !authorityMatchesReservation(
          reserved.scope,
          reserved.scopeDigest,
          latest,
          reservation,
        )
      ) {
        await settleGrantForGateway(
          this.ledger,
          reserved.grantId,
          reservation.reservationId,
          reservation.dispatchAttemptId,
          "failed",
        );
        throw new Error("grant_fence_stale");
      }
      let assessmentStillCurrent = false;
      try {
        assessmentStillCurrent = await this.assessmentResolver.consumeCurrent(
          grant,
          input.logicalTimeMs,
        );
      } catch {
        assessmentStillCurrent = false;
      }
      if (!assessmentStillCurrent) {
        await settleGrantForGateway(
          this.ledger,
          reserved.grantId,
          reservation.reservationId,
          reservation.dispatchAttemptId,
          "failed",
        );
        throw new Error("grant_assessment_mismatch");
      }
      const permit = Object.freeze({
        schemaVersion: 1 as const,
        grantId: reserved.grantId,
        reservationId: reservation.reservationId,
        dispatchAttemptId: reservation.dispatchAttemptId,
        gatewayId: this.ledger.gatewayId,
        scopeDigest: reserved.scopeDigest,
        actionDigest: reserved.actionDigest,
        idempotencyKey: reserved.idempotencyKey,
        authorityGeneration: reservation.authorityGeneration,
        fencingToken: reservation.fencingToken,
      });
      const result = await this.dispatcher.dispatch({
        binding: this.binding,
        input: value,
        context,
        permit,
      });
      await settleGrantForGateway(
        this.ledger,
        reserved.grantId,
        reservation.reservationId,
        reservation.dispatchAttemptId,
        result.ok ? "dispatched" : "failed",
      );
      return result;
    } catch (error) {
      const current = await this.ledger.loadGrant(reserved.grantId);
      if (current?.status === "reserved")
        await settleGrantForGateway(
          this.ledger,
          reserved.grantId,
          reservation.reservationId,
          reservation.dispatchAttemptId,
          "indeterminate",
        );
      throw error;
    }
  }
}

export async function freezeToolRegistryBinding(
  registry: ToolRegistry,
  toolId: string,
  binding: Omit<ActionBinding, "handlerDigest">,
): Promise<{ readonly binding: ActionBinding; readonly handler: ToolHandler }> {
  const found = await registry.get(toolId);
  if (!found) throw new Error("action_not_permitted");
  const handlerDigest = controlDigest("handler-binding", {
    definition: found.definition as unknown as ControlJson,
    binding: { ...binding, toolId } as unknown as ControlJson,
  });
  return Object.freeze({
    binding: Object.freeze({ ...binding, toolId, handlerDigest }),
    handler: found.handler,
  });
}
