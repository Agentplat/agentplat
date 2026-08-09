import {
  claimCollectiveTelemetryDeliveryHandoffV1,
  CollectiveTelemetryRuntimeV1,
  inspectCollectiveTelemetryRuntimeIdentityV1,
  invokeCollectiveTelemetryRecordV1,
  isCollectiveTelemetryDurableRuntimeV1,
  type CollectiveTelemetryCategoryV1,
  type CollectiveTelemetryCorrelationV1,
  type CollectiveTelemetryOutcomeV1,
} from "@agentplat/audit/collective-telemetry";
import { collectiveQuorumDigestV1 } from "@agentplat/collective-quorum/crypto";

/** Only fixed, content-free operation classes may leave the host. */
export type CollectiveHostTelemetryOperationV1 =
  "node.transition" | "assurance.execution" | "semantic.horizon";

export type CollectiveHostTelemetryDeliveryModeV1 =
  "best_effort" | "require_delivery" | "durable_outbox";

export interface CollectiveHostTelemetryEventV1 {
  readonly category: CollectiveTelemetryCategoryV1;
  readonly operation: CollectiveHostTelemetryOperationV1;
  readonly outcome: CollectiveTelemetryOutcomeV1;
  readonly logicalTimeMs: number;
  readonly operationDigest: string;
  readonly evidenceDigests: readonly string[];
  readonly correlation?: CollectiveTelemetryCorrelationV1;
}

export type CollectiveHostTelemetrySourceKindV1 =
  "autonomous_node" | "assurance_execution";

/**
 * A committed, content-free delivery fact. `sourceSequence` and `ordinal`
 * establish causal order without relying on wall-clock timestamps.
 */
export interface CollectiveHostTelemetryOutboxEntryV1 {
  readonly schemaVersion: 1;
  readonly sourceKind: CollectiveHostTelemetrySourceKindV1;
  readonly sourceId: string;
  readonly sourceSequence: number;
  readonly ordinal: number;
  readonly deliveryDigest: string;
  readonly deliveryState: "pending" | "recorded";
  readonly event: CollectiveHostTelemetryEventV1;
}

/** Durable stores retain handoff state until the exact digest is ACKed. */
export interface CollectiveHostTelemetryOutboxStoreV1 {
  loadPendingTelemetry(
    limit?: number,
  ): Promise<readonly CollectiveHostTelemetryOutboxEntryV1[]>;
  markTelemetryRecorded(deliveryDigest: string): Promise<boolean>;
  acknowledgeTelemetry(deliveryDigest: string): Promise<boolean>;
}

export class CollectiveHostTelemetryOutboxCapacityErrorV1 extends Error {
  constructor(readonly maximumPendingTelemetry: number) {
    super("collective host telemetry outbox capacity exhausted");
    this.name = "CollectiveHostTelemetryOutboxCapacityErrorV1";
  }
}

/** A non-authoritative sink for facts that were already durably decided. */
export interface CollectiveHostTelemetryPortV1 {
  record(event: CollectiveHostTelemetryEventV1): Promise<void>;
}

interface DurableTelemetryInvokersV1 {
  readonly handoffDelivery: (input: {
    readonly deliveryDigest: string;
    readonly event: CollectiveHostTelemetryEventV1;
    readonly deliveryState: "pending" | "recorded";
    readonly markRecorded: () => Promise<boolean>;
    readonly acknowledge: () => Promise<boolean>;
  }) => Promise<boolean>;
}

export interface CollectiveHostTelemetryIdentityV1 {
  readonly tenantId: string;
  readonly collectiveId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly keyId: string;
}

const durableTelemetryInvokers = new WeakMap<
  CollectiveHostTelemetryPortV1,
  DurableTelemetryInvokersV1
>();
const durableTelemetryIdentities = new WeakMap<
  CollectiveHostTelemetryPortV1,
  CollectiveHostTelemetryIdentityV1
>();

/** Adapter for the signed, hash-chained, content-free audit stream. */
export class CollectiveHostTelemetryAdapterV1 implements CollectiveHostTelemetryPortV1 {
  readonly #record: (event: CollectiveHostTelemetryEventV1) => Promise<unknown>;

