import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import type { VerifiedMeshEnvelope } from "@agentplat/mesh-protocol";

import type {
  TeamExecutionExchangeAdmissionOutcomeV1,
  TeamExecutionExchangeBatchOutcomeV1,
  TeamExecutionExchangeInboxRecordV1,
  TeamExecutionExchangeMembershipDecisionV1,
  TeamExecutionExchangeMessageDraftV1,
  TeamExecutionExchangeMessageV1,
  TeamExecutionExchangePendingRecordV1,
  TeamExecutionExchangeRuntimeOptionsV1,
  TeamExecutionExchangeRuntimePortV1,
  TeamExecutionExchangeSourceHeadV1,
  TeamExecutionExchangeStateV1,
} from "./team-execution-exchange-contracts.js";
import { TEAM_EXECUTION_EXCHANGE_MESH_EXTENSION_V1 } from "./team-execution-exchange-contracts.js";
import {
  createTeamExecutionExchangeMeshExtensionV1,
  createTeamExecutionExchangeMessageV1,
  createTeamExecutionExchangeStateV1,
  extractTeamExecutionExchangeMessageV1,
  validateTeamExecutionExchangeIdentityV1,
  validateTeamExecutionExchangePolicyV1,
  validateTeamExecutionExchangeStateV1,
} from "./team-execution-exchange-validation.js";
import { validateTeamExecutionScopeV1 } from "./team-execution-validation.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

export class TeamExecutionExchangeRuntimeV1 implements TeamExecutionExchangeRuntimePortV1 {
  readonly #options: TeamExecutionExchangeRuntimeOptionsV1;
  readonly #maximumCommitAttempts: number;

