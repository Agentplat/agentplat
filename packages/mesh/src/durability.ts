import {
  canonicalizeMeshJsonBytes,
  validateSignedMeshEnvelope,
} from "@agentplat/mesh-protocol";
import type {
  MeshJsonValue,
  MeshProtocolOptions,
  SignedMeshEnvelope,
} from "@agentplat/mesh-protocol";

export const MESH_DURABILITY_SCHEMA_VERSION = 1 as const;
export const MESH_DURABLE_GENESIS_DIGEST =
  "sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export interface MeshDurableScope {
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly instanceId: string;
}

export interface MeshDurableClaim {
  readonly workerId: string;
  readonly leaseToken: string;
  readonly generation: number;
  /** Exclusive RFC 3339 expiry evaluated by the repository clock. */
  readonly expiresAt: string;
}

export type MeshDurableInboxStatus =
  "pending" | "processing" | "applied" | "rejected";

export interface MeshDurableInboxRecord {
  readonly schemaVersion: typeof MESH_DURABILITY_SCHEMA_VERSION;
  readonly scope: MeshDurableScope;
  readonly messageId: string;
  readonly envelope: SignedMeshEnvelope;
  readonly envelopeDigest: string;
  readonly status: MeshDurableInboxStatus;
  readonly attempts: number;
  readonly receivedAt: string;
  readonly availableAt: string;
  readonly claim?: MeshDurableClaim;
  readonly settledAt?: string;
  readonly reasonCode?: string;
}

export interface MeshDurablePeerSnapshot {
  readonly schemaVersion: typeof MESH_DURABILITY_SCHEMA_VERSION;
  readonly scope: MeshDurableScope;
  readonly revision: number;
  readonly state: MeshJsonValue;
  readonly stateDigest: string;
  readonly committedAt: string;
}

export interface MeshDurableJournalDraft {
  readonly entryId: string;
  readonly kind: string;
  readonly reasonCode?: string;
}

export interface MeshDurableJournalEntry extends MeshDurableJournalDraft {
  readonly schemaVersion: typeof MESH_DURABILITY_SCHEMA_VERSION;
  readonly scope: MeshDurableScope;
  readonly sequence: number;
  readonly previousDigest: string;
  readonly digest: string;
  readonly transitionId: string;
  readonly inboxMessageId?: string;
  readonly snapshotRevision: number;
  readonly snapshotDigest: string;
  readonly occurredAt: string;
}

export type MeshDurableOutboxStatus =
  "pending" | "delivering" | "delivered" | "rejected";

export interface MeshDurableOutboundDraft {
  readonly effectId: string;
  readonly envelope: SignedMeshEnvelope;
  /** Required when a topic envelope is delivered to one selected peer. */
  readonly targetPeerId?: string;
}

export interface MeshDurableOutboxRecord extends MeshDurableOutboundDraft {
  readonly schemaVersion: typeof MESH_DURABILITY_SCHEMA_VERSION;
  readonly scope: MeshDurableScope;
  readonly messageId: string;
  readonly envelopeDigest: string;
  readonly status: MeshDurableOutboxStatus;
  readonly attempts: number;
  readonly availableAt: string;
  readonly createdAt: string;
  readonly claim?: MeshDurableClaim;
  readonly settledAt?: string;
  readonly reasonCode?: string;
}

export type MeshDurableReceiveResult =
  | {
      readonly accepted: true;
      readonly duplicate: boolean;
      readonly receivedAt: string;
      readonly envelopeDigest: string;
    }
  | {
      readonly accepted: false;
      readonly code: "capacity_exceeded" | "message_conflict";
    };

export interface MeshDurableClaimOptions {
  readonly scope: MeshDurableScope;
  readonly workerId: string;
  readonly limit: number;
  readonly leaseDurationMs: number;
}

export interface MeshDurableCommitInboxInput {
  readonly inbox: MeshDurableInboxRecord;
  readonly expectedSnapshotRevision: number;
  readonly transitionId: string;
  readonly outcome: "applied" | "rejected";
  readonly nextState?: MeshJsonValue;
  readonly journal: readonly MeshDurableJournalDraft[];
  readonly outbox: readonly MeshDurableOutboundDraft[];
  readonly reasonCode?: string;
}