  constructor(
    runtime: CollectiveTelemetryRuntimeV1,
    expectedIdentity?: CollectiveHostTelemetryIdentityV1,
  ) {
    this.#record = (event) => invokeCollectiveTelemetryRecordV1(runtime, event);
    if (isCollectiveTelemetryDurableRuntimeV1(runtime)) {
      const identity = inspectCollectiveTelemetryRuntimeIdentityV1(runtime);
      if (
        !identity ||
        (expectedIdentity !== undefined &&
          (identity.tenantId !== expectedIdentity.tenantId ||
            identity.collectiveId !== expectedIdentity.collectiveId ||
            identity.peerId !== expectedIdentity.peerId ||
            identity.instanceId !== expectedIdentity.instanceId ||
            identity.keyId !== expectedIdentity.keyId))
      )
        throw new TypeError(
          "collective telemetry runtime scope binding is invalid",
        );
      const handoff = claimCollectiveTelemetryDeliveryHandoffV1(runtime);
      durableTelemetryInvokers.set(this, {
        handoffDelivery: (input) => handoff(input),
      });
      durableTelemetryIdentities.set(this, Object.freeze({ ...identity }));
    }
  }

  async record(event: CollectiveHostTelemetryEventV1): Promise<void> {
    await this.#record(event);
  }
}

export function isCollectiveHostDurableTelemetryPortV1(
  telemetry: CollectiveHostTelemetryPortV1 | undefined,
): telemetry is CollectiveHostTelemetryAdapterV1 {
  return Boolean(telemetry && durableTelemetryInvokers.has(telemetry));
}

/** Exact nominal identity binding for reference-stack telemetry. */
export function isCollectiveHostTelemetryPortBoundToIdentityV1(
  telemetry: CollectiveHostTelemetryPortV1 | undefined,
  expected: CollectiveHostTelemetryIdentityV1,
): telemetry is CollectiveHostTelemetryAdapterV1 {
  if (!telemetry || !expected) return false;
  const actual = durableTelemetryIdentities.get(telemetry);
  return Boolean(
    actual &&
    actual.tenantId === expected.tenantId &&
    actual.collectiveId === expected.collectiveId &&
    actual.peerId === expected.peerId &&
    actual.instanceId === expected.instanceId &&
    actual.keyId === expected.keyId,
  );
}

/** Creates an exact-validated, content-addressed durable delivery envelope. */
export async function createCollectiveHostTelemetryOutboxEntryV1(input: {
  readonly sourceKind: CollectiveHostTelemetrySourceKindV1;
  readonly sourceId: string;
  readonly sourceSequence: number;
  readonly ordinal: number;
  readonly event: CollectiveHostTelemetryEventV1;
  readonly crypto?: Crypto;
}): Promise<CollectiveHostTelemetryOutboxEntryV1> {
  const request = Object.freeze({
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceSequence: input.sourceSequence,
    ordinal: input.ordinal,
    event: snapshotHostTelemetryEvent(input.event),
    crypto: captureHostTelemetryCrypto(input.crypto),
  });
  validateSourceCoordinates(request);
  const evidenceDigests = [...new Set(request.event.evidenceDigests)].sort();
  const baseEvent = { ...request.event, evidenceDigests };
  validateHostTelemetryEvent(baseEvent, false);
  const deliveryDigest = await telemetryDeliveryDigest(
    {
      sourceKind: request.sourceKind,
      sourceId: request.sourceId,
      sourceSequence: request.sourceSequence,
      ordinal: request.ordinal,
      event: baseEvent,
    },
    request.crypto,
  );
  const entry = immutable({
    schemaVersion: 1 as const,
    sourceKind: request.sourceKind,
    sourceId: request.sourceId,
    sourceSequence: request.sourceSequence,
    ordinal: request.ordinal,
    deliveryDigest,
    deliveryState: "pending" as const,
    event: {
      ...baseEvent,
      evidenceDigests: [
        ...new Set([...evidenceDigests, deliveryDigest]),
      ].sort(),
    },
  });
  await validateCollectiveHostTelemetryOutboxEntryV1(entry, request.crypto);
  return entry;
}