  constructor(options: TeamExecutionExchangeRuntimeOptionsV1) {
    if (!options || typeof options !== "object")
      fail("team execution exchange runtime options are required");
    const policy = validateTeamExecutionExchangePolicyV1(options.policy);
    this.#options = Object.freeze({
      ...options,
      stateKey: identifier(options.stateKey, "runtime.stateKey"),
      runtimeId: identifier(options.runtimeId, "runtime.runtimeId"),
      runtimeVersion: positive(
        options.runtimeVersion,
        "runtime.runtimeVersion",
      ),
      implementationId: identifier(
        options.implementationId,
        "runtime.implementationId",
      ),
      streamId: identifier(options.streamId, "runtime.streamId"),
      localIdentity: validateTeamExecutionExchangeIdentityV1(
        options.localIdentity,
      ),
      scope: validateTeamExecutionScopeV1(options.scope),
      policy,
    });
    if (
      !options.store ||
      typeof options.store.load !== "function" ||
      typeof options.store.save !== "function" ||
      !options.membership ||
      typeof options.membership.evaluate !== "function" ||
      !options.handler ||
      typeof options.handler.handle !== "function" ||
      !options.outbound ||
      typeof options.outbound.publish !== "function" ||
      (options.recovery !== undefined &&
        typeof options.recovery.fetch !== "function")
    )
      fail("team execution exchange runtime ports are required");
    this.#maximumCommitAttempts = policy.policy.limits.maximumCommitAttempts;
  }

  async enqueue(
    draft: TeamExecutionExchangeMessageDraftV1,
  ): Promise<TeamExecutionExchangeMessageV1> {
    return this.#commit((state) => {
      const existing = state.outbox.find(
        (record) => record.message.messageId === draft?.messageId,
      );
      if (existing) {
        const replay = createTeamExecutionExchangeMessageV1({
          draft,
          streamId: existing.message.streamId,
          sequence: existing.message.sequence,
          predecessorDigest: existing.message.predecessorDigest,
          scope: state.scope,
          policyDigest: state.policyDigest,
          sender: state.localIdentity,
        });
        if (replay.messageDigest !== existing.message.messageDigest)
          fail(
            "team execution exchange message id conflicts with existing outbox",
          );
        return { state, output: existing.message };
      }
      const logicalTimeMs = nonNegative(
        draft?.logicalTimeMs,
        "message.logicalTimeMs",
      );
      if (logicalTimeMs < state.logicalTimeHighWaterMs)
        fail("team execution exchange logical time regressed");
      const ttl = positive(
        draft?.validUntilLogicalMs - logicalTimeMs,
        "message.ttl",
      );
      if (ttl > this.#options.policy.policy.limits.maximumMessageTtlMs)
        fail("team execution exchange message ttl exceeds local policy");
      const message = createTeamExecutionExchangeMessageV1({
        draft,
        streamId: state.streamId,
        sequence: state.outboundSequence + 1,
        predecessorDigest: state.outboundHeadDigest,
        scope: state.scope,
        policyDigest: state.policyDigest,
        sender: state.localIdentity,
      });
      const outbox = pruneSent(
        [
          ...state.outbox,
          Object.freeze({ message, status: "pending" as const }),
        ],
        this.#options.policy.policy.limits.maximumRetainedOutboxMessages,
      );
      if (
        outbox.length >
        this.#options.policy.policy.limits.maximumRetainedOutboxMessages
      )
        fail("team execution exchange outbox capacity exceeded");
      return {
        state: nextState(state, {
          logicalTimeHighWaterMs: logicalTimeMs,
          outboundSequence: message.sequence,
          outboundHeadDigest: message.messageDigest,
          outbox,
        }),
        output: message,
      };
    });
  }

  async admit(input: {
    readonly envelope: VerifiedMeshEnvelope;
    readonly logicalTimeMs: number;
  }): Promise<TeamExecutionExchangeAdmissionOutcomeV1> {
    const logicalTimeMs = nonNegative(
      input?.logicalTimeMs,
      "admission.logicalTimeMs",
    );
    let message: TeamExecutionExchangeMessageV1;
    try {
      message = extractTeamExecutionExchangeMessageV1(input.envelope);
      this.#assertInboundBinding(message, logicalTimeMs);
    } catch (error) {
      return Object.freeze({
        status: "rejected" as const,
        reasonCode: reason(error, "message_invalid"),
      });
    }
    const decision = await this.#options.membership.evaluate({
      message,
      envelope: input.envelope,
      logicalTimeMs,
    });
    if (!validMembershipDecision(decision, message, logicalTimeMs))
      return Object.freeze({
        status: "rejected" as const,
        reasonCode: "membership_not_authorized",
      });
    return this.#commit((state) =>
      this.#admitToState({
        state,
        message,
        envelope: input.envelope,
        logicalTimeMs,
      }),
    );
  }

  async processInbox(): Promise<TeamExecutionExchangeBatchOutcomeV1> {
    let attempted = 0;
    let completed = 0;
    let failed = 0;
    for (;;) {
      const state = await this.loadState();
      const next = state.inbox.find((record) => record.status === "ready");
      if (!next) break;
      attempted += 1;
      try {
        await this.#options.handler.handle({
          messageId: next.message.messageId,
          message: next.message,
        });
        await this.#markInboxHandled(next.message.messageDigest);
        completed += 1;
      } catch {
        failed += 1;
        break;
      }
    }
    return Object.freeze({ attempted, completed, failed });
  }

  async flushOutbox(): Promise<TeamExecutionExchangeBatchOutcomeV1> {
    let attempted = 0;
    let completed = 0;
    let failed = 0;
    for (;;) {
      const state = await this.loadState();
      const next = state.outbox.find((record) => record.status === "pending");
      if (!next) break;
      attempted += 1;
      try {
        await this.#options.outbound.publish({
          message: next.message,
          extensionKey: TEAM_EXECUTION_EXCHANGE_MESH_EXTENSION_V1,
          extension: createTeamExecutionExchangeMeshExtensionV1(next.message),
        });
        await this.#markOutboxSent(next.message.messageDigest);
        completed += 1;
      } catch {
        failed += 1;
        break;
      }
    }
    return Object.freeze({ attempted, completed, failed });
  }

  async recoverPending(input: {
    readonly logicalTimeMs: number;
  }): Promise<TeamExecutionExchangeBatchOutcomeV1> {
    const logicalTimeMs = nonNegative(
      input?.logicalTimeMs,
      "recovery.logicalTimeMs",
    );
    if (!this.#options.recovery)
      return Object.freeze({ attempted: 0, completed: 0, failed: 0 });
    const state = await this.loadState();
    const pending = state.pending[0];
    if (!pending)
      return Object.freeze({ attempted: 0, completed: 0, failed: 0 });
    const head = findHead(state.sourceHeads, pending.message);
    const fromSequence = (head?.sequence ?? 0) + 1;
    const toSequence = pending.message.sequence - 1;
    if (toSequence < fromSequence)
      return Object.freeze({ attempted: 0, completed: 0, failed: 0 });
    const limit = Math.min(
      toSequence - fromSequence + 1,
      this.#options.policy.policy.limits.maximumRecoveryBatchSize,
    );
    let envelopes: readonly VerifiedMeshEnvelope[];
    try {
      envelopes = await this.#options.recovery.fetch({
        streamId: pending.message.streamId,
        senderPeerId: pending.message.sender.peerId,
        senderInstanceId: pending.message.sender.instanceId,
        fromSequence,
        toSequence,
        limit,
      });
    } catch {
      return Object.freeze({ attempted: 1, completed: 0, failed: 1 });
    }
    if (!Array.isArray(envelopes) || envelopes.length > limit)
      return Object.freeze({ attempted: 1, completed: 0, failed: 1 });
    let completed = 0;
    let failed = 0;
    for (const envelope of envelopes) {
      const outcome = await this.admit({ envelope, logicalTimeMs });
      if (outcome.status === "accepted" || outcome.status === "duplicate")
        completed += 1;
      else if (outcome.status === "rejected") failed += 1;
    }
    return Object.freeze({
      attempted: envelopes.length,
      completed,
      failed,
    });
  }

  async loadState(): Promise<TeamExecutionExchangeStateV1> {
    const loaded = await this.#options.store.load(this.#options.stateKey);
    const state = loaded
      ? validateTeamExecutionExchangeStateV1(loaded)
      : this.#initialState();
    this.#assertStateBinding(state);
    return state;
  }

  #admitToState(input: {
    state: TeamExecutionExchangeStateV1;
    message: TeamExecutionExchangeMessageV1;
    envelope: VerifiedMeshEnvelope;
    logicalTimeMs: number;
  }): {
    readonly state: TeamExecutionExchangeStateV1;
    readonly output: TeamExecutionExchangeAdmissionOutcomeV1;
  } {
    const { state, message, envelope, logicalTimeMs } = input;
    const known = [...state.inbox, ...state.pending].find(
      (record) => record.message.messageId === message.messageId,
    );
    if (known) {
      if (known.message.messageDigest !== message.messageDigest)
        return rejected(state, "message_id_conflict");
      return {
        state,
        output: Object.freeze({
          status: "duplicate" as const,
          messageDigest: message.messageDigest,
        }),
      };
    }
    let heads = [...state.sourceHeads];
    const current = findHead(heads, message);
    if (
      !current &&
      heads.length >= this.#options.policy.policy.limits.maximumSourceStreams
    )
      return rejected(state, "source_stream_capacity_exceeded");
    if (current && message.sequence <= current.sequence)
      return rejected(state, "stale_or_forked_message");
    if (
      current &&
      message.sequence === current.sequence + 1 &&
      message.predecessorDigest !== current.messageDigest
    )
      return rejected(state, "predecessor_conflict");
    if (
      !current &&
      message.sequence === 1 &&
      message.predecessorDigest !== null
    )
      return rejected(state, "genesis_predecessor_conflict");
    const pendingAtSequence = state.pending.find(
      (candidate) =>
        sameMessageStream(candidate.message, message) &&
        candidate.message.sequence === message.sequence,
    );
    if (pendingAtSequence)
      return pendingAtSequence.message.messageDigest === message.messageDigest
        ? {
            state,
            output: Object.freeze({
              status: "duplicate" as const,
              messageDigest: message.messageDigest,
            }),
          }
        : rejected(state, "pending_sequence_conflict");

    const record = Object.freeze({
      message,
      envelopeMessageId: envelope.messageId,
      envelopeSenderKeyId: envelope.proof.keyId,
      receivedAtLogicalMs: logicalTimeMs,
    });
    const isNext = current
      ? message.sequence === current.sequence + 1 &&
        message.predecessorDigest === current.messageDigest
      : message.sequence === 1 && message.predecessorDigest === null;
    if (!isNext) {
      if (
        state.pending.length >=
        this.#options.policy.policy.limits.maximumPendingMessages
      )
        return rejected(state, "pending_capacity_exceeded");
      const pending = [...state.pending, record].sort(comparePending);
      return {
        state: nextState(state, {
          logicalTimeHighWaterMs: Math.max(
            state.logicalTimeHighWaterMs,
            logicalTimeMs,
          ),
          pending,
        }),
        output: Object.freeze({
          status: "pending" as const,
          messageDigest: message.messageDigest,
          missingSequence: (current?.sequence ?? 0) + 1,
        }),
      };
    }

    const applied = applyReadyChain({
      heads,
      inbox: state.inbox,
      pending: state.pending,
      first: record,
    });
    const inbox = pruneHandled(
      applied.inbox,
      this.#options.policy.policy.limits.maximumRetainedInboxMessages,
    );
    if (
      inbox.length >
      this.#options.policy.policy.limits.maximumRetainedInboxMessages
    )
      return rejected(state, "inbox_capacity_exceeded");
    return {
      state: nextState(state, {
        logicalTimeHighWaterMs: Math.max(
          state.logicalTimeHighWaterMs,
          logicalTimeMs,
        ),
        sourceHeads: applied.heads,
        inbox,
        pending: applied.pending,
      }),
      output: Object.freeze({
        status: "accepted" as const,
        messageDigest: message.messageDigest,
      }),
    };
  }

  async #markInboxHandled(messageDigest: PlanningDigestV1): Promise<void> {
    await this.#commit((state) => {
      const index = state.inbox.findIndex(
        (record) => record.message.messageDigest === messageDigest,
      );
      if (index < 0) fail("team execution exchange inbox message disappeared");
      if (state.inbox[index]!.status === "handled")
        return { state, output: undefined };
      const inbox = state.inbox.map((record, position) =>
        position === index
          ? Object.freeze({ ...record, status: "handled" as const })
          : record,
      );
      return { state: nextState(state, { inbox }), output: undefined };
    });
  }

  async #markOutboxSent(messageDigest: PlanningDigestV1): Promise<void> {
    await this.#commit((state) => {
      const index = state.outbox.findIndex(
        (record) => record.message.messageDigest === messageDigest,
      );
      if (index < 0) fail("team execution exchange outbox message disappeared");
      if (state.outbox[index]!.status === "sent")
        return { state, output: undefined };
      const outbox = state.outbox.map((record, position) =>
        position === index
          ? Object.freeze({ ...record, status: "sent" as const })
          : record,
      );
      return { state: nextState(state, { outbox }), output: undefined };
    });
  }

  async #commit<T>(
    transition: (state: TeamExecutionExchangeStateV1) => {
      readonly state: TeamExecutionExchangeStateV1;
      readonly output: T;
    },
  ): Promise<T> {
    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1) {
      const loaded = await this.#options.store.load(this.#options.stateKey);
      const state = loaded
        ? validateTeamExecutionExchangeStateV1(loaded)
        : this.#initialState();
      this.#assertStateBinding(state);
      const result = transition(state);
      if (result.state.revision === state.revision) return result.output;
      if (
        await this.#options.store.save({
          state: result.state,
          expectedRevision: loaded ? state.revision : null,
        })
      )
        return result.output;
    }
    fail("team execution exchange commit attempts exhausted");
  }

  #initialState(): TeamExecutionExchangeStateV1 {
    return createTeamExecutionExchangeStateV1({
      stateKey: this.#options.stateKey,
      runtimeId: this.#options.runtimeId,
      runtimeVersion: this.#options.runtimeVersion,
      implementationId: this.#options.implementationId,
      localIdentity: this.#options.localIdentity,
      scope: this.#options.scope,
      policyId: this.#options.policy.policy.policyId,
      policyVersion: this.#options.policy.policy.policyVersion,
      policyDigest: this.#options.policy.policyDigest,
      streamId: this.#options.streamId,
      revision: 0,
      logicalTimeHighWaterMs: 0,
      outboundSequence: 0,
      outboundHeadDigest: null,
      sourceHeads: Object.freeze([]),
      inbox: Object.freeze([]),
      pending: Object.freeze([]),
      outbox: Object.freeze([]),
      predecessorStateDigest: null,
    });
  }

  #assertStateBinding(state: TeamExecutionExchangeStateV1): void {
    if (
      state.stateKey !== this.#options.stateKey ||
      state.runtimeId !== this.#options.runtimeId ||
      state.runtimeVersion !== this.#options.runtimeVersion ||
      state.implementationId !== this.#options.implementationId ||
      state.policyId !== this.#options.policy.policy.policyId ||
      state.policyVersion !== this.#options.policy.policy.policyVersion ||
      state.policyDigest !== this.#options.policy.policyDigest ||
      state.scope.scopeDigest !== this.#options.scope.scopeDigest ||
      state.streamId !== this.#options.streamId ||
      state.localIdentity.peerId !== this.#options.localIdentity.peerId ||
      state.localIdentity.instanceId !==
        this.#options.localIdentity.instanceId ||
      state.localIdentity.memberId !== this.#options.localIdentity.memberId ||
      state.localIdentity.memberBindingDigest !==
        this.#options.localIdentity.memberBindingDigest
    )
      fail("team execution exchange state binding is invalid");
    const limits = this.#options.policy.policy.limits;
    if (
      state.sourceHeads.length > limits.maximumSourceStreams ||
      state.pending.length > limits.maximumPendingMessages ||
      state.inbox.length > limits.maximumRetainedInboxMessages ||
      state.outbox.length > limits.maximumRetainedOutboxMessages
    )
      fail("team execution exchange state exceeds local policy");
    const streamKeys = state.sourceHeads.map(
      (head) =>
        `${head.streamId}\u0000${head.senderPeerId}\u0000${head.senderInstanceId}`,
    );
    if (new Set(streamKeys).size !== streamKeys.length)
      fail("team execution exchange source heads conflict");
    const inboundIds = [...state.inbox, ...state.pending].map(
      (record) => record.message.messageId,
    );
    if (new Set(inboundIds).size !== inboundIds.length)
      fail("team execution exchange inbound identities conflict");
    const outboundIds = state.outbox.map((record) => record.message.messageId);
    if (new Set(outboundIds).size !== outboundIds.length)
      fail("team execution exchange outbound identities conflict");
    const latestOutbound = state.outbox.at(-1)?.message;
    if (
      (state.outboundSequence === 0) !== (state.outboundHeadDigest === null) ||
      (latestOutbound !== undefined &&
        (latestOutbound.sequence !== state.outboundSequence ||
          latestOutbound.messageDigest !== state.outboundHeadDigest))
    )
      fail("team execution exchange outbound head is invalid");
    for (const pending of state.pending) {
      const head = findHead(state.sourceHeads, pending.message);
      if (head && pending.message.sequence <= head.sequence)
        fail("team execution exchange pending record is stale");
    }
  }

  #assertInboundBinding(
    message: TeamExecutionExchangeMessageV1,
    logicalTimeMs: number,
  ): void {
    if (
      message.scope.scopeDigest !== this.#options.scope.scopeDigest ||
      message.policyDigest !== this.#options.policy.policyDigest ||
      message.recipient.peerId !== this.#options.localIdentity.peerId ||
      message.recipient.memberId !== this.#options.localIdentity.memberId ||
      message.recipient.memberBindingDigest !==
        this.#options.localIdentity.memberBindingDigest
    )
      fail("message_scope_or_recipient_mismatch");
    if (message.validUntilLogicalMs <= logicalTimeMs) fail("message_expired");
    if (
      message.createdAtLogicalMs >
      logicalTimeMs + this.#options.policy.policy.limits.maximumFutureSkewMs
    )
      fail("message_from_future");
    if (
      message.validUntilLogicalMs - message.createdAtLogicalMs >
      this.#options.policy.policy.limits.maximumMessageTtlMs
    )
      fail("message_ttl_exceeded");
  }
}