export type MeshDurableCommitResult =
  | {
      readonly committed: true;
      readonly snapshot?: MeshDurablePeerSnapshot;
      readonly journal: readonly MeshDurableJournalEntry[];
      readonly outbox: readonly MeshDurableOutboxRecord[];
    }
  | {
      readonly committed: false;
      readonly code:
        | "claim_lost"
        | "outbox_conflict"
        | "revision_conflict"
        | "transition_conflict";
    };

export interface MeshDurableAbandonInput {
  readonly inbox: MeshDurableInboxRecord;
  readonly retryAfterMs: number;
  readonly reasonCode?: string;
}

export type MeshDurableOutboxSettlement =
  | {
      readonly disposition: "delivered" | "permanent_rejection";
      readonly reasonCode?: string;
    }
  | {
      readonly disposition: "retryable";
      readonly retryAfterMs: number;
      readonly reasonCode?: string;
    };

export interface MeshDurableSettleOutboxInput {
  readonly outbox: MeshDurableOutboxRecord;
  readonly settlement: MeshDurableOutboxSettlement;
}

export interface MeshDurableJournalQuery {
  readonly scope: MeshDurableScope;
  readonly afterSequence?: number;
  readonly limit: number;
}

export interface MeshDurableRepository {
  receive(input: {
    readonly scope: MeshDurableScope;
    readonly envelope: SignedMeshEnvelope;
  }): Promise<MeshDurableReceiveResult>;
  loadSnapshot(
    scope: MeshDurableScope,
  ): Promise<MeshDurablePeerSnapshot | undefined>;
  claimInbox(
    options: MeshDurableClaimOptions,
  ): Promise<readonly MeshDurableInboxRecord[]>;
  commitInboxTransition(
    input: MeshDurableCommitInboxInput,
  ): Promise<MeshDurableCommitResult>;
  abandonInbox(input: MeshDurableAbandonInput): Promise<boolean>;
  claimOutbox(
    options: MeshDurableClaimOptions,
  ): Promise<readonly MeshDurableOutboxRecord[]>;
  settleOutbox(input: MeshDurableSettleOutboxInput): Promise<boolean>;
  inspectJournal(
    query: MeshDurableJournalQuery,
  ): Promise<readonly MeshDurableJournalEntry[]>;
  close?(): void | Promise<void>;
}

export interface MeshDurableInboxProcessorInput {
  readonly scope: MeshDurableScope;
  readonly inbox: MeshDurableInboxRecord;
  readonly snapshot?: MeshDurablePeerSnapshot;
  readonly signal?: AbortSignal;
}

export type MeshDurableInboxProcessorResult =
  | {
      readonly outcome: "applied";
      readonly transitionId?: string;
      readonly nextState: MeshJsonValue;
      readonly journal?: readonly MeshDurableJournalDraft[];
      readonly outbox?: readonly MeshDurableOutboundDraft[];
    }
  | {
      readonly outcome: "rejected";
      readonly transitionId?: string;
      readonly reasonCode: string;
      readonly journal?: readonly MeshDurableJournalDraft[];
    };

export type MeshDurableInboxProcessor = (
  input: MeshDurableInboxProcessorInput,
) => MeshDurableInboxProcessorResult | Promise<MeshDurableInboxProcessorResult>;

export type MeshDurableOutboxDeliver = (
  outbox: MeshDurableOutboxRecord,
  signal?: AbortSignal,
) => MeshDurableOutboxSettlement | Promise<MeshDurableOutboxSettlement>;

export interface MeshDurableWorkerDiagnostic {
  readonly kind:
    | "inbox.abandoned"
    | "inbox.commit_conflict"
    | "inbox.processor_failure"
    | "outbox.delivery_failure"
    | "outbox.settle_conflict";
  readonly recordId: string;
  readonly code?: string;
}