/** Exact envelope validation, including canonical evidence and digest rebuild. */
export async function validateCollectiveHostTelemetryOutboxEntryV1(
  input: CollectiveHostTelemetryOutboxEntryV1,
  crypto?: Crypto,
): Promise<CollectiveHostTelemetryOutboxEntryV1> {
  exactKeys(
    input,
    [
      "deliveryDigest",
      "deliveryState",
      "event",
      "ordinal",
      "schemaVersion",
      "sourceId",
      "sourceKind",
      "sourceSequence",
    ],
    "telemetry outbox entry",
  );
  const entry = immutable({
    schemaVersion: input.schemaVersion,
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceSequence: input.sourceSequence,
    ordinal: input.ordinal,
    deliveryDigest: input.deliveryDigest,
    deliveryState: input.deliveryState,
    event: snapshotHostTelemetryEvent(input.event),
  });
  const capturedCrypto = captureHostTelemetryCrypto(crypto);
  if (entry.schemaVersion !== 1)
    throw new TypeError("telemetry outbox entry schema is invalid");
  validateSourceCoordinates(entry);
  digest(entry.deliveryDigest, "deliveryDigest");
  if (entry.deliveryState !== "pending" && entry.deliveryState !== "recorded")
    throw new TypeError("telemetry outbox delivery state is invalid");
  validateHostTelemetryEvent(entry.event, true);
  if (
    (entry.sourceKind === "autonomous_node" &&
      entry.event.operation !== "node.transition") ||
    (entry.sourceKind === "assurance_execution" &&
      entry.ordinal === 0 &&
      entry.event.operation !== "assurance.execution") ||
    (entry.sourceKind === "assurance_execution" &&
      entry.ordinal === 1 &&
      entry.event.operation !== "semantic.horizon")
  )
    throw new TypeError("telemetry outbox operation coordinates are invalid");
  const deliveryOccurrences = entry.event.evidenceDigests.filter(
    (value) => value === entry.deliveryDigest,
  ).length;
  if (deliveryOccurrences !== 1)
    throw new TypeError("telemetry outbox delivery evidence is invalid");
  const baseEvent = {
    ...entry.event,
    evidenceDigests: entry.event.evidenceDigests.filter(
      (value) => value !== entry.deliveryDigest,
    ),
  };
  const expected = await telemetryDeliveryDigest(
    {
      sourceKind: entry.sourceKind,
      sourceId: entry.sourceId,
      sourceSequence: entry.sourceSequence,
      ordinal: entry.ordinal,
      event: baseEvent,
    },
    capturedCrypto,
  );
  if (expected !== entry.deliveryDigest)
    throw new TypeError("telemetry outbox delivery digest is invalid");
  return entry;
}

/** Canonical total order shared by memory and PostgreSQL (`COLLATE C`). */
export function compareCollectiveHostTelemetryOutboxEntriesV1(
  left: CollectiveHostTelemetryOutboxEntryV1,
  right: CollectiveHostTelemetryOutboxEntryV1,
): number {
  return (
    lexical(left.sourceKind, right.sourceKind) ||
    lexical(left.sourceId, right.sourceId) ||
    left.sourceSequence - right.sourceSequence ||
    left.ordinal - right.ordinal ||
    lexical(left.deliveryDigest, right.deliveryDigest)
  );
}

