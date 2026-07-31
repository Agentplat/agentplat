import {
  boundedCanonicalControlJsonV1,
  controlDigest,
  isActionScopeV1,
  normalizeAuthorityResultV1,
  scopeDigest,
  type ActionScope,
  type AuthorityResult,
  type ActionAuthorityResolver,
  type ControlJson,
  type ControlJsonObject,
} from './tools.js';

export const MAX_OUTBOUND_MESSAGE_BYTES_V1 = 65_536;

export type MessageAttemptStatus =
  'prepared' | 'reserved' | 'sent' | 'failed' | 'indeterminate' | 'expired';
export interface OutboundMessage {
  readonly schemaVersion: 1;
  readonly messageId: string;
  readonly runId: string;
  readonly tenantId: string;
  readonly channel: string;
  readonly recipient: string;
  readonly mediaType: 'text' | 'json';
  readonly content: string | ControlJson;
  readonly scope: ActionScope;
  readonly idempotencyKey: string;
  readonly messageDigest: string;
}
export interface MessageReservation {
  readonly schemaVersion: 1;
  readonly reservationId: string;
  readonly messageDispatchAttemptId: string;
  readonly reservedByGatewayId: string;
  readonly reservedStateGeneration: number;
  readonly authorityGeneration: number | null;
  readonly fencingToken: string | null;
  readonly reservedAtLogicalMs: number;
}
export interface OutboundMessageAttempt {
  readonly schemaVersion: 1;
  readonly messageAttemptId: string;
  readonly messageId: string;
  readonly assessmentRequestId: string;
  readonly assessmentId: string;
  readonly messageDigest: string;
  readonly scopeDigest: string;
  readonly idempotencyKey: string;
  readonly generation: number;
  readonly dispatcherId: string;
  readonly dispatcherVersion: number;
  readonly dispatcherDigest: string;
  readonly status: MessageAttemptStatus;
  readonly reservation: MessageReservation | null;
  readonly reservedAtLogicalMs: number | null;
  readonly expiresAtLogicalMs: number;
}
export interface MessageDispatchPermit {
  readonly schemaVersion: 1;
  readonly messageAttemptId: string;
  readonly reservationId: string;
  readonly messageDispatchAttemptId: string;
  readonly gatewayId: string;
  readonly scopeDigest: string;
  readonly messageDigest: string;
  readonly idempotencyKey: string;
  readonly authorityGeneration: number | null;
  readonly fencingToken: string | null;
}
export interface OutboundMessageDispatcher {
  readonly dispatcherId: string;
  readonly dispatcherVersion: number;
  readonly dispatcherDigest: string;
  readonly fencingMode: 'local_only' | 'downstream_atomic';
  send(input: {
    readonly message: OutboundMessage;
    readonly permit: MessageDispatchPermit;
  }): Promise<{ readonly ok: boolean }>;
}
export interface MessageAssessmentResolver {
  readonly assessorId: string;
  readonly assessorVersion: number;
  /** Exact replay is a currentness check; cancellation or revocation is false. */
  consumeCurrent(
    message: OutboundMessage,
    attempt: OutboundMessageAttempt,
    logicalTimeMs: number,
  ): Promise<boolean>;
}
export interface OutboundMessageGatewayLimitsV1 {
  readonly maxOutboundMessageBytes?: number;
}

export function outboundMessageDigest(
  message: Omit<OutboundMessage, 'messageDigest'>,
): string {
  return controlDigest('message', {
    schemaVersion: message.schemaVersion,
    messageId: message.messageId,
    runId: message.runId,
    tenantId: message.tenantId,
    channel: message.channel,
    recipient: message.recipient,
    mediaType: message.mediaType,
    content: message.content,
    scope: message.scope as unknown as ControlJson,
    idempotencyKey: message.idempotencyKey,
  });
}

function recordKey(scope: string, idempotency: string): string {
  return `${scope.length}:${scope}${idempotency.length}:${idempotency}`;
}
function freezeAttempt(value: OutboundMessageAttempt): OutboundMessageAttempt {
  return Object.freeze({
    ...value,
    reservation: value.reservation
      ? Object.freeze({ ...value.reservation })
      : null,
  });
}