function validMembershipDecision(
  decision: TeamExecutionExchangeMembershipDecisionV1,
  message: TeamExecutionExchangeMessageV1,
  logicalTimeMs: number,
): boolean {
  return Boolean(
    decision &&
    decision.authorized === true &&
    typeof decision.reasonCode === "string" &&
    decision.peerId === message.sender.peerId &&
    decision.instanceId === message.sender.instanceId &&
    decision.memberId === message.sender.memberId &&
    decision.memberBindingDigest === message.sender.memberBindingDigest &&
    decision.membershipEpoch === message.membershipEpoch &&
    decision.membershipConfigurationDigest ===
      message.membershipConfigurationDigest &&
    Number.isSafeInteger(decision.validUntilLogicalMs) &&
    decision.validUntilLogicalMs > logicalTimeMs &&
    typeof decision.decisionDigest === "string" &&
    DIGEST.test(decision.decisionDigest),
  );
}

function applyReadyChain(input: {
  heads: TeamExecutionExchangeSourceHeadV1[];
  inbox: readonly TeamExecutionExchangeInboxRecordV1[];
  pending: readonly TeamExecutionExchangePendingRecordV1[];
  first: TeamExecutionExchangePendingRecordV1;
}): {
  heads: readonly TeamExecutionExchangeSourceHeadV1[];
  inbox: readonly TeamExecutionExchangeInboxRecordV1[];
  pending: readonly TeamExecutionExchangePendingRecordV1[];
} {
  const heads = [...input.heads];
  const inbox = [...input.inbox];
  const pending = [...input.pending];
  let current: TeamExecutionExchangePendingRecordV1 | undefined = input.first;
  while (current) {
    const message = current.message;
    const head = Object.freeze({
      streamId: message.streamId,
      senderPeerId: message.sender.peerId,
      senderInstanceId: message.sender.instanceId,
      sequence: message.sequence,
      messageDigest: message.messageDigest,
    });
    const index = heads.findIndex((value) => sameStream(value, message));
    if (index < 0) heads.push(head);
    else heads[index] = head;
    inbox.push(Object.freeze({ ...current, status: "ready" as const }));
    const nextIndex = pending.findIndex(
      (record) =>
        sameMessageStream(record.message, message) &&
        record.message.sequence === message.sequence + 1 &&
        record.message.predecessorDigest === message.messageDigest,
    );
    current = nextIndex < 0 ? undefined : pending.splice(nextIndex, 1)[0];
  }
  return {
    heads: Object.freeze(heads),
    inbox: Object.freeze(inbox),
    pending: Object.freeze(pending),
  };
}