export interface MeshDurableWorkerOptions {
  readonly repository: MeshDurableRepository;
  readonly scope: MeshDurableScope;
  readonly workerId: string;
  readonly processInbox: MeshDurableInboxProcessor;
  readonly deliverOutbox: MeshDurableOutboxDeliver;
  readonly inboxBatchSize?: number;
  readonly outboxBatchSize?: number;
  readonly leaseDurationMs?: number;
  readonly failureRetryAfterMs?: number;
  readonly onDiagnostic?: (diagnostic: MeshDurableWorkerDiagnostic) => void;
}

export interface MeshDurableWorkerBatchResult {
  readonly claimed: number;
  readonly completed: number;
  readonly conflicted: number;
  readonly failed: number;
}

export interface MeshDurableWorkerRunResult {
  readonly inbox: MeshDurableWorkerBatchResult;
  readonly outbox: MeshDurableWorkerBatchResult;
}

export interface MeshDurableWorker {
  runInboxBatch(signal?: AbortSignal): Promise<MeshDurableWorkerBatchResult>;
  runOutboxBatch(signal?: AbortSignal): Promise<MeshDurableWorkerBatchResult>;
  runOnce(signal?: AbortSignal): Promise<MeshDurableWorkerRunResult>;
  start(options: {
    readonly signal: AbortSignal;
    readonly idleDelayMs?: number;
  }): Promise<void>;
}

/** Creates an inert worker. Work starts only through an explicit run method. */
export function createMeshDurableWorker(
  options: MeshDurableWorkerOptions,
): MeshDurableWorker {
  if (
    !options ||
    !options.repository ||
    typeof options.processInbox !== "function" ||
    typeof options.deliverOutbox !== "function"
  ) {
    throw new TypeError("Mesh durable worker dependencies are required");
  }
  const scope = normalizeMeshDurableScope(options.scope);
  const workerId = boundedIdentifier(options.workerId, "workerId");
  const inboxBatchSize = boundedInteger(
    options.inboxBatchSize ?? 16,
    "inboxBatchSize",
    256,
  );
  const outboxBatchSize = boundedInteger(
    options.outboxBatchSize ?? 16,
    "outboxBatchSize",
    256,
  );
  const leaseDurationMs = boundedInteger(
    options.leaseDurationMs ?? 30_000,
    "leaseDurationMs",
    3_600_000,
  );
  const failureRetryAfterMs = boundedInteger(
    options.failureRetryAfterMs ?? 1_000,
    "failureRetryAfterMs",
    3_600_000,
  );

  const runInboxBatch = async (
    signal?: AbortSignal,
  ): Promise<MeshDurableWorkerBatchResult> => {
    if (signal?.aborted) return emptyBatch();
    const records = await options.repository.claimInbox({
      scope,
      workerId,
      limit: inboxBatchSize,
      leaseDurationMs,
    });
    let completed = 0;
    let conflicted = 0;
    let failed = 0;
    for (const inbox of records) {
      if (signal?.aborted) break;
      try {
        assertInboxClaim(inbox, scope, workerId);
        const snapshot = await options.repository.loadSnapshot(scope);
        const processed = await options.processInbox({
          scope,
          inbox,
          snapshot,
          signal,
        });
        const normalized = normalizeProcessorResult(processed, scope, inbox);
        const commit = await options.repository.commitInboxTransition({
          inbox,
          expectedSnapshotRevision: snapshot?.revision ?? 0,
          transitionId: normalized.transitionId ?? `inbox:${inbox.messageId}`,
          outcome: normalized.outcome,
          ...(normalized.outcome === "applied"
            ? { nextState: normalized.nextState }
            : { reasonCode: normalized.reasonCode }),
          journal: normalized.journal ?? [],
          outbox:
            normalized.outcome === "applied" ? (normalized.outbox ?? []) : [],
        });
        if (commit.committed) completed += 1;
        else {
          conflicted += 1;
          workerDiagnostic(options, {
            kind: "inbox.commit_conflict",
            recordId: inbox.messageId,
            code: commit.code,
          });
        }
      } catch {
        failed += 1;
        workerDiagnostic(options, {
          kind: "inbox.processor_failure",
          recordId: inbox.messageId,
        });
        const abandoned = await options.repository
          .abandonInbox({
            inbox,
            retryAfterMs: failureRetryAfterMs,
            reasonCode: "processor_failure",
          })
          .catch(() => false);
        if (abandoned) {
          workerDiagnostic(options, {
            kind: "inbox.abandoned",
            recordId: inbox.messageId,
          });
        }
      }
    }
    return Object.freeze({
      claimed: records.length,
      completed,
      conflicted,
      failed,
    });
  };

  const runOutboxBatch = async (
    signal?: AbortSignal,
  ): Promise<MeshDurableWorkerBatchResult> => {
    if (signal?.aborted) return emptyBatch();
    const records = await options.repository.claimOutbox({
      scope,
      workerId,
      limit: outboxBatchSize,
      leaseDurationMs,
    });
    let completed = 0;
    let conflicted = 0;
    let failed = 0;
    for (const outbox of records) {
      if (signal?.aborted) break;
      let settlement: MeshDurableOutboxSettlement;
      try {
        assertOutboxClaim(outbox, scope, workerId);
        settlement = normalizeSettlement(
          await options.deliverOutbox(outbox, signal),
        );
      } catch {
        failed += 1;
        workerDiagnostic(options, {
          kind: "outbox.delivery_failure",
          recordId: outbox.effectId,
        });
        settlement = {
          disposition: "retryable",
          retryAfterMs: failureRetryAfterMs,
          reasonCode: "delivery_failure",
        };
      }
      const settled = await options.repository
        .settleOutbox({ outbox, settlement })
        .catch(() => false);
      if (settled) completed += 1;
      else {
        conflicted += 1;
        workerDiagnostic(options, {
          kind: "outbox.settle_conflict",
          recordId: outbox.effectId,
        });
      }
    }
    return Object.freeze({
      claimed: records.length,
      completed,
      conflicted,
      failed,
    });
  };

  const runOnce = async (
    signal?: AbortSignal,
  ): Promise<MeshDurableWorkerRunResult> => {
    const inbox = await runInboxBatch(signal);
    const outbox = signal?.aborted
      ? emptyBatch()
      : await runOutboxBatch(signal);
    return Object.freeze({ inbox, outbox });
  };
  return Object.freeze({
    runInboxBatch,
    runOutboxBatch,
    runOnce,
    async start({
      signal,
      idleDelayMs = 100,
    }: {
      readonly signal: AbortSignal;
      readonly idleDelayMs?: number;
    }) {
      const idle = boundedInteger(idleDelayMs, "idleDelayMs", 60_000);
      while (!signal.aborted) {
        const result = await runOnce(signal);
        if (
          !signal.aborted &&
          result.inbox.claimed === 0 &&
          result.outbox.claimed === 0
        ) {
          await abortableDelay(idle, signal);
        }
      }
    },
  });
}