/** Validates a newly appended batch, including per-source contiguity. */
export async function validateCollectiveHostTelemetryOutboxBatchV1(
  entries: readonly CollectiveHostTelemetryOutboxEntryV1[],
): Promise<readonly CollectiveHostTelemetryOutboxEntryV1[]> {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 100_000)
    throw new TypeError("telemetry outbox batch is invalid");
  const validated: CollectiveHostTelemetryOutboxEntryV1[] = [];
  for (const entry of entries)
    validated.push(await validateCollectiveHostTelemetryOutboxEntryV1(entry));
  if (validated.some((entry) => entry.deliveryState !== "pending"))
    throw new TypeError("new telemetry outbox entry must be pending");
  for (let index = 1; index < validated.length; index += 1) {
    if (
      compareCollectiveHostTelemetryOutboxEntriesV1(
        validated[index - 1]!,
        validated[index]!,
      ) >= 0
    )
      throw new TypeError("telemetry outbox batch order is not canonical");
  }
  const groups = new Map<string, CollectiveHostTelemetryOutboxEntryV1[]>();
  for (const entry of validated) {
    const key = `${entry.sourceKind}\u0000${entry.sourceId}`;
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group[0]!.sourceKind === "autonomous_node") {
      if (group.length !== 1)
        throw new TypeError("node telemetry batch is not contiguous");
      continue;
    }
    group.forEach((entry, ordinal) => {
      if (entry.ordinal !== ordinal)
        throw new TypeError("assurance telemetry batch is not contiguous");
    });
  }
  return Object.freeze(validated);
}

/**
 * Safe handoff order: sink record+receipt -> source recorded -> sink receipt
 * release -> source ACK/delete. Every crash frontier is replayable and neither
 * side needs an eternal tombstone.
 */
export async function drainCollectiveHostTelemetryOutboxV1(input: {
  readonly store: CollectiveHostTelemetryOutboxStoreV1;
  readonly telemetry: CollectiveHostTelemetryPortV1;
  readonly limit?: number;
}): Promise<number> {
  if (!isCollectiveHostDurableTelemetryPortV1(input.telemetry))
    throw new TypeError(
      "nominal durable collective host telemetry adapter is required",
    );
  const limit = input.limit ?? 128;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000)
    throw new TypeError("telemetry outbox drain limit is invalid");
  const pending = await input.store.loadPendingTelemetry(limit);
  const invokers = durableTelemetryInvokers.get(input.telemetry);
  if (!invokers)
    throw new TypeError(
      "nominal durable collective telemetry adapter is required",
    );
  const validated: CollectiveHostTelemetryOutboxEntryV1[] = [];
  let previous: CollectiveHostTelemetryOutboxEntryV1 | null = null;
  for (const unvalidated of pending) {
    const entry =
      await validateCollectiveHostTelemetryOutboxEntryV1(unvalidated);
    if (previous && sameSourceCoordinate(previous, entry))
      throw new TypeError("telemetry outbox source coordinate conflict");
    if (
      previous &&
      compareCollectiveHostTelemetryOutboxEntriesV1(previous, entry) >= 0
    )
      throw new TypeError("telemetry outbox load order is not canonical");
    previous = entry;
    validated.push(entry);
  }
  let acknowledged = 0;
  for (const entry of validated) {
    if (
      await invokers.handoffDelivery({
        deliveryDigest: entry.deliveryDigest,
        event: entry.event,
        deliveryState: entry.deliveryState,
        markRecorded: () =>
          input.store.markTelemetryRecorded(entry.deliveryDigest),
        acknowledge: () =>
          input.store.acknowledgeTelemetry(entry.deliveryDigest),
      })
    )
      acknowledged += 1;
  }
  return acknowledged;
}

export async function emitCollectiveHostTelemetryV1(input: {
  readonly telemetry: CollectiveHostTelemetryPortV1 | undefined;
  readonly deliveryMode?: CollectiveHostTelemetryDeliveryModeV1;
  readonly event: CollectiveHostTelemetryEventV1;
}): Promise<void> {
  if (input.deliveryMode === "durable_outbox")
    throw new TypeError(
      "durable collective host telemetry must be committed through an outbox",
    );
  if (!input.telemetry) return;
  try {
    await input.telemetry.record(input.event);
  } catch (error) {
    if (input.deliveryMode === "require_delivery")
      throw new Error("collective host telemetry delivery failed", {
        cause: error,
      });
    // Explicitly generic best-effort telemetry cannot affect protected effects.
  }
}

function immutable<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      immutable(child);
  }
  return value;
}