function nextState(
  state: TeamExecutionExchangeStateV1,
  patch: Partial<
    Omit<
      TeamExecutionExchangeStateV1,
      "format" | "schemaVersion" | "stateDigest"
    >
  >,
): TeamExecutionExchangeStateV1 {
  return createTeamExecutionExchangeStateV1({
    stateKey: state.stateKey,
    runtimeId: state.runtimeId,
    runtimeVersion: state.runtimeVersion,
    implementationId: state.implementationId,
    localIdentity: state.localIdentity,
    scope: state.scope,
    policyId: state.policyId,
    policyVersion: state.policyVersion,
    policyDigest: state.policyDigest,
    streamId: state.streamId,
    revision: state.revision + 1,
    logicalTimeHighWaterMs: state.logicalTimeHighWaterMs,
    outboundSequence: state.outboundSequence,
    outboundHeadDigest: state.outboundHeadDigest,
    sourceHeads: state.sourceHeads,
    inbox: state.inbox,
    pending: state.pending,
    outbox: state.outbox,
    predecessorStateDigest: state.stateDigest,
    ...patch,
  });
}

function findHead(
  heads: readonly TeamExecutionExchangeSourceHeadV1[],
  message: TeamExecutionExchangeMessageV1,
): TeamExecutionExchangeSourceHeadV1 | undefined {
  return heads.find((head) => sameStream(head, message));
}

