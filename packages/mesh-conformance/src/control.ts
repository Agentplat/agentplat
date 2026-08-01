import {
  authorizeDelegationMandateAtV1,
  issueGovernedActionPermitV1,
  registerWorkContractV1,
  transitionGovernedActionPermitV1,
  validateCollectiveAuthorityStateV1,
  validateCollectiveDecisionRecordV1,
  validateCollectiveExecutionStateV1,
  validateWorkContractV1,
  type BudgetReservationV1,
  type CollectiveAuthorityRepositoryV1,
  type CollectiveAuthorityStateV1,
  type CollectiveDecisionRecordV1,
  type CollectiveDigestV1,
  type CollectiveEvidenceSinkV1,
  type CollectiveExecutionRepositoryV1,
  type CollectiveExecutionStateV1,
  type DelegationMandateV1,
  type GovernedActionPermitV1,
  type WorkContractV1,
} from "@agentplat/collective-control";
import { validateDelegationMandateProposalV1 } from "@agentplat/collective-control/rooms";
import {
  controlDigest,
  issueActionGrantV1,
  type ActionGrant,
  type ActionGrantRepository,
  type ActionIdempotencyRecord,
  type ControlJson,
} from "@agentplat/inference-control/tools";

export const CONTROL_CONFORMANCE_VERSION = 1 as const;

export const CONTROL_CONFORMANCE_CAPABILITIES = Object.freeze([
  "control.portable",
  "control.repositories",
  "control.rooms",
  "control.persistence",
] as const);

export type ControlConformanceCapability =
  (typeof CONTROL_CONFORMANCE_CAPABILITIES)[number];

export const CONTROL_REQUIRED_CONFORMANCE_CAPABILITIES = Object.freeze([
  "control.portable",
  "control.repositories",
] as const satisfies readonly ControlConformanceCapability[]);

export interface ControlConformanceCaseDefinitionV1 {
  readonly caseId: string;
  readonly capability: ControlConformanceCapability;
}

export const CONTROL_CONFORMANCE_CASES_V1 = Object.freeze([
  define("control.authority.unknown_digest", "control.portable"),
  define("control.work.scope_widening", "control.portable"),
  define("control.permit.single_use", "control.portable"),
  define("control.permit.indeterminate_retained", "control.portable"),
  define("control.authority.cas_stale", "control.repositories"),
  define("control.execution.cas_stale", "control.repositories"),
  define("control.grant.exact_idempotency", "control.repositories"),
  define("control.grant.substitution_conflict", "control.repositories"),
  define("control.grant.cas_stale", "control.repositories"),
  define("control.evidence.chain", "control.repositories"),
  define("control.evidence.conflict", "control.repositories"),
  define("control.evidence.redaction", "control.repositories"),
  define("control.rooms.proposal_inert", "control.rooms"),
  define("control.persistence.restart", "control.persistence"),
] as const satisfies readonly ControlConformanceCaseDefinitionV1[]);

export type ControlConformanceCaseIdV1 =
  (typeof CONTROL_CONFORMANCE_CASES_V1)[number]["caseId"];

export interface ControlConformanceFixturesV1 {
  readonly authorityState: CollectiveAuthorityStateV1;
  readonly mandate: DelegationMandateV1;
  readonly emptyExecutionState: CollectiveExecutionStateV1;
  readonly executionState: CollectiveExecutionStateV1;
  readonly validWorkContract: WorkContractV1;
  readonly widenedWorkContract: WorkContractV1;
  readonly budgetReservation: BudgetReservationV1;
  readonly actionPermit: GovernedActionPermitV1;
  readonly actionGrant: ActionGrant;
  readonly conflictingActionGrant: ActionGrant;
  readonly evidenceRecords: readonly [
    CollectiveDecisionRecordV1,
    CollectiveDecisionRecordV1,
  ];
  readonly conflictingEvidenceRecord: CollectiveDecisionRecordV1;
  readonly secretCanary: string;
  readonly roomProposal?: unknown;
}

