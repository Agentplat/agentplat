import type { JsonObject } from "@agentplat/core";
import type { AgentRoomPlanStep } from "./planner-bridge.js";
import type { RoomConversationReference } from "./conversations.js";
import type {
  SharedBudgetAdmissionV1,
  SharedBudgetReservationV1,
} from "./shared-budgets.js";

export interface RoomPlannerScope {
  tenantId: string;
  roomId: string;
}
/** A host-resolved owner policy grant. Connector payloads cannot provide this authority. */
export interface PlannerInitiativeAdmissionV1 {
  ownerId: string;
  policyRef: string;
  policyRevision: number;
  subject: { id: string; revision: number };
  trigger: {
    kind: "new" | "changed" | "deadline" | "blocked";
    eventId: string;
    milestone?: string;
  };
  evidenceRefs: string[];
  /** Immutable host binding, e.g. connection ID and grant generation. Never model supplied. */
  source?: JsonObject;
  scope: {
    roomIds: string[];
    allowedReadTools: string[];
    maximumCalls: number;
    maximumReadCalls: number;
    maximumCostMicros: number;
    /** Trigger freshness deadline, distinct from the admitted execution window. */
    expiresAt: string;
    maximumDurationMs: number;
  };
  output: "evidence_and_action_draft";
}
export interface PlannerInitiativeObservationInputV1 {
  id: string;
  admission: PlannerInitiativeAdmissionV1;
  eligible: boolean;
  reason: string;
}
/** Stored in the existing Planner CAS state, never an independent work queue. */
export interface PlannerInitiativeObservationV1 extends PlannerInitiativeObservationInputV1 {
  observedAt: string;
  status: "eligible" | "suppressed" | "selected";
  selectedAt?: string;
  startedAt?: string;
  executionExpiresAt?: string;
  /** Atomic claims survive failures, lease expiry and restart. */
  readClaims: {
    operationId: string;
    tool: string;
    roomId: string;
    at: string;
  }[];
  stopReason?: string;
}
export interface PlannerInitiativePortV1 {
  /** Dedicated sandbox adapters; generic Room execution is never used for initiatives. */
  propose(
    context: RoomPlannerContext,
    call: RoomPlannerCall,
  ): Promise<{ proposal: RoomPlannerProposal; usage: RoomPlannerUsage }>;
  execute(
    scope: RoomPlannerScope,
    task: RoomPlannerTask,
    objective: RoomPlannerObjective,
    call: RoomPlannerCall,
  ): Promise<{ result: RoomPlannerTaskResult; usage: RoomPlannerUsage }>;
  verify(
    scope: RoomPlannerScope,
    objective: RoomPlannerObjective,
    results: RoomPlannerOperation[],
    call: RoomPlannerCall,
  ): Promise<{ review: RoomPlannerReview; usage: RoomPlannerUsage }>;

  /** Deterministic current eligibility from host storage. Must never call inference or connectors. */
  resolve(
    scope: RoomPlannerScope,
    id: string,
  ): Promise<PlannerInitiativeObservationInputV1>;
  /** Revalidate owner policy, subject revision/state, all source grants and stop controls. */
  assertCurrent(
    scope: RoomPlannerScope,
    admission: PlannerInitiativeAdmissionV1,
    phase: "admit" | "call" | "read" | "publish",
  ): Promise<void>;
}
export interface RoomPlannerUsage {
  costMicros: number;
  inputTokens: number;
  outputTokens: number;
}
export interface RoomPlannerEvidence {
  reference: string;
  version: string;
  sourceIds: string[];
}
export interface RoomPlannerCriterion {
  id: string;
  description: string;
}
export interface RoomPlannerTask extends RoomConversationReference {
  id: string;
  participantId: string;
  instruction: string;
  expectedOutput: string;
  dependencies: string[];
  actionLevel: "read" | "draft";
}
export interface RoomPlannerPlan extends RoomConversationReference {
  id: string;
  version: number;
  predecessorId?: string;
  tasks: RoomPlannerTask[];
  sourceEventId: string;
}
export interface RoomPlannerObjective extends RoomConversationReference {
  initiativeId?: string;
  id: string;
  revision: number;
  controlRevision: number;
  originalRequest: string;
  title: string;
  criteria: RoomPlannerCriterion[];
  constraints: string[];
  priority: number;
  status: "active" | "waiting" | "paused" | "canceled" | "completed";
  plans: RoomPlannerPlan[];
  activePlanId: string;
  corrections: { eventId: string; instruction: string }[];
  noProgressCycles: number;
  reviewFailures?: number;
}
export interface RoomPlannerTaskResult {
  kind: "result" | "blocked" | "proposal" | "challenge";
  content: string;
  evidence: RoomPlannerEvidence[];
}
export interface RoomPlannerReview {
  evidence: RoomPlannerEvidence;
  reviewerParticipantId: string;
  criteria: {
    criterionId: string;
    verdict: "met" | "unmet" | "unknown";
    explanation: string;
  }[];
}
export interface RoomPlannerEvent extends RoomConversationReference {
  /** Engine-owned binding; acceptEvent rejects external attempts to supply it. */
  initiativeId?: string;
  id: string;
  kind: "message" | "result" | "specialist" | "resume" | "external" | "timer";
  /** Actual persisted message ID, if event identity differs; required for threaded human messages. */
  messageId?: string;
  /** Connector/timer provenance is evidence, never an owner instruction or execution grant. */
  provenance?: { source: string; eventId: string; occurredAt: string };
  actorId: string;
  content: string;
  objectiveId?: string;
  targetParticipantIds?: string[];
  /** References are data, never instructions or authority. */
  references?: string[];
  /** A persisted verifier outcome, not an owner instruction. */
  review?: RoomPlannerReview;
}
export type RoomPlannerProposal =
  | {
      kind: "respond" | "clarify" | "wait" | "suggest";
      content: string;
      objectiveId?: string;
    }
  | {
      kind: "plan";
      objectiveId: string;
      expectedObjectiveRevision: number | null;
      title: string;
      criteria: RoomPlannerCriterion[];
      constraints: string[];
      tasks: RoomPlannerTask[];
      content: string;
    }
  | {
      kind: "complete";
      objectiveId: string;
      expectedObjectiveRevision: number;
      content: string;
    };
