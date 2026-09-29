import { AgentPlatError } from "@agentplat/core";
import type { JsonValue } from "@agentplat/core";
import type { RoomState } from "./models.js";
import {
  governanceDigestV1,
  validateGovernancePageV1,
  type AgentGovernancePrincipalV1,
  type AgentGovernanceStoreV1,
} from "./agent-governance.js";

export type InceptionDispositionV1 =
  "adopted" | "reformulated" | "rejected" | "needs_evidence" | "deferred";
export interface InceptionGovernanceBindingV1 {
  governanceId: string;
  revision: number;
  authorityEpoch: number;
  configurationDigest: string;
  definitionRevisionId: string;
}
export type InceptionEvidenceReferenceV1 =
  | { kind: "message"; id: string }
  | { kind: "artifact"; id: string; versionId: string };
export interface AgentInceptionV1 {
  schemaVersion: 1;
  tenantId: string;
  agentId: string;
  roomId: string;
  inceptionId: string;
  submittedBy: string;
  sourceMessageId: string;
  sourceAuthorParticipantId: string | null;
  sourceRole: string;
  content: string;
  contentDigest: string;
  governance: InceptionGovernanceBindingV1;
  requestDigest: string;
  receivedAt: string;
}
export interface InceptionAssessmentV1 {
  schemaVersion: 1;
  tenantId: string;
  agentId: string;
  roomId: string;
  inceptionId: string;
  assessmentId: string;
  revision: number;
  previousAssessmentDigest: string | null;
  assessedBy: string;
  evaluatorRef: string;
  governance: InceptionGovernanceBindingV1;
  disposition: InceptionDispositionV1;
  explanation: string;
  uncertainty: string;
  reformulation: string | null;
  evidence: Array<{ reference: InceptionEvidenceReferenceV1; digest: string }>;
  /** Inert proposals, not executable Room tasks, grants or approvals. */
  proposedWork: Array<{ proposalId: string; description: string }>;
  executionAuthorized: false;
  requestDigest: string;
  assessmentDigest: string;
  assessedAt: string;
}
export interface SubmitAgentInceptionV1 {
  agentId: string;
  roomId: string;
  inceptionId: string;
  sourceMessageId: string;
  expectedGovernanceRevision: number;
}
export interface AssessAgentInceptionV1 {
  agentId: string;
  roomId: string;
  inceptionId: string;
  assessmentId: string;
  expectedGovernanceRevision: number;
  expectedAssessmentRevision: number;
  evaluatorRef: string;
  disposition: InceptionDispositionV1;
  explanation: string;
  uncertainty: string;
  reformulation: string | null;
  evidence: InceptionEvidenceReferenceV1[];
  proposedWork: Array<{ proposalId: string; description: string }>;
}
/** Host verifies credentials and permissions separately for intake, assessment and reads. */
export interface AgentInceptionAccessV1<Context> {
  authenticate(context: Context): Promise<AgentGovernancePrincipalV1 | null>;
  authorize(
    principal: AgentGovernancePrincipalV1,
    request: {
      agentId: string;
      roomId: string;
      inceptionId: string;
      evaluatorRef?: string;
      operation: "submit" | "assess" | "read";
      references: InceptionEvidenceReferenceV1[];
    },
  ): Promise<boolean>;
}
/** Writes MUST check the current governance fence atomically with insertion/CAS. */
export interface AgentInceptionStoreV1 {
  get(
    tenantId: string,
    agentId: string,
    inceptionId: string,
  ): Promise<AgentInceptionV1 | undefined>;
  assessment(
    tenantId: string,
    agentId: string,
    inceptionId: string,
    assessmentId: string,
  ): Promise<InceptionAssessmentV1 | undefined>;
  latest(
    tenantId: string,
    agentId: string,
    inceptionId: string,
  ): Promise<InceptionAssessmentV1 | undefined>;
  history(
    tenantId: string,
    agentId: string,
    inceptionId: string,
    afterRevision: number,
    limit: number,
  ): Promise<InceptionAssessmentV1[]>;
  insert(inception: AgentInceptionV1): Promise<boolean>;
  append(assessment: InceptionAssessmentV1): Promise<boolean>;
}