const messageReserveCapability = Symbol('message-ledger-reserve-capability');
const messageOutcomeCapability = Symbol('message-ledger-outcome-capability');
const messageLookupCapability = Symbol('message-ledger-lookup-capability');
const messageAdvanceCapability = Symbol('message-ledger-advance-capability');

/** Local-only message-attempt store. A reserved snapshot is never replayable. */
export class LocalMessageAttemptLedger {
  private readonly attempts = new Map<string, OutboundMessageAttempt>();
  private readonly idempotency = new Map<string, OutboundMessageAttempt>();
  private highWater = 0;
  constructor(readonly gatewayId: string) {}
  prepare(attempt: OutboundMessageAttempt): OutboundMessageAttempt {
    if (
      attempt.schemaVersion !== 1 ||
      !Number.isSafeInteger(attempt.expiresAtLogicalMs) ||
      attempt.expiresAtLogicalMs < 0 ||
      attempt.status !== 'prepared' ||
      attempt.reservation !== null ||
      attempt.reservedAtLogicalMs !== null
    )
      throw new TypeError('Invalid message attempt');
    const sameId = this.attempts.get(attempt.messageAttemptId);
    if (sameId) {
      if (
        controlDigest('grant', sameId as unknown as ControlJson) !==
        controlDigest('grant', attempt as unknown as ControlJson)
      )
        throw new Error('state_conflict');
      return sameId;
    }
    const previous = this.idempotency.get(
      recordKey(attempt.scopeDigest, attempt.idempotencyKey),
    );
    if (previous) {
      if (previous.messageDigest !== attempt.messageDigest)
        throw new Error('message_idempotency_conflict');
      return previous;
    }
    const frozen = freezeAttempt(attempt);
    this.attempts.set(frozen.messageAttemptId, frozen);
    this.idempotency.set(
      recordKey(frozen.scopeDigest, frozen.idempotencyKey),
      frozen,
    );
    return frozen;
  }
  [messageReserveCapability](
    id: string,
    time: number,
    authority: AuthorityResult,
  ): OutboundMessageAttempt {
    this.time(time);
    const attempt = this.require(id);
    if (attempt.status !== 'prepared') throw new Error('message_consumed');
    if (time >= attempt.expiresAtLogicalMs)
      return this.replace({
        ...attempt,
        generation: attempt.generation + 1,
        status: 'expired',
      });
    assertCurrentMessageAuthority(attempt.scopeDigest, authority);
    const reservation = Object.freeze({
      schemaVersion: 1 as const,
      reservationId: `${id}:reservation:${attempt.generation + 1}`,
      messageDispatchAttemptId: `${id}:dispatch:${attempt.generation + 1}`,
      reservedByGatewayId: this.gatewayId,
      reservedStateGeneration: attempt.generation + 1,
      authorityGeneration: messageAuthorityGeneration(authority),
      fencingToken: messageFencingToken(authority),
      reservedAtLogicalMs: time,
    });
    return this.replace({
      ...attempt,
      generation: attempt.generation + 1,
      status: 'reserved',
      reservation,
      reservedAtLogicalMs: time,
    });
  }
  [messageOutcomeCapability](
    id: string,
    reservationId: string,
    dispatchId: string,
    status: Extract<MessageAttemptStatus, 'sent' | 'failed' | 'indeterminate'>,
  ): OutboundMessageAttempt {
    const attempt = this.require(id);
    if (
      attempt.status !== 'reserved' ||
      attempt.reservation?.reservationId !== reservationId ||
      attempt.reservation.messageDispatchAttemptId !== dispatchId
    )
      throw new Error('state_conflict');
    return this.replace({
      ...attempt,
      generation: attempt.generation + 1,
      status,
    });
  }
  [messageLookupCapability](
    messageId: string,
    messageDigest: string,
    scope: string,
    idempotency: string,
  ): OutboundMessageAttempt | undefined {
    const attempt = this.idempotency.get(recordKey(scope, idempotency));
    return attempt?.messageId === messageId &&
      attempt.messageDigest === messageDigest
      ? attempt
      : undefined;
  }
  [messageAdvanceCapability](id: string, time: number): OutboundMessageAttempt {
    this.time(time);
    const attempt = this.require(id);
    if (attempt.status !== 'prepared') return attempt;
    if (time < attempt.expiresAtLogicalMs) return attempt;
    return this.replace({
      ...attempt,
      generation: attempt.generation + 1,
      status: 'expired',
    });
  }
  get(id: string): OutboundMessageAttempt | undefined {
    return this.attempts.get(id);
  }
  snapshot(): MessageAttemptLedgerSnapshot {
    return Object.freeze({
      schemaVersion: 1,
      highWaterLogicalMs: this.highWater,
      attempts: Object.freeze([...this.attempts.values()].map(freezeAttempt)),
    });
  }
  restore(snapshot: MessageAttemptLedgerSnapshot): void {
    if (
      !snapshot ||
      !isPlainRecord(snapshot) ||
      snapshot.schemaVersion !== 1 ||
      !isPlainArray(snapshot.attempts) ||
      !Number.isSafeInteger(snapshot.highWaterLogicalMs) ||
      snapshot.highWaterLogicalMs < 0 ||
      snapshot.highWaterLogicalMs < this.highWater
    )
      throw new TypeError('Invalid message attempt snapshot');
    const attempts = new Map<string, OutboundMessageAttempt>();
    const idempotency = new Map<string, OutboundMessageAttempt>();
    for (const original of snapshot.attempts) {
      assertMessageAttemptSnapshot(original, snapshot.highWaterLogicalMs);
      const value =
        original.status === 'reserved'
          ? {
              ...original,
              generation: original.generation + 1,
              status: 'indeterminate' as const,
            }
          : original;
      const frozen = freezeAttempt(value);
      if (attempts.has(frozen.messageAttemptId))
        throw new Error('state_conflict');
      const key = recordKey(frozen.scopeDigest, frozen.idempotencyKey);
      const previous = idempotency.get(key);
      if (previous && previous.messageDigest !== frozen.messageDigest)
        throw new Error('message_idempotency_conflict');
      if (previous) throw new Error('state_conflict');
      attempts.set(frozen.messageAttemptId, frozen);
      idempotency.set(key, frozen);
    }
    this.attempts.clear();
    this.idempotency.clear();
    for (const [id, attempt] of attempts) this.attempts.set(id, attempt);
    for (const [key, attempt] of idempotency)
      this.idempotency.set(key, attempt);
    this.highWater = snapshot.highWaterLogicalMs;
  }
  private replace(attempt: OutboundMessageAttempt): OutboundMessageAttempt {
    const frozen = freezeAttempt(attempt);
    this.attempts.set(frozen.messageAttemptId, frozen);
    this.idempotency.set(
      recordKey(frozen.scopeDigest, frozen.idempotencyKey),
      frozen,
    );
    return frozen;
  }
  private require(id: string): OutboundMessageAttempt {
    const value = this.attempts.get(id);
    if (!value) throw new Error('message_missing');
    return value;
  }
  private time(time: number): void {
    if (!Number.isSafeInteger(time) || time < this.highWater)
      throw new Error('logical_time_rollback');
    this.highWater = time;
  }
}