function sameStream(
  head: TeamExecutionExchangeSourceHeadV1,
  message: TeamExecutionExchangeMessageV1,
): boolean {
  return (
    head.streamId === message.streamId &&
    head.senderPeerId === message.sender.peerId &&
    head.senderInstanceId === message.sender.instanceId
  );
}

function sameMessageStream(
  left: TeamExecutionExchangeMessageV1,
  right: TeamExecutionExchangeMessageV1,
): boolean {
  return (
    left.streamId === right.streamId &&
    left.sender.peerId === right.sender.peerId &&
    left.sender.instanceId === right.sender.instanceId
  );
}

function comparePending(
  left: TeamExecutionExchangePendingRecordV1,
  right: TeamExecutionExchangePendingRecordV1,
): number {
  return (
    left.message.streamId.localeCompare(right.message.streamId) ||
    left.message.sender.peerId.localeCompare(right.message.sender.peerId) ||
    left.message.sender.instanceId.localeCompare(
      right.message.sender.instanceId,
    ) ||
    left.message.sequence - right.message.sequence
  );
}

function pruneHandled(
  inbox: readonly TeamExecutionExchangeInboxRecordV1[],
  maximum: number,
): readonly TeamExecutionExchangeInboxRecordV1[] {
  const result = [...inbox];
  while (result.length > maximum) {
    const index = result.findIndex((record) => record.status === "handled");
    if (index < 0) break;
    result.splice(index, 1);
  }
  return Object.freeze(result);
}