export class InMemoryAgentInceptionStoreV1 implements AgentInceptionStoreV1 {
  private inputs = new Map<string, AgentInceptionV1>();
  private assessments = new Map<string, InceptionAssessmentV1>();
  private heads = new Map<string, InceptionAssessmentV1>();
  /** A synchronous fence check guarantees no interleaving before this memory commit. */
  constructor(
    private readonly governance: {
      matchesInceptionFence(
        tenantId: string,
        agentId: string,
        binding: InceptionGovernanceBindingV1,
      ): boolean;
    },
  ) {}
  async get(t: string, a: string, i: string) {
    return copy(this.inputs.get(key(t, a, i)));
  }
  async assessment(t: string, a: string, i: string, id: string) {
    return copy(this.assessments.get(key(t, a, i, id)));
  }
  async latest(t: string, a: string, i: string) {
    return copy(this.heads.get(key(t, a, i)));
  }
  async history(t: string, a: string, i: string, after: number, limit: number) {
    validateGovernancePageV1(after, limit);
    return copy(
      [...this.assessments.values()]
        .filter(
          (x) =>
            x.tenantId === t &&
            x.agentId === a &&
            x.inceptionId === i &&
            x.revision > after,
        )
        .sort((x, y) => x.revision - y.revision)
        .slice(0, limit),
    );
  }
  async insert(input: AgentInceptionV1) {
    const k = key(input.tenantId, input.agentId, input.inceptionId);
    if (
      this.inputs.has(k) ||
      !this.governance.matchesInceptionFence(
        input.tenantId,
        input.agentId,
        input.governance,
      )
    )
      return false;
    this.inputs.set(k, copy(input));
    return true;
  }
  async append(input: InceptionAssessmentV1) {
    validateInceptionAssessmentRecordV1(input);
    const k = key(input.tenantId, input.agentId, input.inceptionId);
    const inception = this.inputs.get(k),
      latest = this.heads.get(k);
    if (
      !inception ||
      inception.roomId !== input.roomId ||
      input.revision !== (latest?.revision ?? -1) + 1 ||
      input.previousAssessmentDigest !== (latest?.assessmentDigest ?? null) ||
      this.assessments.has(
        key(
          input.tenantId,
          input.agentId,
          input.inceptionId,
          input.assessmentId,
        ),
      ) ||
      !this.governance.matchesInceptionFence(
        input.tenantId,
        input.agentId,
        input.governance,
      )
    )
      return false;
    this.assessments.set(
      key(input.tenantId, input.agentId, input.inceptionId, input.assessmentId),
      copy(input),
    );
    this.heads.set(k, copy(input));
    return true;
  }
}