export interface MessageAttemptLedgerSnapshot {
  readonly schemaVersion: 1;
  readonly highWaterLogicalMs: number;
  readonly attempts: readonly OutboundMessageAttempt[];
}

function reserveMessageForGateway(
  ledger: LocalMessageAttemptLedger,
  id: string,
  time: number,
  authority: AuthorityResult,
): OutboundMessageAttempt {
  return ledger[messageReserveCapability](id, time, authority);
}
function settleMessageForGateway(
  ledger: LocalMessageAttemptLedger,
  id: string,
  reservationId: string,
  dispatchId: string,
  status: Extract<MessageAttemptStatus, 'sent' | 'failed' | 'indeterminate'>,
): OutboundMessageAttempt {
  return ledger[messageOutcomeCapability](
    id,
    reservationId,
    dispatchId,
    status,
  );
}
function lookupMessageForGateway(
  ledger: LocalMessageAttemptLedger,
  messageId: string,
  messageDigest: string,
  scope: string,
  idempotency: string,
): OutboundMessageAttempt | undefined {
  return ledger[messageLookupCapability](
    messageId,
    messageDigest,
    scope,
    idempotency,
  );
}
function advanceMessageForGateway(
  ledger: LocalMessageAttemptLedger,
  id: string,
  time: number,
): OutboundMessageAttempt {
  return ledger[messageAdvanceCapability](id, time);
}

