import { AgentPlatError } from "@agentplat/core";
import type { JsonValue } from "@agentplat/core";
import {
  governanceDigestV1,
  type AgentGovernanceHeadV1,
  type AgentGovernancePrincipalV1,
  type AgentGovernanceStoreV1,
} from "./agent-governance.js";
import type { InceptionGovernanceBindingV1 } from "./agent-inception.js";

export interface AttentionSignalDefinitionInputV1 {
  signalId: string;
  kind: "quantitative" | "qualitative" | "event";
  description: string;
  sourceIds: string[];
  freshnessMs: number;
  cadenceMs: number;
  evaluationWindowMs: number;
  maximumEvaluationsPerWindow: number;
  maximumObservations: number;
  maximumWakeups: number;
}
export type AttentionSignalReferenceInputV1 = {
  definitionId: string;
  interpretation:
    | { kind: "quantitative"; minimum: number; maximum: number }
    | { kind: "qualitative"; criterion: string };
};
export type AttentionSignalCatalogV1 = {
  schemaVersion: 1;
  tenantId: string;
  agentId: string;
  recordId: string;
  createdBy: string;
  createdAt: string;
  digest: string;
} & (
  | { type: "definition"; content: AttentionSignalDefinitionInputV1 }
  | { type: "reference"; content: AttentionSignalReferenceInputV1 }
);
export interface AttentionObservationInputV1 {
  agentId: string;
  definitionId: string;
  sourceId: string;
  eventId: string;
  observedAt: string;
  availability: "observed" | "unavailable";
  value: number | string | null;
  evidenceRefs: string[];
}
export interface AttentionObservationV1 extends AttentionObservationInputV1 {
  tenantId: string;
  observationId: string;
  payloadDigest: string;
  receivedAt: string;
  submittedBy: string;
  governance: InceptionGovernanceBindingV1;
  referenceIds: string[];
  staleOnArrival: boolean;
  outOfOrder: boolean;
}
export type AttentionCoverageV1 = {
  sourceId: string;
  status: "missing" | "fresh" | "stale" | "unavailable";
  observationId: string | null;
};
export interface AttentionEvaluationWakeupV1 {
  schemaVersion: 1;
  tenantId: string;
  agentId: string;
  definitionId: string;
  wakeupId: string;
  createdAt: string;
  governance: InceptionGovernanceBindingV1;
  observationIds: string[];
  referenceIds: string[];
  coverage: AttentionCoverageV1[];
  contradictory: boolean;
  executionAuthorized: false;
}
export interface AttentionWakeupDeliveryV1 {
  wakeup: AttentionEvaluationWakeupV1;
  status: "pending" | "leased" | "delivered" | "obsolete";
  workerId: string | null;
  claimToken: string | null;
  leaseUntil: string | null;
  generation: number;
}
export interface AttentionSignalStateV1 {
  tenantId: string;
  agentId: string;
  definitionId: string;
  revision: number;
  updatedAt: string;
  observations: AttentionObservationV1[];
  pendingObservationIds: string[];
  deliveries: AttentionWakeupDeliveryV1[];
  lastScheduledAt: string | null;
  lastCoverageDigest: string | null;
  windowStartedAt: string | null;
  windowCount: number;
}
/** Adapters atomically compare the governance fence and stream CAS at each write. */
export interface AttentionSignalStoreV1 {
  catalog(
    tenantId: string,
    agentId: string,
    recordId: string,
  ): Promise<AttentionSignalCatalogV1 | undefined>;
  put(
    record: AttentionSignalCatalogV1,
    governance: InceptionGovernanceBindingV1,
  ): Promise<boolean>;
  load(
    tenantId: string,
    agentId: string,
    definitionId: string,
  ): Promise<AttentionSignalStateV1 | undefined>;
  commit(
    state: AttentionSignalStateV1,
    expectedRevision: number | null,
    governance: InceptionGovernanceBindingV1,
  ): Promise<boolean>;
}
export interface AttentionSignalAccessV1<Context> {
  authenticate(context: Context): Promise<AgentGovernancePrincipalV1 | null>;
  authorize(
    principal: AgentGovernancePrincipalV1,
    request: {
      agentId: string;
      operation: "signals" | "references" | "observe" | "read" | "work";
      definitionId?: string;
      sourceId?: string;
      evidenceRefs?: string[];
    },
  ): Promise<boolean>;
}
export class InMemoryAttentionSignalStoreV1 implements AttentionSignalStoreV1 {
  private records = new Map<string, AttentionSignalCatalogV1>();
  private states = new Map<string, AttentionSignalStateV1>();
  constructor(
    private readonly governance: {
      matchesInceptionFence(
        t: string,
        a: string,
        b: InceptionGovernanceBindingV1,
      ): boolean;
    },
  ) {}
  async catalog(t: string, a: string, id: string) {
    return clone(this.records.get(key(t, a, id)));
  }
  async load(t: string, a: string, id: string) {
    return clone(this.states.get(key(t, a, id)));
  }
  async put(r: AttentionSignalCatalogV1, b: InceptionGovernanceBindingV1) {
    if (!this.governance.matchesInceptionFence(r.tenantId, r.agentId, b))
      return false;
    const k = key(r.tenantId, r.agentId, r.recordId),
      old = this.records.get(k);
    if (old) return old.digest === r.digest;
    this.records.set(k, clone(r));
    return true;
  }
  async commit(
    s: AttentionSignalStateV1,
    expected: number | null,
    b: InceptionGovernanceBindingV1,
  ) {
    validateAttentionStateCommitV1(s, expected);
    const k = key(s.tenantId, s.agentId, s.definitionId),
      old = this.states.get(k);
    if (
      (old?.revision ?? null) !== expected ||
      !this.governance.matchesInceptionFence(s.tenantId, s.agentId, b)
    )
      return false;
    this.states.set(k, clone(s));
    return true;
  }
}