export interface ControlConformanceAdapterV1 {
  readonly authorityRepository: CollectiveAuthorityRepositoryV1;
  readonly executionRepository: CollectiveExecutionRepositoryV1;
  readonly actionGrantRepository: ActionGrantRepository;
  readonly evidenceSink: CollectiveEvidenceSinkV1;
  /** Independent, redacted view of what the sink persisted. */
  readonly inspectEvidence: () => unknown | Promise<unknown>;
  readonly fixtures: ControlConformanceFixturesV1;
  readonly restart?: () =>
    ControlConformanceRestartV1 | Promise<ControlConformanceRestartV1>;
  readonly cleanup?: () => void | Promise<void>;
}

export interface ControlConformanceRestartV1 {
  readonly authorityRepository: CollectiveAuthorityRepositoryV1;
  readonly executionRepository: CollectiveExecutionRepositoryV1;
  readonly actionGrantRepository: ActionGrantRepository;
  readonly evidenceSink: CollectiveEvidenceSinkV1;
}

export interface ControlConformanceFactoryContextV1 {
  readonly seed: number;
  readonly signal: AbortSignal;
}

export type ControlConformanceFactoryV1 = (
  caseId: ControlConformanceCaseIdV1,
  context: ControlConformanceFactoryContextV1,
) => ControlConformanceAdapterV1 | Promise<ControlConformanceAdapterV1>;

export interface ControlConformanceOptionsV1 {
  readonly declaredCapabilities: readonly ControlConformanceCapability[];
  readonly factory: ControlConformanceFactoryV1;
  readonly seed?: number;
  readonly timeoutMs?: number;
  readonly cleanupTimeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly clock?: () => number;
}

export interface ControlConformanceCaseResultV1 {
  readonly caseId: ControlConformanceCaseIdV1;
  readonly capability: ControlConformanceCapability;
  readonly outcome: "passed" | "failed" | "not_declared";
  readonly reasonCode: string | null;
  readonly durationMs: number;
}

export interface ControlConformanceReportV1 {
  readonly schemaVersion: 1;
  readonly conformanceVersion: number;
  readonly suiteDigest: CollectiveDigestV1;
  readonly fixtureManifestDigest: CollectiveDigestV1;
  readonly implementation: {
    readonly name: string;
    readonly version: string;
  };
  readonly declaredCapabilities: readonly ControlConformanceCapability[];
  readonly seed: number;
  readonly cases: readonly ControlConformanceCaseResultV1[];
  readonly counts: {
    readonly passed: number;
    readonly failed: number;
    readonly notDeclared: number;
    readonly total: number;
  };
  readonly verdict: "passed" | "failed";
}

export async function runControlConformanceV1(
  options: ControlConformanceOptionsV1,
): Promise<readonly ControlConformanceCaseResultV1[]> {
  const capabilities = normalizeCapabilities(options.declaredCapabilities);
  for (const required of CONTROL_REQUIRED_CONFORMANCE_CAPABILITIES) {
    if (!capabilities.has(required))
      throw new TypeError("Required control conformance capability is missing");
  }
  if (typeof options.factory !== "function")
    throw new TypeError("Control conformance factory is required");
  const seed = boundedInteger(options.seed ?? 0, "seed", 0, 0xffff_ffff);
  const timeoutMs = boundedInteger(
    options.timeoutMs ?? 5_000,
    "timeoutMs",
    10,
    60_000,
  );
  const cleanupTimeoutMs = boundedInteger(
    options.cleanupTimeoutMs ?? 2_000,
    "cleanupTimeoutMs",
    10,
    30_000,
  );
  const clock = options.clock ?? Date.now;
  const results: ControlConformanceCaseResultV1[] = [];
  for (const definition of CONTROL_CONFORMANCE_CASES_V1) {
    if (!capabilities.has(definition.capability)) {
      results.push(result(definition, "not_declared", null, 0));
      continue;
    }
    results.push(
      await runCase({
        definition,
        factory: options.factory,
        seed,
        timeoutMs,
        cleanupTimeoutMs,
        signal: options.signal,
        clock,
      }),
    );
  }
  return Object.freeze(results);
}