export function normalizeMeshDurableScope(
  scope: MeshDurableScope,
): MeshDurableScope {
  if (!scope || typeof scope !== "object") {
    throw new TypeError("Mesh durable scope is required");
  }
  const keys = Object.keys(scope).sort();
  if (
    keys.length !== 4 ||
    keys[0] !== "instanceId" ||
    keys[1] !== "meshId" ||
    keys[2] !== "peerId" ||
    keys[3] !== "tenantId"
  ) {
    throw new TypeError("Mesh durable scope must have an exact shape");
  }
  return Object.freeze({
    tenantId: boundedIdentifier(scope.tenantId, "tenantId"),
    meshId: boundedIdentifier(scope.meshId, "meshId"),
    peerId: boundedIdentifier(scope.peerId, "peerId"),
    instanceId: boundedIdentifier(scope.instanceId, "instanceId"),
  });
}

export async function computeMeshDurableValueDigest(
  value: MeshJsonValue,
  options: {
    readonly protocolOptions?: MeshProtocolOptions;
    readonly crypto?: Crypto;
  } = {},
): Promise<string> {
  const canonical = canonicalizeMeshJsonBytes(value, options.protocolOptions);
  if (!canonical.ok) {
    throw new TypeError("Mesh durable value must be bounded strict JSON");
  }
  const buffer = new ArrayBuffer(canonical.value.byteLength);
  new Uint8Array(buffer).set(canonical.value);
  const digest = await (options.crypto ?? globalThis.crypto).subtle.digest(
    "SHA-256",
    buffer,
  );
  return `sha256:${base64Url(new Uint8Array(digest))}`;
}