export class AgentInceptionServiceV1<Context> {
  constructor(
    private readonly store: AgentInceptionStoreV1,
    private readonly governance: Pick<AgentGovernanceStoreV1, "load">,
    private readonly rooms: {
      getRoomState(tenantId: string, roomId: string): Promise<RoomState>;
    },
    private readonly access: AgentInceptionAccessV1<Context>,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async submit(
    context: Context,
    input: SubmitAgentInceptionV1,
  ): Promise<AgentInceptionV1> {
    const r = copy(input);
    exact(r, [
      "agentId",
      "roomId",
      "inceptionId",
      "sourceMessageId",
      "expectedGovernanceRevision",
    ]);
    ids(r.agentId, r.roomId, r.inceptionId, r.sourceMessageId);
    integer(r.expectedGovernanceRevision, 0);
    const p = await this.principal(context, r, "submit", [
      { kind: "message", id: r.sourceMessageId },
    ]);
    const requestDigest = await digest({ principal: p, submit: r });
    const previous = await this.store.get(p.tenantId, r.agentId, r.inceptionId);
    if (previous) return replay(previous, requestDigest);
    const governance = await this.binding(
      p.tenantId,
      r.agentId,
      r.expectedGovernanceRevision,
    );
    const state = await this.room(p.tenantId, r.agentId, r.roomId);
    const message = state.messages.find(
      (x) =>
        x.id === r.sourceMessageId &&
        x.roomId === r.roomId &&
        x.tenantId === p.tenantId,
    );
    if (!message) missing();
    text(message.content, 64000);
    const record: AgentInceptionV1 = {
      schemaVersion: 1,
      tenantId: p.tenantId,
      agentId: r.agentId,
      roomId: r.roomId,
      inceptionId: r.inceptionId,
      submittedBy: p.subjectId,
      sourceMessageId: message.id,
      sourceAuthorParticipantId: message.authorParticipantId ?? null,
      sourceRole: message.role,
      content: message.content,
      contentDigest: await digest({ content: message.content }),
      governance,
      requestDigest,
      receivedAt: this.clock().toISOString(),
    };
    if (!(await this.store.insert(record))) {
      const raced = await this.store.get(p.tenantId, r.agentId, r.inceptionId);
      if (raced) return replay(raced, requestDigest);
      conflict();
    }
    return copy(record);
  }
  async assess(
    context: Context,
    input: AssessAgentInceptionV1,
  ): Promise<InceptionAssessmentV1> {
    const r = copy(input);
    validateAssessmentInput(r);
    const p = await this.principal(context, r, "assess", r.evidence);
    const requestDigest = await digest({ principal: p, assessment: r });
    const prior = await this.store.assessment(
      p.tenantId,
      r.agentId,
      r.inceptionId,
      r.assessmentId,
    );
    if (prior) return replay(prior, requestDigest);
    const inception = await this.requireInception(p.tenantId, r);
    const governance = await this.binding(
      p.tenantId,
      r.agentId,
      r.expectedGovernanceRevision,
    );
    const latest = await this.store.latest(
      p.tenantId,
      r.agentId,
      r.inceptionId,
    );
    if ((latest?.revision ?? -1) !== r.expectedAssessmentRevision) conflict();
    const assessedAt = this.clock().toISOString();
    if (assessedAt < (latest?.assessedAt ?? inception.receivedAt)) conflict();
    const state = await this.room(p.tenantId, r.agentId, r.roomId);
    const evidence = [];
    for (const reference of r.evidence) {
      if (reference.kind === "message") {
        const item = state.messages.find(
          (x) =>
            x.id === reference.id &&
            x.tenantId === p.tenantId &&
            x.roomId === r.roomId,
        );
        if (!item) missing();
        evidence.push({ reference, digest: await digest(item) });
      } else {
        const artifact = state.artifacts.find(
          (x) =>
            x.id === reference.id &&
            x.tenantId === p.tenantId &&
            x.roomId === r.roomId,
        );
        const version = artifact?.versions.find(
          (x) =>
            x.id === reference.versionId &&
            x.artifactId === reference.id &&
            x.tenantId === p.tenantId,
        );
        if (!version) missing();
        evidence.push({ reference, digest: await digest(version) });
      }
    }
    const body = {
      schemaVersion: 1 as const,
      tenantId: p.tenantId,
      agentId: r.agentId,
      roomId: r.roomId,
      inceptionId: r.inceptionId,
      assessmentId: r.assessmentId,
      revision: r.expectedAssessmentRevision + 1,
      previousAssessmentDigest: latest?.assessmentDigest ?? null,
      assessedBy: p.subjectId,
      evaluatorRef: r.evaluatorRef,
      governance,
      disposition: r.disposition,
      explanation: r.explanation,
      uncertainty: r.uncertainty,
      reformulation: r.reformulation,
      evidence,
      proposedWork: r.proposedWork,
      executionAuthorized: false as const,
      requestDigest,
      assessedAt,
    };
    const record = { ...body, assessmentDigest: await digest(body) };
    if (!(await this.store.append(record))) {
      const raced = await this.store.assessment(
        p.tenantId,
        r.agentId,
        r.inceptionId,
        r.assessmentId,
      );
      if (raced) return replay(raced, requestDigest);
      conflict();
    }
    return copy(record);
  }
  async get(
    context: Context,
    scope: { agentId: string; roomId: string; inceptionId: string },
  ) {
    const r = copy(scope);
    exact(r, ["agentId", "roomId", "inceptionId"]);
    ids(r.agentId, r.roomId, r.inceptionId);
    const p = await this.principal(context, r, "read", []);
    return this.requireInception(p.tenantId, r);
  }
  async history(
    context: Context,
    scope: { agentId: string; roomId: string; inceptionId: string },
    afterRevision = -1,
    limit = 100,
  ) {
    validateGovernancePageV1(afterRevision, limit);
    const inception = await this.get(context, scope);
    return this.store.history(
      inception.tenantId,
      inception.agentId,
      inception.inceptionId,
      afterRevision,
      limit,
    );
  }
  private async requireInception(
    t: string,
    r: { agentId: string; roomId: string; inceptionId: string },
  ) {
    const item = await this.store.get(t, r.agentId, r.inceptionId);
    if (!item || item.roomId !== r.roomId) missing();
    return item;
  }
  private async binding(
    t: string,
    a: string,
    revision: number,
  ): Promise<InceptionGovernanceBindingV1> {
    const head = await this.governance.load(t, a);
    if (
      !head ||
      head.revision !== revision ||
      head.configuration.interactionMode !== "purpose"
    )
      conflict();
    return {
      governanceId: head.governanceId,
      revision: head.revision,
      authorityEpoch: head.authorityEpoch,
      configurationDigest: head.configurationDigest,
      definitionRevisionId: head.configuration.definitionRevisionId,
    };
  }
  private async room(t: string, a: string, r: string) {
    const state = await this.rooms.getRoomState(t, r);
    if (
      state.room.tenantId !== t ||
      state.room.id !== r ||
      !state.participants.some(
        (p) =>
          p.tenantId === t &&
          p.type === "agent" &&
          (p.metadata?.agentId ?? p.id) === a,
      )
    )
      missing();
    return state;
  }
  private async principal(
    context: Context,
    r: { agentId: string; roomId: string; inceptionId: string; evaluatorRef?: string },
    operation: "submit" | "assess" | "read",
    references: InceptionEvidenceReferenceV1[],
  ) {
    try {
      const p = copy(await this.access.authenticate(context));
      if (!p) denied();
      ids(p.tenantId, p.subjectId);
      if (
        !(await this.access.authorize(copy(p), {
          agentId: r.agentId,
          roomId: r.roomId,
          inceptionId: r.inceptionId,
          ...(r.evaluatorRef === undefined ? {} : { evaluatorRef: r.evaluatorRef }),
          operation,
          references: copy(references),
        }))
      )
        denied();
      return p;
    } catch {
      return denied();
    }
  }
}
export function validateInceptionAssessmentRecordV1(r: InceptionAssessmentV1) {
  integer(r.revision, 0);
  if (
    r.schemaVersion !== 1 ||
    r.executionAuthorized !== false ||
    !/^sha256:[a-f0-9]{64}$/u.test(r.assessmentDigest) ||
    (r.revision === 0
      ? r.previousAssessmentDigest !== null
      : !/^sha256:[a-f0-9]{64}$/u.test(r.previousAssessmentDigest ?? ""))
  )
    invalid();
}
function validateAssessmentInput(r: AssessAgentInceptionV1) {
  exact(r, [
    "agentId",
    "roomId",
    "inceptionId",
    "assessmentId",
    "expectedGovernanceRevision",
    "expectedAssessmentRevision",
    "evaluatorRef",
    "disposition",
    "explanation",
    "uncertainty",
    "reformulation",
    "evidence",
    "proposedWork",
  ]);
  ids(r.agentId, r.roomId, r.inceptionId, r.assessmentId, r.evaluatorRef);
  integer(r.expectedGovernanceRevision, 0);
  integer(r.expectedAssessmentRevision, -1);
  if (
    ![
      "adopted",
      "reformulated",
      "rejected",
      "needs_evidence",
      "deferred",
    ].includes(r.disposition)
  )
    invalid();
  text(r.explanation, 16000);
  text(r.uncertainty, 4000);
  if (r.disposition === "reformulated") text(r.reformulation, 16000);
  else if (r.reformulation !== null) invalid();
  if (
    !Array.isArray(r.evidence) ||
    r.evidence.length > 64 ||
    !Array.isArray(r.proposedWork) ||
    r.proposedWork.length > 32
  )
    invalid();
  const refs = new Set<string>();
  for (const ref of r.evidence) {
    if (ref?.kind === "message") {
      exact(ref, ["kind", "id"]);
      ids(ref.id);
    } else if (ref?.kind === "artifact") {
      exact(ref, ["kind", "id", "versionId"]);
      ids(ref.id, ref.versionId);
    } else invalid();
    const k =
      ref.kind === "message"
        ? key(ref.kind, ref.id)
        : key(ref.kind, ref.id, ref.versionId);
    if (refs.has(k)) invalid();
    refs.add(k);
  }
  if (
    !["adopted", "reformulated"].includes(r.disposition) &&
    r.proposedWork.length
  )
    invalid();
  const proposals = new Set<string>();
  for (const work of r.proposedWork) {
    exact(work, ["proposalId", "description"]);
    ids(work.proposalId);
    text(work.description, 8000);
    if (proposals.has(work.proposalId)) invalid();
    proposals.add(work.proposalId);
  }
}
function exact(v: object, keys: string[]) {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).sort().join(",") !== keys.sort().join(",")
  )
    invalid();
}
function ids(...values: string[]) {
  for (const v of values)
    if (
      typeof v !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/u.test(v)
    )
      invalid();
}
function integer(v: number, min: number) {
  if (!Number.isSafeInteger(v) || v < min || v >= Number.MAX_SAFE_INTEGER)
    invalid();
}
function text(v: unknown, max: number) {
  if (typeof v !== "string" || !v.trim() || v.length > max) invalid();
}
function key(...v: string[]) {
  return JSON.stringify(v);
}
function copy<T>(v: T): T {
  return structuredClone(v);
}
function digest(v: unknown) {
  return governanceDigestV1({
    domain: "agent-inception-v1",
    value: JSON.parse(JSON.stringify(v)) as JsonValue,
  });
}
function replay<T extends { requestDigest: string }>(v: T, d: string): T {
  if (v.requestDigest !== d) conflict();
  return copy(v);
}
function invalid(): never {
  throw new AgentPlatError(
    "VALIDATION_ERROR",
    "Agent inception input is invalid",
  );
}
function denied(): never {
  throw new AgentPlatError("FORBIDDEN", "Agent inception access denied");
}
function conflict(): never {
  throw new AgentPlatError(
    "CONFLICT",
    "Agent inception revision, governance fence or operation conflict",
  );
}
function missing(): never {
  throw new AgentPlatError(
    "NOT_FOUND",
    "Agent inception or scoped source not found",
  );
}