export function createControlConformanceReportV1(input: {
  readonly suiteDigest: CollectiveDigestV1;
  readonly fixtureManifestDigest: CollectiveDigestV1;
  readonly implementation: {
    readonly name: string;
    readonly version: string;
  };
  readonly declaredCapabilities: readonly ControlConformanceCapability[];
  readonly seed: number;
  readonly cases: readonly ControlConformanceCaseResultV1[];
}): ControlConformanceReportV1 {
  exactRecord(input, [
    "suiteDigest",
    "fixtureManifestDigest",
    "implementation",
    "declaredCapabilities",
    "seed",
    "cases",
  ]);
  exactRecord(input.implementation, ["name", "version"]);
  if (
    !input.implementation?.name ||
    !input.implementation.version ||
    input.implementation.name.length > 128 ||
    input.implementation.version.length > 64
  )
    throw new TypeError("Control conformance implementation is invalid");
  const capabilities = [
    ...normalizeCapabilities(input.declaredCapabilities),
  ].sort();
  const suiteDigest = boundedDigest(input.suiteDigest);
  const fixtureManifestDigest = boundedDigest(input.fixtureManifestDigest);
  const seed = boundedInteger(input.seed, "seed", 0, 0xffff_ffff);
  if (input.cases.length !== CONTROL_CONFORMANCE_CASES_V1.length)
    throw new TypeError("Control conformance case coverage is incomplete");
  const byId = new Map(input.cases.map((entry) => [entry.caseId, entry]));
  if (byId.size !== input.cases.length)
    throw new TypeError("Control conformance case is duplicated");
  const cases = CONTROL_CONFORMANCE_CASES_V1.map((definition) => {
    const entry = byId.get(definition.caseId);
    if (entry)
      exactRecord(entry, [
        "caseId",
        "capability",
        "outcome",
        "reasonCode",
        "durationMs",
      ]);
    if (
      !entry ||
      entry.capability !== definition.capability ||
      !["passed", "failed", "not_declared"].includes(entry.outcome) ||
      !Number.isSafeInteger(entry.durationMs) ||
      entry.durationMs < 0 ||
      entry.durationMs > 60_000 ||
      (entry.outcome === "failed") !== (entry.reasonCode !== null) ||
      (entry.reasonCode !== null &&
        !/^[a-z][a-z0-9._:-]{0,63}$/u.test(entry.reasonCode)) ||
      (capabilities.includes(entry.capability) &&
        entry.outcome === "not_declared") ||
      (!capabilities.includes(entry.capability) &&
        entry.outcome !== "not_declared")
    )
      throw new TypeError("Control conformance case result is invalid");
    return Object.freeze({ ...entry });
  });
  const counts = Object.freeze({
    passed: cases.filter((entry) => entry.outcome === "passed").length,
    failed: cases.filter((entry) => entry.outcome === "failed").length,
    notDeclared: cases.filter((entry) => entry.outcome === "not_declared")
      .length,
    total: cases.length,
  });
  return Object.freeze({
    schemaVersion: 1,
    conformanceVersion: CONTROL_CONFORMANCE_VERSION,
    suiteDigest,
    fixtureManifestDigest,
    implementation: Object.freeze({ ...input.implementation }),
    declaredCapabilities: Object.freeze(capabilities),
    seed,
    cases: Object.freeze(cases),
    counts,
    verdict: counts.failed === 0 ? "passed" : "failed",
  });
}