export async function createMeshDurableJournalEntry(input: {
  readonly scope: MeshDurableScope;
  readonly sequence: number;
  readonly previousDigest: string;
  readonly transitionId: string;
  readonly inboxMessageId?: string;
  readonly snapshotRevision: number;
  readonly snapshotDigest: string;
  readonly draft: MeshDurableJournalDraft;
  readonly occurredAt: string;
  readonly crypto?: Crypto;
}): Promise<MeshDurableJournalEntry> {
  const scope = normalizeMeshDurableScope(input.scope);
  const sequence = boundedInteger(
    input.sequence,
    "journal sequence",
    Number.MAX_SAFE_INTEGER,
  );
  const snapshotRevision = nonNegativeInteger(
    input.snapshotRevision,
    "snapshot revision",
  );
  const draft = normalizeJournalDraft(input.draft);
  assertDigest(input.previousDigest, "previous digest");
  assertDigest(input.snapshotDigest, "snapshot digest");
  boundedIdentifier(input.transitionId, "transitionId");
  if (input.inboxMessageId !== undefined) {
    assertMessageId(input.inboxMessageId);
  }
  assertTimestamp(input.occurredAt, "occurredAt");
  const document = {
    schemaVersion: MESH_DURABILITY_SCHEMA_VERSION,
    scope: {
      tenantId: scope.tenantId,
      meshId: scope.meshId,
      peerId: scope.peerId,
      instanceId: scope.instanceId,
    },
    sequence,
    previousDigest: input.previousDigest,
    transitionId: input.transitionId,
    ...(input.inboxMessageId === undefined
      ? {}
      : { inboxMessageId: input.inboxMessageId }),
    snapshotRevision,
    snapshotDigest: input.snapshotDigest,
    entryId: draft.entryId,
    kind: draft.kind,
    ...(draft.reasonCode === undefined ? {} : { reasonCode: draft.reasonCode }),
    occurredAt: input.occurredAt,
  };
  const digest = await computeMeshDurableValueDigest(
    document as MeshJsonValue,
    {
      crypto: input.crypto,
    },
  );
  return Object.freeze({
    schemaVersion: MESH_DURABILITY_SCHEMA_VERSION,
    scope,
    sequence,
    previousDigest: input.previousDigest,
    digest,
    transitionId: input.transitionId,
    ...(input.inboxMessageId === undefined
      ? {}
      : { inboxMessageId: input.inboxMessageId }),
    snapshotRevision,
    snapshotDigest: input.snapshotDigest,
    entryId: draft.entryId,
    kind: draft.kind,
    ...(draft.reasonCode === undefined ? {} : { reasonCode: draft.reasonCode }),
    occurredAt: input.occurredAt,
  });
}

export async function verifyMeshDurableJournal(input: {
  readonly entries: readonly MeshDurableJournalEntry[];
  readonly anchorDigest?: string;
  readonly anchorSequence?: number;
  readonly crypto?: Crypto;
}): Promise<boolean> {
  let previousDigest = input.anchorDigest ?? MESH_DURABLE_GENESIS_DIGEST;
  let sequence = input.anchorSequence ?? 0;
  assertDigest(previousDigest, "anchor digest");
  nonNegativeInteger(sequence, "anchor sequence");
  for (const entry of input.entries) {
    if (
      entry.sequence !== sequence + 1 ||
      entry.previousDigest !== previousDigest
    ) {
      return false;
    }
    const rebuilt = await createMeshDurableJournalEntry({
      scope: entry.scope,
      sequence: entry.sequence,
      previousDigest: entry.previousDigest,
      transitionId: entry.transitionId,
      inboxMessageId: entry.inboxMessageId,
      snapshotRevision: entry.snapshotRevision,
      snapshotDigest: entry.snapshotDigest,
      draft: entry,
      occurredAt: entry.occurredAt,
      crypto: input.crypto,
    });
    if (rebuilt.digest !== entry.digest) return false;
    previousDigest = entry.digest;
    sequence = entry.sequence;
  }
  return true;
}