function snapshotHostTelemetryEvent(
  event: CollectiveHostTelemetryEventV1,
): CollectiveHostTelemetryEventV1 {
  const hasCorrelation = Boolean(
    event && Object.prototype.hasOwnProperty.call(event, "correlation"),
  );
  exactKeys(
    event,
    [
      "category",
      ...(hasCorrelation ? ["correlation"] : []),
      "evidenceDigests",
      "logicalTimeMs",
      "operation",
      "operationDigest",
      "outcome",
    ],
    "telemetry outbox event",
  );
  const rawCorrelation = hasCorrelation ? event.correlation : undefined;
  let correlation: CollectiveTelemetryCorrelationV1 | undefined;
  if (rawCorrelation !== undefined) {
    const correlationKeys = [
      ...(Object.prototype.hasOwnProperty.call(rawCorrelation, "cycleId")
        ? ["cycleId"]
        : []),
      ...(Object.prototype.hasOwnProperty.call(rawCorrelation, "decisionId")
        ? ["decisionId"]
        : []),
      ...(Object.prototype.hasOwnProperty.call(rawCorrelation, "effectId")
        ? ["effectId"]
        : []),
      "missionId",
    ];
    exactKeys(rawCorrelation, correlationKeys, "telemetry correlation");
    const missionId = rawCorrelation.missionId;
    const cycleId = rawCorrelation.cycleId;
    const decisionId = rawCorrelation.decisionId;
    const effectId = rawCorrelation.effectId;
    correlation = Object.freeze({
      missionId,
      ...(cycleId === undefined ? {} : { cycleId }),
      ...(decisionId === undefined ? {} : { decisionId }),
      ...(effectId === undefined ? {} : { effectId }),
    });
  }
  const category = event.category;
  const operation = event.operation;
  const outcome = event.outcome;
  const logicalTimeMs = event.logicalTimeMs;
  const operationDigest = event.operationDigest;
  const evidenceDigests = snapshotDenseArray(
    event.evidenceDigests,
    "telemetry outbox evidence",
  );
  return Object.freeze({
    category,
    operation,
    outcome,
    logicalTimeMs,
    operationDigest,
    evidenceDigests,
    ...(correlation === undefined ? {} : { correlation }),
  });
}