export function validateControlConformanceReportV1(
  value: unknown,
): ControlConformanceReportV1 {
  exactRecord(value, [
    "schemaVersion",
    "conformanceVersion",
    "suiteDigest",
    "fixtureManifestDigest",
    "implementation",
    "declaredCapabilities",
    "seed",
    "cases",
    "counts",
    "verdict",
  ]);
  const report = value as unknown as ControlConformanceReportV1;
  if (
    report.schemaVersion !== 1 ||
    report.conformanceVersion !== CONTROL_CONFORMANCE_VERSION
  )
    throw new TypeError("Control conformance report version is unsupported");
  const normalized = createControlConformanceReportV1({
    suiteDigest: report.suiteDigest,
    fixtureManifestDigest: report.fixtureManifestDigest,
    implementation: report.implementation,
    declaredCapabilities: report.declaredCapabilities,
    seed: report.seed,
    cases: report.cases,
  });
  exactRecord(report.counts, ["passed", "failed", "notDeclared", "total"]);
  if (
    normalized.counts.passed !== report.counts.passed ||
    normalized.counts.failed !== report.counts.failed ||
    normalized.counts.notDeclared !== report.counts.notDeclared ||
    normalized.counts.total !== report.counts.total ||
    normalized.verdict !== report.verdict
  )
    throw new TypeError("Control conformance report aggregate is inconsistent");
  return normalized;
}

async function runCase(input: {
  definition: (typeof CONTROL_CONFORMANCE_CASES_V1)[number];
  factory: ControlConformanceFactoryV1;
  seed: number;
  timeoutMs: number;
  cleanupTimeoutMs: number;
  signal?: AbortSignal;
  clock: () => number;
}): Promise<ControlConformanceCaseResultV1> {
  const started = input.clock();
  const controller = new AbortController();
  const relay = () => controller.abort(new Error("aborted"));
  input.signal?.addEventListener("abort", relay, { once: true });
  let adapter: ControlConformanceAdapterV1 | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let outcome: ControlConformanceCaseResultV1["outcome"] = "passed";
  let reasonCode: string | null = null;
  try {
    if (input.signal?.aborted) throw new Error("aborted");
    timeout = setTimeout(
      () => controller.abort(new Error("timeout")),
      input.timeoutMs,
    );
    adapter = await raceAbort(
      input.factory(input.definition.caseId, {
        seed: input.seed,
        signal: controller.signal,
      }),
      controller.signal,
    );
    validateAdapter(adapter);
    await raceAbort(
      verifyCase(input.definition.caseId, adapter),
      controller.signal,
    );
    if (controller.signal.aborted) throw controller.signal.reason;
  } catch (error) {
    outcome = "failed";
    reasonCode =
      error instanceof Error && error.message === "timeout"
        ? "timeout"
        : error instanceof Error && error.message === "aborted"
          ? "aborted"
          : "assertion_failed";
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    input.signal?.removeEventListener("abort", relay);
    if (adapter?.cleanup) {
      let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.resolve().then(adapter.cleanup),
          new Promise<never>((_resolve, reject) => {
            cleanupTimer = setTimeout(
              () => reject(new Error("cleanup_timeout")),
              input.cleanupTimeoutMs,
            );
          }),
        ]);
      } catch {
        outcome = "failed";
        reasonCode = "cleanup_failed";
      } finally {
        if (cleanupTimer !== undefined) clearTimeout(cleanupTimer);
      }
    }
  }
  return result(
    input.definition,
    outcome,
    reasonCode,
    duration(started, input.clock()),
  );
}