export interface RoomPlannerContext {
  scope: RoomPlannerScope;
  event: RoomPlannerEvent;
  objectives: RoomPlannerObjective[];
  /** Host must filter by current access and identify untrusted source content. */
  authorizedContext: JsonObject;
  /** Engine-owned progress, kept separate from specialist claims inside result content. */
  reviews?: {
    objectiveId: string;
    planId: string;
    review: RoomPlannerReview;
  }[];
  progress?: {
    objectiveId: string;
    planId: string;
    taskId: string;
    status: "pending" | "running" | "completed" | "rejected" | "uncertain";
    resultKind?: RoomPlannerTaskResult["kind"];
    evidence?: RoomPlannerEvidence[];
    error?: string;
  }[];
  /** Bounded feedback from rejected interpretations of this same persisted user event. */
  feedback?: { proposal?: RoomPlannerProposal; reason: string }[];
}
export interface RoomPlannerCall extends RoomConversationReference {
  initiative?: PlannerInitiativeAdmissionV1;
  /** Initiative model sink: one dispatch per journaled operation; a second claim is rejected. */
  assertModelCall?(): Promise<void>;
  /** Required at every initiative source-read sink; claims an attempt before dispatch. */
  assertRead?(tool: string, roomId: string): Promise<void>;
  operationId: string;
  signal?: AbortSignal;
  /** Recheck immediately before each protected effect; hosts must connect this at the effect sink. */
  assertCurrent(): Promise<void>;
}
export interface RoomPlannerReasoner {
  propose(
    context: RoomPlannerContext,
    call: RoomPlannerCall,
  ): Promise<{ proposal: RoomPlannerProposal; usage: RoomPlannerUsage }>;
}
export interface RoomPlannerOperation extends RoomConversationReference {
  initiativeId?: string;
  modelClaimedAt?: string;
  id: string;
  kind: "reason" | "task" | "review" | "direct";
  status: "running" | "completed" | "uncertain" | "rejected";
  admissionMode?: "observe" | "execute";
  /** Objective versions actually supplied to the reasoner, not a later host snapshot. */
  objectiveBindings?: {
    objectiveId: string;
    revision: number;
    controlRevision: number;
    planId: string;
  }[];
  reservedMicros: number;
  usage?: RoomPlannerUsage;
  startedAt: string;
  expiresAt: string;
  eventId?: string;
  objectiveId?: string;
  planId?: string;
  taskId?: string;
  participantId?: string;
  controlRevision?: number;
  objectiveRevision?: number;
  result?: RoomPlannerTaskResult;
  review?: RoomPlannerReview;
  proposal?: RoomPlannerProposal;
  error?: string;
  retryablePlan?: boolean;
  /** Admission preparation survives a crash without guessing that inference did not run. */
  sharedBudgetPending?: boolean;
  sharedBudget?: SharedBudgetReservationV1;
}
export interface RoomPlannerDecision {
  id: string;
  eventId: string;
  proposal: RoomPlannerProposal;
  disposition: "applied" | "observed" | "rejected";
  reason?: string;
}
export interface RoomPlannerState extends RoomPlannerScope {
  schemaVersion: 1;
  revision: number;
  mode: "observe" | "execute" | "drain";
  concurrency: number;
  budgetLimitMicros: number;
  /** Once configured, this host budget binding must remain connected before calls can run. */
  sharedBudgetBinding?: string;
  sharedBudgetBlock?: { reason: string; at: string };
  initiatives?: PlannerInitiativeObservationV1[];
  objectives: RoomPlannerObjective[];
  events: RoomPlannerEvent[];
  /** Internal receipts already made obsolete by a terminal objective; payloads remain immutable. */
  handledEventIds?: string[];
  operations: RoomPlannerOperation[];
  decisions: RoomPlannerDecision[];
  /** Durable communication outbox. Delivery must deduplicate id. */
  notifications: {
    id: string;
    content: string;
    objectiveId?: string;
    participantId?: string;
    delivered: boolean;
    initiativeId?: string;
    suppressedReason?: string;
    threadId?: string;
    replyToMessageId?: string;
  }[];
  lastScheduledObjectiveId?: string;
}
export interface RoomPlannerStore {
  load(scope: RoomPlannerScope): Promise<RoomPlannerState | undefined>;
  compareAndSet(
    expectedRevision: number | null,
    state: RoomPlannerState,
  ): Promise<boolean>;
  list(): Promise<RoomPlannerScope[]>;
}
export interface RoomPlannerPorts {
  store: RoomPlannerStore;
  sharedBudget?: RoomPlannerSharedBudgetPortV1;
  initiatives?: PlannerInitiativePortV1;
  reasoner: RoomPlannerReasoner;
  /** Validate whole-plan constraints before creating any objective or work. */
  admitPlan?(
    scope: RoomPlannerScope,
    proposal: Extract<RoomPlannerProposal, { kind: "plan" }>,
  ): Promise<
    { allowed: true } | { allowed: false; reason: string; retryable: boolean }
  >;
  /** Must verify current identity, membership, Room status and action-specific authority. */
  authorize(
    scope: RoomPlannerScope,
    action: string,
    subject?: string,
  ): Promise<void>;
  resolveEvent(
    scope: RoomPlannerScope,
    eventId: string,
  ): Promise<RoomPlannerEvent>;
  /** Required for native conversation references; resolve and authorize them from owned storage. */
  resolveConversation?(
    scope: RoomPlannerScope,
    reference: RoomConversationReference,
  ): Promise<RoomConversationReference>;
  context(
    scope: RoomPlannerScope,
    event: RoomPlannerEvent,
  ): Promise<JsonObject>;
  route(scope: RoomPlannerScope, event: RoomPlannerEvent): Promise<string[]>;
  execute(
    scope: RoomPlannerScope,
    task: RoomPlannerTask,
    objective: RoomPlannerObjective | undefined,
    call: RoomPlannerCall,
  ): Promise<{ result: RoomPlannerTaskResult; usage: RoomPlannerUsage }>;
  verify(
    scope: RoomPlannerScope,
    objective: RoomPlannerObjective,
    results: RoomPlannerOperation[],
    call: RoomPlannerCall,
  ): Promise<{ review: RoomPlannerReview; usage: RoomPlannerUsage }>;
  /** Idempotent and fenced workflow reconciliation; must not issue a fresh model call. */
  reconcile?(
    scope: RoomPlannerScope,
    operation: RoomPlannerOperation,
  ): Promise<
    | {
        usage: RoomPlannerUsage;
        result?: RoomPlannerTaskResult;
        review?: RoomPlannerReview;
        proposal?: RoomPlannerProposal;
      }
    | undefined
  >;
  deliver(
    scope: RoomPlannerScope,
    notification: RoomPlannerState["notifications"][number],
  ): Promise<void>;
  materialize?(
    scope: RoomPlannerScope,
    objective: RoomPlannerObjective,
    plan: RoomPlannerPlan,
    steps: AgentRoomPlanStep[],
  ): Promise<void>;
  cancel?(
    scope: RoomPlannerScope,
    operation: RoomPlannerOperation,
  ): Promise<void>;
  clock?: () => Date;
  reservationMicros: {
    reason: number;
    task: number;
    review: number;
    direct: number;
  };
  leaseMs?: number;
}

export interface RoomPlannerSharedBudgetPortV1 {
  bindingId: string;
  admit(
    scope: RoomPlannerScope,
    operation: RoomPlannerOperation,
  ): Promise<SharedBudgetAdmissionV1>;
  assertCurrent(
    scope: RoomPlannerScope,
    operation: RoomPlannerOperation,
  ): Promise<void>;
  settle(
    scope: RoomPlannerScope,
    operation: RoomPlannerOperation,
    usage: RoomPlannerUsage,
  ): Promise<void>;
  uncertain(
    scope: RoomPlannerScope,
    operation: RoomPlannerOperation,
  ): Promise<void>;
}

/** Optional future extension. Lessons remain advisory and cannot alter authority. */
export interface RoomPlannerLessonsPort {
  retrieve(
    scope: RoomPlannerScope,
    objectiveId: string,
  ): Promise<
    {
      id: string;
      content: string;
      provenance: string[];
      status: "provisional" | "eligible" | "superseded";
    }[]
  >;
}

/** Known provider usage survives invalid model output so it is charged rather than retried. */
export class RoomPlannerCallError extends Error {
  constructor(
    message: string,
    readonly usage: RoomPlannerUsage,
    readonly retryableReasoning = false,
  ) {
    super(message);
  }
}