function pruneSent<T extends { readonly status: "pending" | "sent" }>(
  outbox: readonly T[],
  maximum: number,
): readonly T[] {
  const result = [...outbox];
  while (result.length > maximum) {
    const index = result.findIndex((record) => record.status === "sent");
    if (index < 0) break;
    result.splice(index, 1);
  }
  return Object.freeze(result);
}

function rejected(
  state: TeamExecutionExchangeStateV1,
  reasonCode: string,
): {
  state: TeamExecutionExchangeStateV1;
  output: TeamExecutionExchangeAdmissionOutcomeV1;
} {
  return {
    state,
    output: Object.freeze({ status: "rejected" as const, reasonCode }),
  };
}

function reason(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) return fallback;
  return (
    error.message
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "_")
      .replace(/^_+|_+$/gu, "")
      .slice(0, 128) || fallback
  );
}

function identifier(input: unknown, label: string): string {
  if (typeof input !== "string" || !IDENTIFIER.test(input))
    fail(`${label} is invalid`);
  return input;
}

function nonNegative(input: unknown, label: string): number {
  if (!Number.isSafeInteger(input) || (input as number) < 0)
    fail(`${label} is invalid`);
  return input as number;
}

function positive(input: unknown, label: string): number {
  if (!Number.isSafeInteger(input) || (input as number) <= 0)
    fail(`${label} is invalid`);
  return input as number;
}

function fail(message: string): never {
  throw new TypeError(message);
}