async function verifyCase(
  caseId: ControlConformanceCaseIdV1,
  adapter: ControlConformanceAdapterV1,
): Promise<void> {
  const fixture = adapter.fixtures;
  switch (caseId) {
    case "control.authority.unknown_digest": {
      const state = validateCollectiveAuthorityStateV1(
        await adapter.authorityRepository.read(),
      );
      const decision = authorizeDelegationMandateAtV1(state, {
        mandateId: fixture.mandate.statement.mandateId,
        mandateDigest: changedDigest(fixture.mandate.mandateDigest),
        at: "2026-08-01T00:01:00.000Z",
      });
      assert(!decision.authorized, "unknown mandate digest was accepted");
      return;
    }
    case "control.work.scope_widening": {
      const valid = registerWorkContractV1(fixture.emptyExecutionState, {
        mandate: fixture.mandate,
        workContract: fixture.validWorkContract,
        authorizedAt: "2026-08-01T00:01:00.000Z",
        acceptedAtLogicalMs: 10,
      });
      const widened = registerWorkContractV1(fixture.emptyExecutionState, {
        mandate: fixture.mandate,
        workContract: fixture.widenedWorkContract,
        authorizedAt: "2026-08-01T00:01:00.000Z",
        acceptedAtLogicalMs: 10,
      });
      assert(
        valid.accepted && !widened.accepted,
        "work narrowing was not enforced",
      );
      return;
    }
    case "control.permit.single_use": {
      let state = issuePermit(fixture);
      state = transitionPermit(
        state,
        fixture.actionPermit.permitId,
        "reserved",
        null,
        21,
      );
      state = transitionPermit(
        state,
        fixture.actionPermit.permitId,
        "dispatching",
        null,
        22,
      );
      state = transitionPermit(
        state,
        fixture.actionPermit.permitId,
        "dispatched",
        "outcome:conformance",
        23,
      );
      const prior = state.actionPermits.find(
        (permit) => permit.permitId === fixture.actionPermit.permitId,
      )!;
      const replay = transitionGovernedActionPermitV1(state, {
        permitId: prior.permitId,
        expectedGeneration: prior.generation,
        expectedDigest: prior.permitDigest,
        nextStatus: "dispatched",
        outcomeId: "outcome:conformance",
        logicalTimeMs: 24,
      });
      assert(
        !replay.accepted && replay.state.stateDigest === state.stateDigest,
        "permit replay was accepted",
      );
      return;
    }
    case "control.permit.indeterminate_retained": {
      let state = issuePermit(fixture);
      state = transitionPermit(
        state,
        fixture.actionPermit.permitId,
        "reserved",
        null,
        21,
      );
      state = transitionPermit(
        state,
        fixture.actionPermit.permitId,
        "dispatching",
        null,
        22,
      );
      state = transitionPermit(
        state,
        fixture.actionPermit.permitId,
        "indeterminate",
        "outcome:unknown",
        23,
      );
      const reservation = state.budgetReservations.find(
        (entry) =>
          entry.reservationId === fixture.budgetReservation.reservationId,
      )!;
      assert(
        reservation.status === "indeterminate" &&
          reservation.outcomeId === "outcome:unknown",
        "indeterminate budget was released",
      );
      return;
    }
    case "control.authority.cas_stale": {
      const current = validateCollectiveAuthorityStateV1(
        await adapter.authorityRepository.read(),
      );
      const written = await adapter.authorityRepository.compareAndSwap({
        expectedGeneration: current.generation - 1,
        expectedStateDigest: current.stateDigest,
        nextState: current,
      });
      assert(!written, "stale authority CAS committed");
      return;
    }
    case "control.execution.cas_stale": {
      const current = validateCollectiveExecutionStateV1(
        await adapter.executionRepository.read(),
      );
      const written = await adapter.executionRepository.compareAndSwap({
        expectedGeneration: current.generation - 1,
        expectedStateDigest: current.stateDigest,
        nextState: current,
      });
      assert(!written, "stale execution CAS committed");
      return;
    }
    case "control.grant.exact_idempotency": {
      const first = await issueActionGrantV1(
        adapter.actionGrantRepository,
        fixture.actionGrant,
      );
      const second = await issueActionGrantV1(
        adapter.actionGrantRepository,
        fixture.actionGrant,
      );
      assert(
        grantDigest(first) === grantDigest(second),
        "grant retry changed durable state",
      );
      return;
    }
    case "control.grant.substitution_conflict": {
      await issueActionGrantV1(
        adapter.actionGrantRepository,
        fixture.actionGrant,
      );
      let rejected = false;
      try {
        await issueActionGrantV1(
          adapter.actionGrantRepository,
          fixture.conflictingActionGrant,
        );
      } catch {
        rejected = true;
      }
      assert(rejected, "grant substitution was accepted");
      return;
    }
    case "control.grant.cas_stale": {
      const grant = await issueActionGrantV1(
        adapter.actionGrantRepository,
        fixture.actionGrant,
      );
      const cas = await adapter.actionGrantRepository.compareAndSwapGrant({
        grantId: grant.grantId,
        expectedStateGeneration: grant.stateGeneration,
        expectedGrantDigest: changedDigest(grantDigest(grant)),
        nextGrant: grant,
        nextIdempotency: idempotency(grant),
      });
      assert(cas.status === "conflict", "stale grant CAS committed");
      return;
    }
    case "control.evidence.chain": {
      const [first, second] = fixture.evidenceRecords.map(
        validateCollectiveDecisionRecordV1,
      ) as [CollectiveDecisionRecordV1, CollectiveDecisionRecordV1];
      const one = await adapter.evidenceSink.append(first);
      const duplicate = await adapter.evidenceSink.append(first);
      const two = await adapter.evidenceSink.append(second);
      const anchor = await adapter.evidenceSink.anchor();
      assert(
        one.code === "appended" &&
          duplicate.code === "duplicate" &&
          two.code === "appended" &&
          anchor.recordCount === 2 &&
          anchor.latestRecordDigest === second.recordDigest,
        "evidence chain is not exact-idempotent",
      );
      return;
    }
    case "control.evidence.conflict": {
      const first = fixture.evidenceRecords[0];
      await adapter.evidenceSink.append(first);
      const conflict = await adapter.evidenceSink.append(
        fixture.conflictingEvidenceRecord,
      );
      assert(
        conflict.code === "chain_conflict",
        "evidence conflict was accepted",
      );
      return;
    }
    case "control.evidence.redaction": {
      assert(
        fixture.secretCanary.length >= 16,
        "secret canary is not sensitive",
      );
      await adapter.evidenceSink.append(fixture.evidenceRecords[0]);
      const persisted = await adapter.inspectEvidence();
      assert(
        !JSON.stringify(persisted).includes(fixture.secretCanary),
        "raw secret was retained in evidence",
      );
      return;
    }
    case "control.rooms.proposal_inert": {
      const proposal = validateDelegationMandateProposalV1(
        fixture.roomProposal,
      );
      assert(
        !("proof" in proposal) && !("mandateDigest" in proposal),
        "Room proposal installed authority",
      );
      return;
    }
    case "control.persistence.restart": {
      assert(
        adapter.restart !== undefined,
        "persistence restart is unavailable",
      );
      await issueActionGrantV1(
        adapter.actionGrantRepository,
        fixture.actionGrant,
      );
      await adapter.evidenceSink.append(fixture.evidenceRecords[0]);
      const restarted = await adapter.restart();
      const authority = await restarted.authorityRepository.read();
      const execution = await restarted.executionRepository.read();
      const grant = await restarted.actionGrantRepository.loadGrant(
        fixture.actionGrant.grantId,
      );
      const anchor = await restarted.evidenceSink.anchor();
      assert(
        authority.stateDigest === fixture.authorityState.stateDigest &&
          execution.stateDigest === fixture.executionState.stateDigest &&
          grant !== undefined &&
          grantDigest(grant) === grantDigest(fixture.actionGrant) &&
          anchor.latestRecordDigest === fixture.evidenceRecords[0].recordDigest,
        "restart did not preserve exact durable state",
      );
      return;
    }
  }
}