export class AttentionSignalServiceV1<Context> {
  constructor(
    private readonly store: AttentionSignalStoreV1,
    private readonly governance: Pick<AgentGovernanceStoreV1, "load">,
    private readonly access: AttentionSignalAccessV1<Context>,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async define(
    context: Context,
    input: {
      agentId: string;
      expectedGovernanceRevision: number;
      definition: AttentionSignalDefinitionInputV1;
    },
  ) {
    const r = clone(input);
    exact(r, ["agentId", "expectedGovernanceRevision", "definition"]);
    id(r.agentId);
    integer(r.expectedGovernanceRevision, 0, Number.MAX_SAFE_INTEGER - 1);
    validateDefinition(r.definition);
    const p = await this.principal(context, {
      agentId: r.agentId,
      operation: "signals",
    });
    const h = await this.head(p, r.agentId);
    this.authority(p, h, "signals", r.expectedGovernanceRevision);
    return this.publish(p, h, { type: "definition", content: r.definition });
  }
  async reference(
    context: Context,
    input: {
      agentId: string;
      expectedGovernanceRevision: number;
      reference: AttentionSignalReferenceInputV1;
    },
  ) {
    const r = clone(input);
    exact(r, ["agentId", "expectedGovernanceRevision", "reference"]);
    id(r.agentId);
    integer(r.expectedGovernanceRevision, 0, Number.MAX_SAFE_INTEGER - 1);
    validateReference(r.reference);
    const p = await this.principal(context, {
      agentId: r.agentId,
      operation: "references",
      definitionId: r.reference.definitionId,
    });
    const h = await this.head(p, r.agentId);
    this.authority(p, h, "references", r.expectedGovernanceRevision);
    const d = await this.definition(
      p.tenantId,
      r.agentId,
      r.reference.definitionId,
    );
    if (
      (d.content.kind === "quantitative") !==
      (r.reference.interpretation.kind === "quantitative")
    )
      invalid();
    return this.publish(p, h, { type: "reference", content: r.reference });
  }
  async catalog(
    context: Context,
    input: { agentId: string; recordId: string },
  ) {
    const r = clone(input);
    exact(r, ["agentId", "recordId"]);
    id(r.agentId);
    id(r.recordId);
    const p = await this.principal(context, {
      agentId: r.agentId,
      definitionId: r.recordId,
      operation: "read",
    });
    const record = await this.store.catalog(p.tenantId, r.agentId, r.recordId);
    if (!record) missing();
    return record;
  }
  async get(
    context: Context,
    scope: { agentId: string; definitionId: string },
  ) {
    const r = clone(scope);
    validateScope(r);
    const p = await this.principal(context, { ...r, operation: "read" });
    const definition = await this.definition(
      p.tenantId,
      r.agentId,
      r.definitionId,
    );
    const state = await this.store.load(p.tenantId, r.agentId, r.definitionId);
    const asOf = this.now();
    if (state && asOf < state.updatedAt) conflict();
    return {
      definition,
      state,
      asOf,
      coverage: coverageAt(
        state ?? { observations: [] },
        definition.content,
        asOf,
      ),
    };
  }
  async observe(
    context: Context,
    input: AttentionObservationInputV1,
  ): Promise<AttentionObservationV1> {
    const r = clone(input);
    validateObservation(r);
    const p = await this.principal(context, {
      agentId: r.agentId,
      definitionId: r.definitionId,
      sourceId: r.sourceId,
      evidenceRefs: r.evidenceRefs,
      operation: "observe",
    });
    const d = await this.definition(p.tenantId, r.agentId, r.definitionId);
    if (!d.content.sourceIds.includes(r.sourceId)) denied();
    if (
      r.availability === "observed" &&
      (d.content.kind === "quantitative"
        ? typeof r.value !== "number"
        : typeof r.value !== "string")
    )
      invalid();
    const payloadDigest = await digest(r),
      observationId = await digest({
        sourceId: r.sourceId,
        eventId: r.eventId,
      });
    const now = this.now(),
      s = await this.state(p, r, now);
    const previous = s.observations.find(
      (o) => o.observationId === observationId,
    );
    if (previous) {
      if (previous.payloadDigest !== payloadDigest) conflict();
      return clone(previous);
    }
    const h = await this.active(p, r),
      references = await this.references(p, r, h);
    if (r.observedAt > now) invalid();
    if (s.observations.length >= d.content.maximumObservations) capacity();
    const latest = s.observations
      .filter((o) => o.sourceId === r.sourceId)
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
    const observation: AttentionObservationV1 = {
      ...r,
      tenantId: p.tenantId,
      observationId,
      payloadDigest,
      receivedAt: now,
      submittedBy: p.subjectId,
      governance: binding(h),
      referenceIds: references.map((x) => x.recordId),
      staleOnArrival:
        Date.parse(now) - Date.parse(r.observedAt) > d.content.freshnessMs,
      outOfOrder: !!latest && r.observedAt < latest.observedAt,
    };
    s.observations.push(observation);
    s.pendingObservationIds.push(observationId);
    if (!(await this.save(s, h, now))) {
      const raced = (
        await this.store.load(p.tenantId, r.agentId, r.definitionId)
      )?.observations.find((o) => o.observationId === observationId);
      if (raced && raced.payloadDigest === payloadDigest) return clone(raced);
      conflict();
    }
    return clone(observation);
  }
  /** Poll on an application-owned schedule, including when sources are silent. */
  async tick(
    context: Context,
    scope: { agentId: string; definitionId: string },
  ): Promise<AttentionEvaluationWakeupV1 | null> {
    const r = clone(scope);
    validateScope(r);
    const p = await this.principal(context, { ...r, operation: "work" });
    const h = await this.active(p, r),
      d = await this.definition(p.tenantId, r.agentId, r.definitionId),
      references = await this.references(p, r, h);
    const now = this.now(),
      s = await this.state(p, r, now);
    let changed = false;
    for (const item of s.deliveries)
      if (
        item.status !== "delivered" &&
        item.status !== "obsolete" &&
        item.wakeup.governance.revision !== h.revision
      ) {
        item.status = "obsolete";
        changed = true;
      }
    const coverage = coverageAt(s, d.content, now);
    const fresh = coverage
      .filter((x) => x.status === "fresh")
      .map((x) =>
        s.observations.find((o) => o.observationId === x.observationId)!,
      );
    const contradictory =
      new Set(fresh.map((o) => JSON.stringify(o.value))).size > 1 ||
      fresh.some((o) =>
        s.observations.some(
          (other) =>
            other.sourceId === o.sourceId &&
            other.observedAt === o.observedAt &&
            JSON.stringify(other.value) !== JSON.stringify(o.value),
        ),
      );
    const referenceIds = references.map((x) => x.recordId);
    const coverageDigest = await digest({
      coverage,
      contradictory,
      referenceIds,
      governance: binding(h),
    });
    if (
      !s.pendingObservationIds.length &&
      coverageDigest === s.lastCoverageDigest
    ) {
      if (changed && !(await this.save(s, h, now))) conflict();
      return null;
    }
    if (
      s.lastScheduledAt &&
      Date.parse(now) - Date.parse(s.lastScheduledAt) < d.content.cadenceMs
    ) {
      if (changed && !(await this.save(s, h, now))) conflict();
      return null;
    }
    if (
      !s.windowStartedAt ||
      Date.parse(now) - Date.parse(s.windowStartedAt) >=
        d.content.evaluationWindowMs
    ) {
      s.windowStartedAt = now;
      s.windowCount = 0;
    }
    if (s.windowCount >= d.content.maximumEvaluationsPerWindow) {
      if (changed && !(await this.save(s, h, now))) conflict();
      return null;
    }
    if (s.deliveries.length >= d.content.maximumWakeups) capacity();
    const observationIds = [
      ...new Set([
        ...s.pendingObservationIds,
        ...coverage.flatMap((x) => (x.observationId ? [x.observationId] : [])),
      ]),
    ];
    const wakeup: AttentionEvaluationWakeupV1 = {
      schemaVersion: 1,
      tenantId: p.tenantId,
      agentId: r.agentId,
      definitionId: r.definitionId,
      wakeupId: await digest({
        tenantId: p.tenantId,
        agentId: r.agentId,
        definitionId: r.definitionId,
        index: s.deliveries.length,
        coverageDigest,
        observationIds,
      }),
      createdAt: now,
      governance: binding(h),
      observationIds,
      referenceIds,
      coverage,
      contradictory,
      executionAuthorized: false,
    };
    s.deliveries.push({
      wakeup,
      status: "pending",
      workerId: null,
      claimToken: null,
      leaseUntil: null,
      generation: 0,
    });
    s.pendingObservationIds = [];
    s.lastScheduledAt = now;
    s.lastCoverageDigest = coverageDigest;
    s.windowCount++;
    if (!(await this.save(s, h, now))) conflict();
    return clone(wakeup);
  }
  async claim(
    context: Context,
    input: {
      agentId: string;
      definitionId: string;
      claimToken: string;
      leaseMs: number;
    },
  ): Promise<AttentionWakeupDeliveryV1 | null> {
    const r = clone(input);
    exact(r, ["agentId", "definitionId", "claimToken", "leaseMs"]);
    id(r.agentId);
    id(r.definitionId);
    id(r.claimToken);
    integer(r.leaseMs, 1, 60000);
    const p = await this.principal(context, {
        agentId: r.agentId,
        definitionId: r.definitionId,
        operation: "work",
      }),
      h = await this.active(p, r),
      now = this.now(),
      s = await this.state(p, r, now);
    const replay = s.deliveries.find(
      (x) =>
        x.status === "leased" &&
        x.workerId === p.subjectId &&
        x.claimToken === r.claimToken &&
        x.leaseUntil! > now &&
        x.wakeup.governance.revision === h.revision,
    );
    if (replay) return clone(replay);
    const item = s.deliveries.find(
      (x) =>
        x.wakeup.governance.revision === h.revision &&
        (x.status === "pending" ||
          (x.status === "leased" && x.leaseUntil! <= now)),
    );
    if (!item) return null;
    item.status = "leased";
    item.workerId = p.subjectId;
    item.claimToken = r.claimToken;
    item.leaseUntil = new Date(Date.parse(now) + r.leaseMs).toISOString();
    item.generation++;
    if (!(await this.save(s, h, now))) conflict();
    return clone(item);
  }
  async complete(
    context: Context,
    input: {
      agentId: string;
      definitionId: string;
      wakeupId: string;
      claimToken: string;
      generation: number;
    },
  ): Promise<void> {
    const r = clone(input);
    exact(r, [
      "agentId",
      "definitionId",
      "wakeupId",
      "claimToken",
      "generation",
    ]);
    [r.agentId, r.definitionId, r.wakeupId, r.claimToken].forEach(id);
    integer(r.generation, 1, Number.MAX_SAFE_INTEGER - 1);
    const p = await this.principal(context, {
        agentId: r.agentId,
        definitionId: r.definitionId,
        operation: "work",
      }),
      h = await this.active(p, r),
      now = this.now(),
      s = await this.state(p, r, now);
    const item = s.deliveries.find((x) => x.wakeup.wakeupId === r.wakeupId);
    if (
      !item ||
      item.workerId !== p.subjectId ||
      item.claimToken !== r.claimToken ||
      item.generation !== r.generation ||
      item.wakeup.governance.revision !== h.revision
    )
      conflict();
    if (item.status === "delivered") return;
    if (item.status !== "leased" || item.leaseUntil! <= now) conflict();
    item.status = "delivered";
    if (!(await this.save(s, h, now))) conflict();
  }
  /** Sink MUST deduplicate wakeupId. Crash after sink acceptance replays the same payload. */
  async deliverOne(
    context: Context,
    input: {
      agentId: string;
      definitionId: string;
      claimToken: string;
      leaseMs: number;
    },
    sink: { notify(wakeup: AttentionEvaluationWakeupV1): Promise<void> },
  ): Promise<boolean> {
    const claim = await this.claim(context, input);
    if (!claim) return false;
    await sink.notify(clone(claim.wakeup));
    await this.complete(context, {
      agentId: claim.wakeup.agentId,
      definitionId: claim.wakeup.definitionId,
      wakeupId: claim.wakeup.wakeupId,
      claimToken: claim.claimToken!,
      generation: claim.generation,
    });
    return true;
  }
  private async publish(
    p: AgentGovernancePrincipalV1,
    h: AgentGovernanceHeadV1,
    body:
      | { type: "definition"; content: AttentionSignalDefinitionInputV1 }
      | { type: "reference"; content: AttentionSignalReferenceInputV1 },
  ) {
    const valueDigest = await digest(body),
      recordId = `${body.type}:${valueDigest}`;
    const r: AttentionSignalCatalogV1 = {
      schemaVersion: 1,
      tenantId: p.tenantId,
      agentId: h.agentId,
      recordId,
      createdBy: p.subjectId,
      createdAt: this.now(),
      digest: valueDigest,
      ...body,
    };
    if (!(await this.store.put(r, binding(h)))) conflict();
    return (await this.store.catalog(p.tenantId, h.agentId, recordId))!;
  }
  private async head(p: AgentGovernancePrincipalV1, a: string) {
    const h = await this.governance.load(p.tenantId, a);
    if (!h || h.configuration.interactionMode !== "purpose") conflict();
    if (this.now() < h.updatedAt) conflict();
    return h;
  }
  private authority(
    p: AgentGovernancePrincipalV1,
    h: AgentGovernanceHeadV1,
    operation: "signals" | "references",
    expected: number,
  ) {
    if (h.revision !== expected) conflict();
    if (
      h.configuration.ownerId !== p.subjectId &&
      !h.configuration.delegations.some(
        (d) =>
          d.subjectId === p.subjectId &&
          d.operation === operation &&
          d.expiresAt > this.now(),
      )
    )
      denied();
  }
  private async active(
    p: AgentGovernancePrincipalV1,
    r: { agentId: string; definitionId: string },
  ) {
    const h = await this.head(p, r.agentId);
    if (!h.configuration.signalRefs.includes(r.definitionId)) conflict();
    return h;
  }
  private async definition(t: string, a: string, d: string) {
    const r = await this.store.catalog(t, a, d);
    if (!r || r.type !== "definition") missing();
    return r;
  }
  private async references(
    p: AgentGovernancePrincipalV1,
    r: { agentId: string; definitionId: string },
    h: AgentGovernanceHeadV1,
  ) {
    const result: AttentionSignalCatalogV1[] = [];
    for (const ref of h.configuration.referenceRefs) {
      const item = await this.store.catalog(p.tenantId, r.agentId, ref);
      if (!item || item.type !== "reference") missing();
      if (item.content.definitionId === r.definitionId) result.push(item);
    }
    return result.sort((a, b) => a.recordId.localeCompare(b.recordId));
  }
  private now() {
    return this.clock().toISOString();
  }
  private async state(
    p: AgentGovernancePrincipalV1,
    r: { agentId: string; definitionId: string },
    now: string,
  ): Promise<AttentionSignalStateV1> {
    const s = await this.store.load(p.tenantId, r.agentId, r.definitionId);
    if (s && now < s.updatedAt) conflict();
    return (
      s ?? {
        tenantId: p.tenantId,
        agentId: r.agentId,
        definitionId: r.definitionId,
        revision: -1,
        updatedAt: now,
        observations: [],
        pendingObservationIds: [],
        deliveries: [],
        lastScheduledAt: null,
        lastCoverageDigest: null,
        windowStartedAt: null,
        windowCount: 0,
      }
    );
  }
  private save(
    s: AttentionSignalStateV1,
    h: AgentGovernanceHeadV1,
    now: string,
  ) {
    const expected = s.revision === -1 ? null : s.revision;
    s.revision++;
    s.updatedAt = now;
    return this.store.commit(s, expected, binding(h));
  }
  private async principal(
    context: Context,
    r: Parameters<AttentionSignalAccessV1<Context>["authorize"]>[1],
  ) {
    try {
      const p = clone(await this.access.authenticate(context));
      if (!p) denied();
      id(p.tenantId);
      id(p.subjectId);
      if (!(await this.access.authorize(clone(p), clone(r)))) denied();
      return p;
    } catch {
      return denied();
    }
  }
}
function coverageAt(
  s: Pick<AttentionSignalStateV1, "observations">,
  d: AttentionSignalDefinitionInputV1,
  now: string,
): AttentionCoverageV1[] {
  return d.sourceIds.map((sourceId) => {
    const latest = s.observations
      .filter((o) => o.sourceId === sourceId)
      .sort(
        (a, b) =>
          b.observedAt.localeCompare(a.observedAt) ||
          b.receivedAt.localeCompare(a.receivedAt) ||
          b.observationId.localeCompare(a.observationId),
      )[0];
    return {
      sourceId,
      observationId: latest?.observationId ?? null,
      status: !latest
        ? "missing"
        : latest.availability === "unavailable"
          ? "unavailable"
          : Date.parse(now) - Date.parse(latest.observedAt) > d.freshnessMs
            ? "stale"
            : "fresh",
    };
  });
}
function binding(h: AgentGovernanceHeadV1): InceptionGovernanceBindingV1 {
  return {
    governanceId: h.governanceId,
    revision: h.revision,
    authorityEpoch: h.authorityEpoch,
    configurationDigest: h.configurationDigest,
    definitionRevisionId: h.configuration.definitionRevisionId,
  };
}
export function validateAttentionStateCommitV1(
  s: AttentionSignalStateV1,
  expected: number | null,
) {
  if (s.revision !== (expected === null ? 0 : expected + 1)) invalid();
  integer(s.revision, 0, Number.MAX_SAFE_INTEGER - 1);
}
function validateDefinition(d: AttentionSignalDefinitionInputV1) {
  exact(d, [
    "signalId",
    "kind",
    "description",
    "sourceIds",
    "freshnessMs",
    "cadenceMs",
    "evaluationWindowMs",
    "maximumEvaluationsPerWindow",
    "maximumObservations",
    "maximumWakeups",
  ]);
  id(d.signalId);
  text(d.description, 8000);
  if (!["quantitative", "qualitative", "event"].includes(d.kind)) invalid();
  ids(d.sourceIds, 16);
  if (!d.sourceIds.length) invalid();
  integer(d.freshnessMs, 1, 31536000000);
  integer(d.cadenceMs, 1, 31536000000);
  integer(d.evaluationWindowMs, d.cadenceMs, 31536000000);
  integer(d.maximumEvaluationsPerWindow, 1, 1024);
  integer(d.maximumObservations, 1, 256);
  integer(d.maximumWakeups, 1, 1024);
}
function validateReference(r: AttentionSignalReferenceInputV1) {
  exact(r, ["definitionId", "interpretation"]);
  id(r.definitionId);
  const i = r.interpretation;
  if (i?.kind === "quantitative") {
    exact(i, ["kind", "minimum", "maximum"]);
    if (
      !Number.isFinite(i.minimum) ||
      !Number.isFinite(i.maximum) ||
      i.minimum > i.maximum
    )
      invalid();
  } else if (i?.kind === "qualitative") {
    exact(i, ["kind", "criterion"]);
    text(i.criterion, 8000);
  } else invalid();
}
function validateObservation(r: AttentionObservationInputV1) {
  exact(r, [
    "agentId",
    "definitionId",
    "sourceId",
    "eventId",
    "observedAt",
    "availability",
    "value",
    "evidenceRefs",
  ]);
  [r.agentId, r.definitionId, r.sourceId, r.eventId].forEach(id);
  timestamp(r.observedAt);
  ids(r.evidenceRefs, 32);
  if (r.availability === "unavailable") {
    if (r.value !== null) invalid();
  } else if (r.availability === "observed") {
    if (typeof r.value === "number") {
      if (!Number.isFinite(r.value)) invalid();
    } else text(r.value, 8000);
  } else invalid();
}
function validateScope(r: { agentId: string; definitionId: string }) {
  exact(r, ["agentId", "definitionId"]);
  id(r.agentId);
  id(r.definitionId);
}
function integer(v: number, min: number, max: number) {
  if (!Number.isSafeInteger(v) || v < min || v > max) invalid();
}
function timestamp(v: string) {
  if (
    typeof v !== "string" ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString() !== v
  )
    invalid();
}
function id(v: string) {
  if (
    typeof v !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/u.test(v)
  )
    invalid();
}
function ids(v: string[], max: number) {
  if (!Array.isArray(v) || v.length > max || new Set(v).size !== v.length)
    invalid();
  v.forEach(id);
}
function text(v: unknown, max: number) {
  if (typeof v !== "string" || !v.trim() || v.length > max) invalid();
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
function clone<T>(v: T): T {
  return structuredClone(v);
}
function key(...v: string[]) {
  return JSON.stringify(v);
}
function digest(v: unknown) {
  return governanceDigestV1({
    domain: "agent-attention-v1",
    value: JSON.parse(JSON.stringify(v)) as JsonValue,
  });
}
function invalid(): never {
  throw new AgentPlatError(
    "VALIDATION_ERROR",
    "Attention signal input is invalid",
  );
}
function denied(): never {
  throw new AgentPlatError("FORBIDDEN", "Attention signal access denied");
}
function conflict(): never {
  throw new AgentPlatError(
    "CONFLICT",
    "Attention signal governance, revision or event conflict",
  );
}
function capacity(): never {
  throw new AgentPlatError(
    "CONFLICT",
    "Attention signal capacity exhausted; retained identities are not evicted",
  );
}
function missing(): never {
  throw new AgentPlatError(
    "NOT_FOUND",
    "Attention signal definition or reference not found",
  );
}
