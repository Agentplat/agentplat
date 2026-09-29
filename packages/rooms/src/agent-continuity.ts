import { AgentPlatError } from "@agentplat/core";
import type { JsonValue } from "@agentplat/core";
import {
  governanceDigestV1,
  type AgentGovernanceHeadV1,
  type AgentGovernanceStoreV1,
  type AgentGovernancePrincipalV1,
} from "./agent-governance.js";
import {
  agentPurposeWorkFenceMatchesV1,
  type AgentPurposeExecutionProjectionV1,
  type AgentPurposeWorkBindingV1,
} from "./purpose-control.js";

export interface AgentOriginV1 {
  parentAgentId: string;
  continuityId: string;
  kind: "delegation" | "genesis";
}
export interface AgentDelegationSourceV1 {
  roomId: string;
  handoffId: string;
  sourceRunId: string;
  sourceTaskId: string;
  targetParticipantId: string;
  inceptionMessageId: string;
  inceptionContentDigest: string;
}
export interface AgentContinuityFenceV1 {
  delegation?: AgentDelegationSourceV1;
  continuityId: string;
  linkRevision: number;
  parentAgentId: string;
  parentRevision: number;
  parentConfigurationDigest: string;
  parentProfileDigest: string;
  childAgentId: string;
  childConfigurationDigest: string;
  expiresAt: string;
  permittedTools: string[] | null;
  parentWork?: AgentPurposeWorkBindingV1;
}
export interface AgentContinuityRecordV1 extends AgentContinuityFenceV1 {
  schemaVersion: 1;
  tenantId: string;
  kind: AgentOriginV1["kind"];
  status: "proposed" | "accepted" | "revoked";
  evidenceKind: "handoff" | "genesis" | "organization";
  evidenceRef: string;
  evidenceDigest: string;
  alignmentExplanation: string;
  proposedBy: string;
  acceptedBy: string | null;
  updatedAt: string;
  operationId: string;
  requestDigest: string;
}
export interface AgentContinuityStoreV1 {
  load(t: string, id: string): Promise<AgentContinuityRecordV1 | undefined>;
  operation(
    t: string,
    id: string,
    operationId: string,
  ): Promise<AgentContinuityRecordV1 | undefined>;
  commit(
    record: AgentContinuityRecordV1,
    expectedRevision: number | null,
  ): Promise<boolean>;
}
export interface AgentContinuityAccessV1<Context> {
  authenticate(context: Context): Promise<AgentGovernancePrincipalV1 | null>;
  authorize(
    p: AgentGovernancePrincipalV1,
    r: {
      operation: "propose" | "accept" | "revoke" | "read";
      parentAgentId: string;
      childAgentId: string;
    },
  ): Promise<boolean>;
}
export interface AgentContinuityEvidencePortV1 {
  /** Resolve authoritative Handoff/Genesis/organization records, not caller-supplied certificates. */
  verify(input: {
    kind: AgentContinuityRecordV1["evidenceKind"];
    reference: string;
    parent: AgentGovernanceHeadV1;
    child: AgentGovernanceHeadV1;
  }): Promise<{
    compatible: boolean;
    parentConfigurationDigest: string;
    childConfigurationDigest: string;
    evidenceDigest: string;
    explanation: string;
    permittedTools: string[] | null;
    parentWork?: AgentPurposeWorkBindingV1;
    delegation?: AgentDelegationSourceV1;
    expiresAt?: string;
  }>;
}
export class InMemoryAgentContinuityStoreV1 implements AgentContinuityStoreV1 {
  private records = new Map<string, AgentContinuityRecordV1>();
  private operations = new Map<string, AgentContinuityRecordV1>();
  constructor(
    private readonly governance: {
      executionHead(t: string, a: string): AgentGovernanceHeadV1 | undefined;
    },
  ) {}
  executionLink(t: string, id: string) {
    return copy(this.records.get(key(t, id)));
  }
  async load(t: string, id: string) {
    return this.executionLink(t, id);
  }
  async operation(t: string, id: string, op: string) {
    return copy(this.operations.get(key(t, id, op)));
  }
  async commit(r: AgentContinuityRecordV1, expected: number | null) {
    validateContinuityRecordV1(r, expected);
    const old = this.records.get(key(r.tenantId, r.continuityId));
    if (
      (old?.linkRevision ?? null) !== expected ||
      this.operations.has(key(r.tenantId, r.continuityId, r.operationId))
    )
      return false;
    if (
      !continuityWriteCurrentV1(
        this.governance.executionHead(r.tenantId, r.parentAgentId),
        this.governance.executionHead(r.tenantId, r.childAgentId),
        r,
      )
    )
      return false;
    this.records.set(key(r.tenantId, r.continuityId), copy(r));
    this.operations.set(
      key(r.tenantId, r.continuityId, r.operationId),
      copy(r),
    );
    return true;
  }
}
export class AgentContinuityServiceV1<Context> {
  constructor(
    private readonly store: AgentContinuityStoreV1,
    private readonly governance: Pick<AgentGovernanceStoreV1, "load">,
    private readonly access: AgentContinuityAccessV1<Context>,
    private readonly evidence: AgentContinuityEvidencePortV1,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async propose(
    context: Context,
    input: {
      continuityId: string;
      parentAgentId: string;
      childAgentId: string;
      operationId: string;
      expectedRevision: number | null;
      expiresAt: string;
      evidenceKind: AgentContinuityRecordV1["evidenceKind"];
      evidenceRef: string;
    },
  ) {
    const r = copy(input);
    exact(r, [
      "continuityId",
      "parentAgentId",
      "childAgentId",
      "operationId",
      "expectedRevision",
      "expiresAt",
      "evidenceKind",
      "evidenceRef",
    ]);
    [r.continuityId, r.parentAgentId, r.childAgentId, r.operationId].forEach(
      id,
    );
    if (
      typeof r.evidenceRef !== "string" ||
      !r.evidenceRef.trim() ||
      r.evidenceRef.length > 2048
    )
      invalid();
    revision(r.expectedRevision);
    timestamp(r.expiresAt);
    if (
      !["handoff", "genesis", "organization"].includes(r.evidenceKind) ||
      r.parentAgentId === r.childAgentId ||
      r.expiresAt <= this.now()
    )
      invalid();
    const p = await this.principal(context, { ...r, operation: "propose" }),
      requestDigest = await digest({ principal: p, input: r });
    const prior = await this.store.operation(
      p.tenantId,
      r.continuityId,
      r.operationId,
    );
    if (prior) return replay(prior, requestDigest);
    const parent = await this.head(p.tenantId, r.parentAgentId),
      child = await this.head(p.tenantId, r.childAgentId);
    this.authority(p, parent, r.expiresAt);
    if (parent.configuration.origin?.kind === "delegation") denied();
    if (
      parent.status !== "active" ||
      !parent.executionAdmission?.platformLimits
    )
      denied();
    const origin = child.configuration.origin;
    if (
      !origin ||
      origin.parentAgentId !== parent.agentId ||
      origin.continuityId !== r.continuityId ||
      (origin.kind === "delegation"
        ? r.evidenceKind !== "handoff"
        : r.evidenceKind === "handoff")
    )
      denied();
    const current = await this.store.load(p.tenantId, r.continuityId);
    if ((current?.linkRevision ?? null) !== r.expectedRevision) conflict();
    if (
      current &&
      (current.parentAgentId !== parent.agentId ||
        current.childAgentId !== child.agentId ||
        current.kind !== origin.kind)
    )
      conflict();
    const evidence = await this.evidence.verify({
      kind: r.evidenceKind,
      reference: r.evidenceRef,
      parent: copy(parent),
      child: copy(child),
    });
    if (
      !evidence.compatible ||
      evidence.parentConfigurationDigest !== parent.configurationDigest ||
      evidence.childConfigurationDigest !== child.configurationDigest ||
      !/^sha256:[a-f0-9]{64}$/u.test(evidence.evidenceDigest) ||
      !evidence.explanation
    )
      denied();
    if (
      evidence.permittedTools !== null &&
      (!Array.isArray(evidence.permittedTools) ||
        evidence.permittedTools.length > 256)
    )
      invalid();
    if (evidence.permittedTools) evidence.permittedTools.forEach(id);
    if (
      origin.kind === "delegation" &&
      (!evidence.delegation || evidence.permittedTools === null)
    )
      denied();
    if (evidence.expiresAt && r.expiresAt > evidence.expiresAt) denied();
    if (evidence.delegation) Object.values(evidence.delegation).forEach(id);
    if (
      origin.kind === "delegation" &&
      parent.configuration.interactionMode === "purpose" &&
      !evidence.parentWork
    )
      denied();
    const next: AgentContinuityRecordV1 = {
      schemaVersion: 1,
      tenantId: p.tenantId,
      continuityId: r.continuityId,
      linkRevision: (r.expectedRevision ?? -1) + 1,
      parentAgentId: parent.agentId,
      parentRevision: parent.revision,
      parentConfigurationDigest: parent.configurationDigest,
      parentProfileDigest: parent.executionAdmission.profileDigest,
      childAgentId: child.agentId,
      childConfigurationDigest: child.configurationDigest,
      expiresAt: r.expiresAt,
      permittedTools: copy(evidence.permittedTools),
      ...(evidence.delegation ? { delegation: copy(evidence.delegation) } : {}),
      ...(evidence.parentWork ? { parentWork: copy(evidence.parentWork) } : {}),
      kind: origin.kind,
      status: "proposed",
      evidenceKind: r.evidenceKind,
      evidenceRef: r.evidenceRef,
      evidenceDigest: evidence.evidenceDigest,
      alignmentExplanation: evidence.explanation,
      proposedBy: p.subjectId,
      acceptedBy: null,
      updatedAt: this.now(),
      operationId: r.operationId,
      requestDigest,
    };
    const confirmed = await this.principal(context, {
      ...r,
      operation: "propose",
    });
    if (
      confirmed.tenantId !== p.tenantId ||
      confirmed.subjectId !== p.subjectId
    )
      denied();
    if (!(await this.store.commit(next, r.expectedRevision))) conflict();
    return copy(next);
  }
  async accept(
    context: Context,
    input: {
      continuityId: string;
      operationId: string;
      expectedRevision: number;
    },
  ) {
    return this.transition(context, input, "accept");
  }
  async revoke(
    context: Context,
    input: {
      continuityId: string;
      operationId: string;
      expectedRevision: number;
    },
  ) {
    return this.transition(context, input, "revoke");
  }
  async get(context: Context, continuityId: string) {
    id(continuityId);
    const p = await this.authenticate(context),
      r = await this.store.load(p.tenantId, continuityId);
    if (!r) missing();
    if (
      !(await this.access.authorize(copy(p), {
        operation: "read",
        parentAgentId: r.parentAgentId,
        childAgentId: r.childAgentId,
      }))
    )
      denied();
    return r;
  }
  private async transition(
    context: Context,
    input: {
      continuityId: string;
      operationId: string;
      expectedRevision: number;
    },
    kind: "accept" | "revoke",
  ) {
    const i = copy(input);
    exact(i, ["continuityId", "operationId", "expectedRevision"]);
    id(i.continuityId);
    id(i.operationId);
    revision(i.expectedRevision);
    const p = await this.authenticate(context),
      r = await this.store.load(p.tenantId, i.continuityId);
    if (!r) missing();
    if (
      !(await this.access.authorize(copy(p), {
        operation: kind,
        parentAgentId: r.parentAgentId,
        childAgentId: r.childAgentId,
      }))
    )
      denied();
    const d = await digest({ principal: p, input: i, kind }),
      old = await this.store.operation(
        p.tenantId,
        i.continuityId,
        i.operationId,
      );
    if (old) return replay(old, d);
    if (r.linkRevision !== i.expectedRevision) conflict();
    const parent = await this.head(p.tenantId, r.parentAgentId),
      child = await this.head(p.tenantId, r.childAgentId);
    if (kind === "accept") {
      this.authority(p, child, r.expiresAt);
      if (
        r.status !== "proposed" ||
        r.expiresAt <= this.now() ||
        !continuityWriteCurrentV1(parent, child, r)
      )
        conflict();
    } else {
      if (
        parent.configuration.ownerId !== p.subjectId &&
        child.configuration.ownerId !== p.subjectId
      )
        denied();
    }
    const next = {
      ...r,
      linkRevision: r.linkRevision + 1,
      status: kind === "accept" ? ("accepted" as const) : ("revoked" as const),
      acceptedBy: kind === "accept" ? p.subjectId : r.acceptedBy,
      operationId: i.operationId,
      requestDigest: d,
      updatedAt: this.now(),
    };
    if (!(await this.store.commit(next, r.linkRevision))) conflict();
    return next;
  }
  private authority(
    p: AgentGovernancePrincipalV1,
    h: AgentGovernanceHeadV1,
    until: string,
  ) {
    if (
      h.configuration.ownerId !== p.subjectId &&
      !h.configuration.delegations.some(
        (d) =>
          d.subjectId === p.subjectId &&
          d.operation === "delegate" &&
          d.expiresAt > this.now() &&
          d.expiresAt >= until,
      )
    )
      denied();
  }
  private async head(t: string, a: string) {
    const h = await this.governance.load(t, a);
    if (!h) missing();
    return h;
  }
  private now() {
    return this.clock().toISOString();
  }
  private async authenticate(c: Context) {
    try {
      const p = copy(await this.access.authenticate(c));
      if (!p) denied();
      id(p.tenantId);
      id(p.subjectId);
      return p;
    } catch {
      return denied();
    }
  }
  private async principal(
    c: Context,
    r: { parentAgentId: string; childAgentId: string; operation: "propose" },
  ) {
    const p = await this.authenticate(c);
    if (!(await this.access.authorize(copy(p), r))) denied();
    return p;
  }
}
export async function resolveAgentContinuityV1(
  t: string,
  a: string,
  head: (t: string, a: string) => Promise<AgentGovernanceHeadV1 | undefined>,
  link: (t: string, id: string) => Promise<AgentContinuityRecordV1 | undefined>,
  purpose: (
    t: string,
    a: string,
    id: string,
  ) => Promise<AgentPurposeExecutionProjectionV1 | undefined>,
  now = new Date().toISOString(),
): Promise<AgentContinuityFenceV1[]> {
  const result: AgentContinuityFenceV1[] = [],
    visited = new Set<string>();
  let child = await head(t, a);
  if (!child) denied();
  while (child.configuration.origin) {
    if (result.length >= 8 || visited.has(child.agentId)) denied();
    visited.add(child.agentId);
    const origin = child.configuration.origin,
      r = await link(t, origin.continuityId),
      parent = await head(t, origin.parentAgentId);
    if (
      !r ||
      r.status !== "accepted" ||
      r.expiresAt <= now ||
      r.childAgentId !== child.agentId ||
      r.kind !== origin.kind ||
      !continuityWriteCurrentV1(parent, child, r) ||
      !parent?.executionAdmission?.platformLimits
    )
      denied();
    if (
      r.parentWork &&
      !agentPurposeWorkFenceMatchesV1(
        await purpose(t, parent.agentId, r.parentWork.missionId),
        {
          tenantId: t,
          agentId: parent.agentId,
          governanceId: parent.governanceId,
          revision: parent.revision,
          authorityEpoch: parent.authorityEpoch,
          configurationDigest: parent.configurationDigest,
          definitionRevisionId: parent.configuration.definitionRevisionId,
          profileDigest: parent.executionAdmission.profileDigest,
          purposeControlDigest: parent.executionAdmission.purposeControlDigest,
          purposeWork: r.parentWork,
        },
        now,
      )
    )
      denied();
    result.push(continuityFenceV1(r));
    child = parent;
  }
  if (visited.has(child.agentId)) denied();
  return result;
}
export function continuityFenceV1(
  r: AgentContinuityRecordV1,
): AgentContinuityFenceV1 {
  return {
    continuityId: r.continuityId,
    linkRevision: r.linkRevision,
    parentAgentId: r.parentAgentId,
    parentRevision: r.parentRevision,
    parentConfigurationDigest: r.parentConfigurationDigest,
    parentProfileDigest: r.parentProfileDigest,
    childAgentId: r.childAgentId,
    childConfigurationDigest: r.childConfigurationDigest,
    expiresAt: r.expiresAt,
    permittedTools: copy(r.permittedTools),
    ...(r.delegation ? { delegation: copy(r.delegation) } : {}),
    ...(r.parentWork ? { parentWork: copy(r.parentWork) } : {}),
  };
}
export function sameContinuityV1(
  a: readonly AgentContinuityFenceV1[] | undefined,
  b: readonly AgentContinuityFenceV1[] | undefined,
): boolean {
  return canonical(a ?? []) === canonical(b ?? []);
}
export function continuityWriteCurrentV1(
  parent: AgentGovernanceHeadV1 | undefined,
  child: AgentGovernanceHeadV1 | undefined,
  r: AgentContinuityRecordV1,
) {
  return (
    !!parent &&
    !!child &&
    parent.tenantId === r.tenantId &&
    child.tenantId === r.tenantId &&
    child.configuration.origin?.parentAgentId === parent.agentId &&
    child.configuration.origin.continuityId === r.continuityId &&
    (r.status === "revoked" ||
      (parent.status === "active" &&
        parent.revision === r.parentRevision &&
        parent.configurationDigest === r.parentConfigurationDigest &&
        parent.executionAdmission?.profileDigest === r.parentProfileDigest &&
        child.configurationDigest === r.childConfigurationDigest))
  );
}
export function validateContinuityRecordV1(
  r: AgentContinuityRecordV1,
  expected: number | null,
) {
  if (
    r.schemaVersion !== 1 ||
    r.linkRevision !== (expected ?? -1) + 1 ||
    !["proposed", "accepted", "revoked"].includes(r.status)
  )
    invalid();
}
export function validateAgentOriginV1(o: AgentOriginV1) {
  exact(o, ["parentAgentId", "continuityId", "kind"]);
  id(o.parentAgentId);
  id(o.continuityId);
  if (!["delegation", "genesis"].includes(o.kind)) invalid();
}
function id(v: string) {
  if (
    typeof v !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/u.test(v)
  )
    invalid();
}
function timestamp(v: string) {
  if (
    typeof v !== "string" ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString() !== v
  )
    invalid();
}
function revision(v: number | null) {
  if (v !== null && (!Number.isSafeInteger(v) || v < 0)) invalid();
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
function copy<T>(v: T): T {
  return structuredClone(v);
}
function key(...v: string[]) {
  return JSON.stringify(v);
}
function canonical(v: unknown): string {
  return JSON.stringify(v, (k, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, value[k]]),
        )
      : value,
  );
}
function digest(v: unknown) {
  return governanceDigestV1({
    domain: "agent-continuity-v1",
    value: JSON.parse(JSON.stringify(v)) as JsonValue,
  });
}
function replay(r: AgentContinuityRecordV1, d: string) {
  if (r.requestDigest !== d) conflict();
  return copy(r);
}
function invalid(): never {
  throw new AgentPlatError(
    "VALIDATION_ERROR",
    "Agent continuity input invalid",
  );
}
function denied(): never {
  throw new AgentPlatError(
    "FORBIDDEN",
    "Agent continuity unavailable, stale or unauthorized",
  );
}
function conflict(): never {
  throw new AgentPlatError(
    "CONFLICT",
    "Agent continuity revision or consent conflict",
  );
}
function missing(): never {
  throw new AgentPlatError("NOT_FOUND", "Agent continuity source not found");
}
