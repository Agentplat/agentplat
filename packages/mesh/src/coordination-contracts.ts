import type { MeshMessagePayload } from '@agentplat/mesh-protocol';

import type { MeshLogicalTime, MeshPeerIdentity } from './contracts.js';

/** Structurally implemented records owned by coordination workflows. */
export type MeshCoordinationRecordType = Exclude<
  MeshMessagePayload['type'],
  'peer.hello' | 'peer.ping' | 'peer.ping_ack'
>;

/** Redacted identity for one accepted coordination record. */
export interface MeshCoordinationDomainRecord {
  readonly recordKey: string;
  readonly recordType: MeshCoordinationRecordType;
  readonly recordId: string;
  readonly contentDigest: string;
  readonly messageId: string;
  readonly acceptedAt: MeshLogicalTime;
}

/** Trusted timer kinds used by coordination state machines. */
export type MeshCoordinationTimerKind =
  | 'capability.expiry'
  | 'objective.expiry'
  | 'work.bid_deadline'
  | 'work.acceptance_deadline'
  | 'lease.expiry'
  | 'recovery.grace';

/** One generation-fenced timer driven only by injected logical time. */
export interface MeshCoordinationTimer {
  readonly timerId: string;
  readonly kind: MeshCoordinationTimerKind;
  readonly dueAt: MeshLogicalTime;
  readonly generation: number;
  readonly domainRecordKey: string;
}

/** Bounded, redacted local decision history. */
export interface MeshCoordinationJournalEntry {
  readonly sequence: number;
  readonly occurredAt: MeshLogicalTime;
  readonly kind:
    'domain.accepted' | 'domain.rejected' | 'timer.fired' | 'command.accepted';
  readonly domainRecordKey?: string;
  readonly timerId?: string;
  readonly reasonCode?: string;
}

/** Hard local ceilings for non-evictable coordination security state. */
export interface MeshCoordinationLimits {
  readonly maximumDomainRecords: number;
  readonly maximumTimers: number;
  readonly maximumJournalEntries: number;
}

/**
 * Additive coordination snapshot. The Alpha 1 peer state remains a separate,
 * unchanged contract and can continue to run without this subpath.
 */
export interface MeshCoordinationState {
  readonly schemaVersion: 1;
  readonly identity: MeshPeerIdentity;
  readonly domainRecords: Readonly<
    Record<string, MeshCoordinationDomainRecord>
  >;
  readonly timers: Readonly<Record<string, MeshCoordinationTimer>>;
  readonly journal: readonly MeshCoordinationJournalEntry[];
  readonly limits: MeshCoordinationLimits;
  readonly localEventSequence: number;
  readonly lastLogicalTime: MeshLogicalTime;
}

/** Options for a new empty coordination snapshot. */
export interface MeshCoordinationStateOptions {
  readonly identity: MeshPeerIdentity;
  readonly limits?: Partial<MeshCoordinationLimits>;
}

/** Delivers one trusted logical timer generation to the pure evaluator. */
export interface MeshCoordinationTimerFiredInput {
  readonly kind: 'timer.fired';
  readonly timerId: string;
  readonly generation: number;
}

/** Stable fail-closed outcomes for an unconsumed trusted timer input. */
export type MeshCoordinationTimerRejectionCode =
  | 'timer_unknown'
  | 'timer_generation_stale'
  | 'timer_not_due'
  | 'journal_capacity_exceeded';

/** Result of evaluating one trusted timer generation. */
export type MeshCoordinationTimerDecision =
  | {
      readonly accepted: true;
      readonly timer: MeshCoordinationTimer;
      readonly state: MeshCoordinationState;
    }
  | {
      readonly accepted: false;
      readonly code: MeshCoordinationTimerRejectionCode;
      readonly state: MeshCoordinationState;
    };