function assertMessageAttemptSnapshot(
  attempt: OutboundMessageAttempt,
  highWater: number,
): void {
  if (
    !isPlainRecord(attempt) ||
    attempt.schemaVersion !== 1 ||
    !nonEmptyString(attempt.messageAttemptId) ||
    !nonEmptyString(attempt.messageId) ||
    !nonEmptyString(attempt.scopeDigest) ||
    !nonEmptyString(attempt.idempotencyKey) ||
    !isDigest(attempt.messageDigest) ||
    !isDigest(attempt.dispatcherDigest) ||
    !positiveInteger(attempt.generation) ||
    !Number.isSafeInteger(attempt.expiresAtLogicalMs) ||
    attempt.expiresAtLogicalMs < 0 ||
    !isMessageAttemptStatus(attempt.status)
  )
    throw new TypeError('Invalid message attempt snapshot');
  if (attempt.status === 'prepared' || attempt.status === 'expired') {
    if (attempt.reservation !== null || attempt.reservedAtLogicalMs !== null)
      throw new TypeError('Invalid message attempt snapshot');
  } else if (
    !isMessageReservation(attempt.reservation, attempt, highWater) ||
    attempt.reservedAtLogicalMs !== attempt.reservation.reservedAtLogicalMs
  ) {
    throw new TypeError('Invalid message attempt snapshot');
  }
}
function isMessageReservation(
  value: MessageReservation | null,
  attempt: OutboundMessageAttempt,
  highWater: number,
): value is MessageReservation {
  return Boolean(
    value &&
    isPlainRecord(value) &&
    value.schemaVersion === 1 &&
    nonEmptyString(value.reservationId) &&
    nonEmptyString(value.messageDispatchAttemptId) &&
    nonEmptyString(value.reservedByGatewayId) &&
    positiveInteger(value.reservedStateGeneration) &&
    value.reservedStateGeneration <= attempt.generation &&
    Number.isSafeInteger(value.reservedAtLogicalMs) &&
    value.reservedAtLogicalMs >= 0 &&
    value.reservedAtLogicalMs <= highWater &&
    (value.authorityGeneration === null ||
      (Number.isSafeInteger(value.authorityGeneration) &&
        value.authorityGeneration >= 0)) &&
    (value.fencingToken === null || nonEmptyString(value.fencingToken)),
  );
}
function assertCurrentMessageAuthority(
  expectedScopeDigest: string,
  authority: AuthorityResult,
): void {
  if (
    authority.status !== 'current' ||
    !authority.scope ||
    !isActionScopeV1(authority.scope) ||
    scopeDigest(authority.scope) !== expectedScopeDigest
  )
    throw new Error('grant_scope_mismatch');
  if (authority.scope.kind === 'coordinated') {
    if (
      authority.authorityGeneration !== authority.scope.authorityGeneration ||
      authority.fencingToken !== authority.scope.fencingToken
    )
      throw new Error('grant_fence_stale');
    return;
  }
  if (
    (authority.authorityGeneration != null) !==
      (authority.fencingToken != null) ||
    (authority.authorityGeneration != null &&
      (!Number.isSafeInteger(authority.authorityGeneration) ||
        authority.authorityGeneration < 0)) ||
    (authority.fencingToken != null && !nonEmptyString(authority.fencingToken))
  )
    throw new Error('grant_fence_stale');
}
function messageAuthorityGeneration(authority: AuthorityResult): number | null {
  if (authority.status !== 'current') return null;
  return authority.scope?.kind === 'coordinated'
    ? authority.scope.authorityGeneration
    : (authority.authorityGeneration ?? null);
}
function messageFencingToken(authority: AuthorityResult): string | null {
  if (authority.status !== 'current') return null;
  return authority.scope?.kind === 'coordinated'
    ? authority.scope.fencingToken
    : (authority.fencingToken ?? null);
}
function messageAuthorityMatchesReservation(
  scope: ActionScope,
  expectedScopeDigest: string,
  authority: AuthorityResult,
  reservation: MessageReservation,
): boolean {
  try {
    assertCurrentMessageAuthority(expectedScopeDigest, authority);
    return (
      scopeDigest(scope) === expectedScopeDigest &&
      messageAuthorityGeneration(authority) ===
        reservation.authorityGeneration &&
      messageFencingToken(authority) === reservation.fencingToken
    );
  } catch {
    return false;
  }
}
function freezeMessage(
  message: OutboundMessage,
  maximumBytes: number,
): OutboundMessage {
  return deepFreeze(
    JSON.parse(
      boundedCanonicalControlJsonV1(
        message,
        maximumBytes,
        'message_not_permitted',
      ),
    ) as OutboundMessage,
  );
}
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.values(Object.getOwnPropertyDescriptors(value)).every(
      (descriptor) => 'value' in descriptor,
    )
  );
}
function isPlainArray(value: unknown): value is readonly unknown[] {
  return (
    Array.isArray(value) &&
    Object.getPrototypeOf(value) === Array.prototype &&
    Object.values(Object.getOwnPropertyDescriptors(value)).every(
      (descriptor) => 'value' in descriptor,
    )
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
function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
}
function isMessageAttemptStatus(value: unknown): value is MessageAttemptStatus {
  return (
    value === 'prepared' ||
    value === 'reserved' ||
    value === 'sent' ||
    value === 'failed' ||
    value === 'indeterminate' ||
    value === 'expired'
  );
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
  }
  return value;
}