function normalizeProcessorResult(
  result: MeshDurableInboxProcessorResult,
  scope: MeshDurableScope,
  inbox: MeshDurableInboxRecord,
): MeshDurableInboxProcessorResult {
  if (!result || typeof result !== "object") {
    throw new TypeError("Mesh durable processor result is required");
  }
  if (result.transitionId !== undefined) {
    boundedIdentifier(result.transitionId, "transitionId");
  }
  const journal = Object.freeze(
    (result.journal ?? []).map(normalizeJournalDraft),
  );
  if (journal.length > 64) {
    throw new RangeError("Mesh durable transition journal is too large");
  }
  if (result.outcome === "rejected") {
    boundedReason(result.reasonCode);
    if ("outbox" in result || "nextState" in result) {
      throw new TypeError("Rejected durable transition cannot change state");
    }
    return Object.freeze({
      outcome: "rejected",
      ...(result.transitionId ? { transitionId: result.transitionId } : {}),
      reasonCode: result.reasonCode,
      journal,
    });
  }
  if (result.outcome !== "applied" || result.nextState === undefined) {
    throw new TypeError("Applied durable transition requires nextState");
  }
  const canonical = canonicalizeMeshJsonBytes(result.nextState);
  if (!canonical.ok) {
    throw new TypeError("Mesh durable nextState must be bounded strict JSON");
  }
  const outbox = Object.freeze(
    (result.outbox ?? []).map((draft) =>
      normalizeOutboundDraft(draft, scope, inbox),
    ),
  );
  if (outbox.length > 256) {
    throw new RangeError("Mesh durable transition outbox is too large");
  }
  return Object.freeze({
    outcome: "applied",
    ...(result.transitionId ? { transitionId: result.transitionId } : {}),
    nextState: result.nextState,
    journal,
    outbox,
  });
}

function normalizeOutboundDraft(
  draft: MeshDurableOutboundDraft,
  scope: MeshDurableScope,
  inbox: MeshDurableInboxRecord,
): MeshDurableOutboundDraft {
  if (!draft || typeof draft !== "object") {
    throw new TypeError("Mesh durable outbound draft is invalid");
  }
  boundedIdentifier(draft.effectId, "effectId");
  const validated = validateSignedMeshEnvelope(draft.envelope);
  if (
    !validated.ok ||
    validated.value.tenantId !== scope.tenantId ||
    validated.value.meshId !== scope.meshId ||
    validated.value.sender.peerId !== scope.peerId ||
    validated.value.sender.instanceId !== scope.instanceId
  ) {
    throw new TypeError("Mesh durable outbound envelope scope is invalid");
  }
  if (draft.targetPeerId !== undefined) {
    boundedIdentifier(draft.targetPeerId, "targetPeerId");
    if (
      validated.value.audience.kind === "peer" &&
      validated.value.audience.peerId !== draft.targetPeerId
    ) {
      throw new TypeError("Mesh durable outbound target is invalid");
    }
  }
  if (
    validated.value.audience.kind === "mesh" &&
    draft.targetPeerId === undefined
  ) {
    throw new TypeError("Mesh durable topic outbox requires targetPeerId");
  }
  if (validated.value.messageId === inbox.messageId) {
    throw new TypeError("Mesh durable outbound messageId must be distinct");
  }
  return Object.freeze({
    effectId: draft.effectId,
    envelope: validated.value,
    ...(draft.targetPeerId === undefined
      ? {}
      : { targetPeerId: draft.targetPeerId }),
  });
}

function normalizeJournalDraft(
  draft: MeshDurableJournalDraft,
): MeshDurableJournalDraft {
  if (!draft || typeof draft !== "object") {
    throw new TypeError("Mesh durable journal draft is invalid");
  }
  boundedIdentifier(draft.entryId, "journal entryId");
  boundedReason(draft.kind, "journal kind");
  if (draft.reasonCode !== undefined) boundedReason(draft.reasonCode);
  return Object.freeze({
    entryId: draft.entryId,
    kind: draft.kind,
    ...(draft.reasonCode === undefined ? {} : { reasonCode: draft.reasonCode }),
  });
}