function issuePermit(fixture: ControlConformanceFixturesV1) {
  const decision = issueGovernedActionPermitV1(fixture.executionState, {
    mandate: fixture.mandate,
    budgetReservation: fixture.budgetReservation,
    actionPermit: fixture.actionPermit,
    authorizedAt: "2026-08-01T00:01:00.000Z",
    acceptedAtLogicalMs: 20,
  });
  assert(decision.accepted, "fixture permit could not be issued");
  return decision.state;
}

function transitionPermit(
  state: CollectiveExecutionStateV1,
  permitId: string,
  nextStatus: GovernedActionPermitV1["status"],
  outcomeId: string | null,
  logicalTimeMs: number,
) {
  const prior = state.actionPermits.find(
    (permit) => permit.permitId === permitId,
  )!;
  const decision = transitionGovernedActionPermitV1(state, {
    permitId,
    expectedGeneration: prior.generation,
    expectedDigest: prior.permitDigest,
    nextStatus,
    outcomeId,
    logicalTimeMs,
  });
  assert(decision.accepted, `permit transition ${nextStatus} failed`);
  return decision.state;
}

function normalizeCapabilities(
  values: readonly ControlConformanceCapability[],
): ReadonlySet<ControlConformanceCapability> {
  if (
    !Array.isArray(values) ||
    values.length > CONTROL_CONFORMANCE_CAPABILITIES.length
  )
    throw new TypeError("Control conformance capabilities are invalid");
  const result = new Set<ControlConformanceCapability>();
  for (const value of values) {
    if (!CONTROL_CONFORMANCE_CAPABILITIES.includes(value) || result.has(value))
      throw new TypeError("Control conformance capability is invalid");
    result.add(value);
  }
  return result;
}