function snapshotDenseArray<T>(
  value: readonly T[],
  label: string,
): readonly T[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} is invalid`);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== value.length + 1 ||
    !keys.includes("length") ||
    Array.from({ length: value.length }, (_, index) => String(index)).some(
      (key) => !keys.includes(key),
    )
  )
    throw new TypeError(`${label} shape is invalid`);
  return Object.freeze(
    Array.from({ length: value.length }, (_, index) => value[index]!),
  );
}

function captureHostTelemetryCrypto(
  crypto: Crypto | undefined,
): Crypto | undefined {
  if (!crypto) return undefined;
  if (!crypto.subtle || typeof crypto.subtle.digest !== "function")
    throw new TypeError("Web Crypto is required for collective host telemetry");
  return Object.freeze({
    subtle: Object.freeze({ digest: crypto.subtle.digest.bind(crypto.subtle) }),
  }) as Crypto;
}

async function telemetryDeliveryDigest(
  input: {
    readonly sourceKind: CollectiveHostTelemetrySourceKindV1;
    readonly sourceId: string;
    readonly sourceSequence: number;
    readonly ordinal: number;
    readonly event: CollectiveHostTelemetryEventV1;
  },
  crypto?: Crypto,
): Promise<string> {
  return collectiveQuorumDigestV1(
    {
      domain: "collective-host-telemetry-delivery-v1",
      body: input,
    },
    crypto,
  );
}

function validateSourceCoordinates(input: {
  readonly sourceKind: unknown;
  readonly sourceId: unknown;
  readonly sourceSequence: unknown;
  readonly ordinal: unknown;
}): void {
  if (
    input.sourceKind !== "autonomous_node" &&
    input.sourceKind !== "assurance_execution"
  )
    throw new TypeError("telemetry outbox source kind is invalid");
  identifier(input.sourceId, "sourceId");
  const sourceSequence = integer(
    input.sourceSequence,
    "sourceSequence",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const ordinal = integer(input.ordinal, "ordinal", 0, Number.MAX_SAFE_INTEGER);
  if (input.sourceKind === "autonomous_node" && ordinal !== 0)
    throw new TypeError("node telemetry ordinal is invalid");
  if (
    input.sourceKind === "assurance_execution" &&
    (sourceSequence !== 1 || ordinal > 1)
  )
    throw new TypeError("assurance telemetry coordinates are invalid");
}

function validateHostTelemetryEvent(
  event: CollectiveHostTelemetryEventV1,
  requireDeliveryEvidence: boolean,
): void {
  exactKeys(
    event,
    [
      "category",
      ...(event.correlation === undefined ? [] : ["correlation"]),
      "evidenceDigests",
      "logicalTimeMs",
      "operation",
      "operationDigest",
      "outcome",
    ],
    "telemetry outbox event",
  );
  const categories = [
    "control",
    "coordination",
    "execution",
    "inference",
    "interop",
    "membership",
    "planning",
    "recovery",
    "simulation",
    "transport",
    "trust",
  ];
  if (!categories.includes(event.category))
    throw new TypeError("telemetry outbox event category is invalid");
  if (
    !["node.transition", "assurance.execution", "semantic.horizon"].includes(
      event.operation,
    )
  )
    throw new TypeError("telemetry outbox event operation is invalid");
  if (
    ![
      "accepted",
      "completed",
      "deferred",
      "failed",
      "rejected",
      "started",
    ].includes(event.outcome)
  )
    throw new TypeError("telemetry outbox event outcome is invalid");
  integer(
    event.logicalTimeMs,
    "event.logicalTimeMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  digest(event.operationDigest, "event.operationDigest");
  if (
    !Array.isArray(event.evidenceDigests) ||
    event.evidenceDigests.length < (requireDeliveryEvidence ? 2 : 1) ||
    event.evidenceDigests.length > 100_000
  )
    throw new TypeError("telemetry outbox evidence is invalid");
  const canonical = [...new Set(event.evidenceDigests)].sort();
  if (
    canonical.length !== event.evidenceDigests.length ||
    canonical.some((value, index) => value !== event.evidenceDigests[index])
  )
    throw new TypeError("telemetry outbox evidence is not canonical");
  canonical.forEach((value) => digest(value, "event.evidenceDigest"));
  if (!canonical.includes(event.operationDigest))
    throw new TypeError("telemetry operation digest is missing from evidence");
  if (event.correlation !== undefined) {
    exactKeys(
      event.correlation,
      [
        ...(event.correlation.cycleId === undefined ? [] : ["cycleId"]),
        ...(event.correlation.decisionId === undefined ? [] : ["decisionId"]),
        ...(event.correlation.effectId === undefined ? [] : ["effectId"]),
        "missionId",
      ],
      "telemetry correlation",
    );
    identifier(event.correlation.missionId, "correlation.missionId");
    if (event.correlation.cycleId !== undefined)
      identifier(event.correlation.cycleId, "correlation.cycleId");
    if (event.correlation.decisionId !== undefined)
      identifier(event.correlation.decisionId, "correlation.decisionId");
    if (event.correlation.effectId !== undefined)
      identifier(event.correlation.effectId, "correlation.effectId");
  }
}

function exactKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new TypeError(`${label} is invalid`);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string"))
    throw new TypeError(`${label} fields are invalid`);
  const actual = (ownKeys as string[]).sort();
  const canonical = [...expected].sort();
  if (
    actual.length !== canonical.length ||
    actual.some((key, index) => key !== canonical[index])
  )
    throw new TypeError(`${label} fields are invalid`);
}

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameSourceCoordinate(
  left: CollectiveHostTelemetryOutboxEntryV1,
  right: CollectiveHostTelemetryOutboxEntryV1,
): boolean {
  return (
    left.sourceKind === right.sourceKind &&
    left.sourceId === right.sourceId &&
    left.sourceSequence === right.sourceSequence &&
    left.ordinal === right.ordinal
  );
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+=-]{0,255}$/u.test(value)
  )
    throw new TypeError(`${label} is invalid`);
}

function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  )
    throw new TypeError(`${label} is invalid`);
  return value as number;
}