function normalizeSettlement(
  settlement: MeshDurableOutboxSettlement,
): MeshDurableOutboxSettlement {
  if (!settlement || typeof settlement !== "object") {
    throw new TypeError("Mesh durable outbox settlement is invalid");
  }
  if (settlement.reasonCode !== undefined) boundedReason(settlement.reasonCode);
  if (settlement.disposition === "retryable") {
    return Object.freeze({
      disposition: "retryable",
      retryAfterMs: boundedInteger(
        settlement.retryAfterMs,
        "retryAfterMs",
        3_600_000,
      ),
      ...(settlement.reasonCode === undefined
        ? {}
        : { reasonCode: settlement.reasonCode }),
    });
  }
  if (
    settlement.disposition !== "delivered" &&
    settlement.disposition !== "permanent_rejection"
  ) {
    throw new TypeError("Mesh durable outbox settlement is invalid");
  }
  return Object.freeze({
    disposition: settlement.disposition,
    ...(settlement.reasonCode === undefined
      ? {}
      : { reasonCode: settlement.reasonCode }),
  });
}

function assertInboxClaim(
  inbox: MeshDurableInboxRecord,
  scope: MeshDurableScope,
  workerId: string,
): void {
  if (
    inbox.status !== "processing" ||
    !inbox.claim ||
    inbox.claim.workerId !== workerId ||
    !scopeEquals(inbox.scope, scope)
  ) {
    throw new TypeError("Mesh durable inbox claim is invalid");
  }
}

function assertOutboxClaim(
  outbox: MeshDurableOutboxRecord,
  scope: MeshDurableScope,
  workerId: string,
): void {
  if (
    outbox.status !== "delivering" ||
    !outbox.claim ||
    outbox.claim.workerId !== workerId ||
    !scopeEquals(outbox.scope, scope)
  ) {
    throw new TypeError("Mesh durable outbox claim is invalid");
  }
}

function scopeEquals(left: MeshDurableScope, right: MeshDurableScope): boolean {
  return (
    left.tenantId === right.tenantId &&
    left.meshId === right.meshId &&
    left.peerId === right.peerId &&
    left.instanceId === right.instanceId
  );
}

function workerDiagnostic(
  options: MeshDurableWorkerOptions,
  diagnostic: MeshDurableWorkerDiagnostic,
): void {
  try {
    options.onDiagnostic?.(Object.freeze(diagnostic));
  } catch {
    // Diagnostics never change durable state.
  }
}

function emptyBatch(): MeshDurableWorkerBatchResult {
  return Object.freeze({ claimed: 0, completed: 0, conflicted: 0, failed: 0 });
}

function abortableDelay(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}

function boundedIdentifier(value: string, label: string): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    new TextEncoder().encode(value).byteLength > 256 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@-]*$/u.test(value)
  ) {
    throw new TypeError(`Mesh durable ${label} is invalid`);
  }
  return value;
}

function boundedReason(value: string, label = "reasonCode"): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    !/^[a-z0-9][a-z0-9._:-]*$/u.test(value)
  ) {
    throw new TypeError(`Mesh durable ${label} is invalid`);
  }
  return value;
}

function assertMessageId(value: string): string {
  // Protocol message IDs are canonical base64url encodings of 16 bytes. The
  // final character carries two significant bits and four zero padding bits.
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{21}[AQgw]$/u.test(value)) {
    throw new TypeError("Mesh durable inboxMessageId is invalid");
  }
  return value;
}

function boundedInteger(value: number, label: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`Mesh durable ${label} is outside its range`);
  }
  return value;
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Mesh durable ${label} is outside its range`);
  }
  return value;
}

function assertDigest(value: string, label: string): void {
  if (typeof value !== "string" || !/^sha256:[A-Za-z0-9_-]{43}$/u.test(value)) {
    throw new TypeError(`Mesh durable ${label} is invalid`);
  }
}

function assertTimestamp(value: string, label: string): void {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new TypeError(`Mesh durable ${label} is invalid`);
  }
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}