function validateAdapter(adapter: ControlConformanceAdapterV1) {
  if (
    !adapter?.authorityRepository ||
    !adapter.executionRepository ||
    !adapter.actionGrantRepository ||
    !adapter.evidenceSink ||
    typeof adapter.inspectEvidence !== "function" ||
    !adapter.fixtures
  )
    throw new TypeError("Control conformance adapter is incomplete");
  validateCollectiveAuthorityStateV1(adapter.fixtures.authorityState);
  validateCollectiveExecutionStateV1(adapter.fixtures.emptyExecutionState);
  validateCollectiveExecutionStateV1(adapter.fixtures.executionState);
  validateWorkContractV1(adapter.fixtures.validWorkContract);
  validateWorkContractV1(adapter.fixtures.widenedWorkContract);
}

async function raceAbort<T>(
  operation: T | PromiseLike<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw signal.reason;
  let listener: (() => void) | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_resolve, reject) => {
        listener = () => reject(signal.reason);
        signal.addEventListener("abort", listener, { once: true });
      }),
    ]);
  } finally {
    if (listener) signal.removeEventListener("abort", listener);
  }
}

function result(
  definition: ControlConformanceCaseDefinitionV1,
  outcome: ControlConformanceCaseResultV1["outcome"],
  reasonCode: string | null,
  durationMs: number,
): ControlConformanceCaseResultV1 {
  return Object.freeze({
    caseId: definition.caseId as ControlConformanceCaseIdV1,
    capability: definition.capability,
    outcome,
    reasonCode,
    durationMs,
  });
}

function define<
  const CaseId extends string,
  const Capability extends ControlConformanceCapability,
>(
  caseId: CaseId,
  capability: Capability,
): Readonly<{ caseId: CaseId; capability: Capability }> {
  return Object.freeze({ caseId, capability });
}

function boundedDigest(value: string): CollectiveDigestV1 {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError("Control conformance digest is invalid");
  return value as CollectiveDigestV1;
}

function exactRecord(value: unknown, keys: readonly string[]): void {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Control conformance value must be an exact record");
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    throw new TypeError("Control conformance value must have exact shape");
}

function changedDigest(value: string): CollectiveDigestV1 {
  const last = value.at(-1) === "0" ? "1" : "0";
  return `${value.slice(0, -1)}${last}` as CollectiveDigestV1;
}

function grantDigest(grant: ActionGrant): string {
  return controlDigest("grant", grant as unknown as ControlJson);
}

function idempotency(grant: ActionGrant): ActionIdempotencyRecord {
  return Object.freeze({
    schemaVersion: 1,
    scopeDigest: grant.scopeDigest,
    idempotencyKey: grant.idempotencyKey,
    actionDigest: grant.actionDigest,
    grantId: grant.grantId,
    retainedOutcome: grant.status,
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (condition !== true) throw new TypeError(message);
}

function boundedInteger(
  value: number,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new TypeError(`${label} is invalid`);
  return value;
}

function duration(started: number, ended: number) {
  return Math.min(60_000, Math.max(0, Math.trunc(ended - started)));
}