export class OutboundMessageGateway {
  readonly dispatcher: OutboundMessageDispatcher;
  readonly authorityResolver: ActionAuthorityResolver;
  readonly assessmentResolver: MessageAssessmentResolver;
  readonly allowedChannels: readonly string[];
  readonly maxOutboundMessageBytes: number;
  constructor(
    readonly ledger: LocalMessageAttemptLedger,
    dispatcher: OutboundMessageDispatcher,
    authorityResolver: ActionAuthorityResolver,
    assessmentResolver: MessageAssessmentResolver,
    allowedChannels: readonly string[],
    limits: OutboundMessageGatewayLimitsV1 = {},
  ) {
    if (
      !nonEmptyString(authorityResolver.resolverId) ||
      !positiveInteger(authorityResolver.resolverVersion)
    )
      throw new Error('dependency_rebind_failed');
    const maxOutboundMessageBytes =
      limits.maxOutboundMessageBytes ?? MAX_OUTBOUND_MESSAGE_BYTES_V1;
    if (
      !Number.isSafeInteger(maxOutboundMessageBytes) ||
      maxOutboundMessageBytes < 1 ||
      maxOutboundMessageBytes > MAX_OUTBOUND_MESSAGE_BYTES_V1
    )
      throw new Error('dependency_rebind_failed');
    this.maxOutboundMessageBytes = maxOutboundMessageBytes;
    this.dispatcher = Object.freeze({
      dispatcherId: dispatcher.dispatcherId,
      dispatcherVersion: dispatcher.dispatcherVersion,
      dispatcherDigest: dispatcher.dispatcherDigest,
      fencingMode: dispatcher.fencingMode,
      send: dispatcher.send.bind(dispatcher),
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
    this.allowedChannels = Object.freeze([...allowedChannels]);
  }
  async send(input: {
    readonly schemaVersion: 1;
    readonly message: OutboundMessage;
    readonly logicalTimeMs: number;
  }): Promise<{ readonly ok: boolean }> {
    if (
      !isPlainRecord(input) ||
      !hasExactKeys(input, ['schemaVersion', 'message', 'logicalTimeMs']) ||
      input.schemaVersion !== 1 ||
      !isPlainRecord(input.message) ||
      !hasExactKeys(input.message, [
        'schemaVersion',
        'messageId',
        'runId',
        'tenantId',
        'channel',
        'recipient',
        'mediaType',
        'content',
        'scope',
        'idempotencyKey',
        'messageDigest',
      ])
    )
      throw new Error('message_not_permitted');
    const message = freezeMessage(input.message, this.maxOutboundMessageBytes);
    if (!isActionScopeV1(message.scope))
      throw new Error('message_not_permitted');
    const { messageDigest: _claimedDigest, ...unsignedMessage } = message;
    const messageDigest = outboundMessageDigest(unsignedMessage);
    const currentScopeDigest = scopeDigest(message.scope);
    const attempt = lookupMessageForGateway(
      this.ledger,
      message.messageId,
      messageDigest,
      currentScopeDigest,
      message.idempotencyKey,
    );
    if (
      message.schemaVersion !== 1 ||
      messageDigest !== message.messageDigest ||
      !attempt ||
      messageDigest !== attempt.messageDigest ||
      attempt.messageId !== message.messageId ||
      attempt.scopeDigest !== currentScopeDigest ||
      attempt.idempotencyKey !== message.idempotencyKey ||
      message.tenantId !== message.scope.tenantId ||
      message.runId !== message.scope.runId ||
      !this.allowedChannels.includes(message.channel)
    )
      throw new Error('message_not_permitted');
    const current = advanceMessageForGateway(
      this.ledger,
      attempt.messageAttemptId,
      input.logicalTimeMs,
    );
    if (current.status !== 'prepared') throw new Error('message_indeterminate');
    if (
      attempt.dispatcherDigest !== this.dispatcher.dispatcherDigest ||
      attempt.dispatcherId !== this.dispatcher.dispatcherId ||
      attempt.dispatcherVersion !== this.dispatcher.dispatcherVersion
    )
      throw new Error('dependency_rebind_failed');
    if (
      message.scope.kind === 'coordinated' &&
      this.dispatcher.fencingMode !== 'downstream_atomic'
    )
      throw new Error('dependency_rebind_failed');
    if (
      !(await this.assessmentResolver.consumeCurrent(
        message,
        attempt,
        input.logicalTimeMs,
      ))
    )
      throw new Error('assessment_required');
    const first = normalizeAuthorityResultV1(
      this.authorityResolver,
      message.scope,
      messageDigest,
      await this.authorityResolver.resolve(
        message.scope,
        messageDigest,
        input.logicalTimeMs,
      ),
    );
    const reserved = reserveMessageForGateway(
      this.ledger,
      attempt.messageAttemptId,
      input.logicalTimeMs,
      first,
    );
    const reservation = reserved.reservation!;
    try {
      const second = normalizeAuthorityResultV1(
        this.authorityResolver,
        message.scope,
        messageDigest,
        await this.authorityResolver.resolve(
          message.scope,
          messageDigest,
          input.logicalTimeMs,
        ),
      );
      if (
        !messageAuthorityMatchesReservation(
          message.scope,
          reserved.scopeDigest,
          second,
          reservation,
        )
      ) {
        settleMessageForGateway(
          this.ledger,
          reserved.messageAttemptId,
          reservation.reservationId,
          reservation.messageDispatchAttemptId,
          'failed',
        );
        throw new Error('grant_fence_stale');
      }
      let assessmentStillCurrent = false;
      try {
        assessmentStillCurrent = await this.assessmentResolver.consumeCurrent(
          message,
          attempt,
          input.logicalTimeMs,
        );
      } catch {
        assessmentStillCurrent = false;
      }
      if (!assessmentStillCurrent) {
        settleMessageForGateway(
          this.ledger,
          reserved.messageAttemptId,
          reservation.reservationId,
          reservation.messageDispatchAttemptId,
          'failed',
        );
        throw new Error('assessment_required');
      }
      const permit = Object.freeze({
        schemaVersion: 1 as const,
        messageAttemptId: reserved.messageAttemptId,
        reservationId: reservation.reservationId,
        messageDispatchAttemptId: reservation.messageDispatchAttemptId,
        gatewayId: this.ledger.gatewayId,
        scopeDigest: reserved.scopeDigest,
        messageDigest,
        idempotencyKey: reserved.idempotencyKey,
        authorityGeneration: reservation.authorityGeneration,
        fencingToken: reservation.fencingToken,
      });
      const result = await this.dispatcher.send({
        message,
        permit,
      });
      settleMessageForGateway(
        this.ledger,
        reserved.messageAttemptId,
        reservation.reservationId,
        reservation.messageDispatchAttemptId,
        result.ok ? 'sent' : 'failed',
      );
      return result;
    } catch (error) {
      const current = this.ledger.get(reserved.messageAttemptId);
      if (current?.status === 'reserved')
        settleMessageForGateway(
          this.ledger,
          reserved.messageAttemptId,
          reservation.reservationId,
          reservation.messageDispatchAttemptId,
          'indeterminate',
        );
      throw error;
    }
  }
}
