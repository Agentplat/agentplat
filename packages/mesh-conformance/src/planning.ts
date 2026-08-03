import {
  canonicalizePlanningJsonV1,
  deepFreezePlanning,
  sha256HexPlanningV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import {
  awaitConformanceOperation,
  MeshConformanceCleanupError,
  runConformanceCleanup,
} from "./runner.js";

/** Version of the portable planning conformance contract. */
export const PLANNING_CONFORMANCE_VERSION_V1 = 1 as const;

/**
 * Closed declarations. A declaration states which public case groups were
 * executed; it never grants authority to a planner or its runner.
 */
export const PLANNING_CONFORMANCE_CAPABILITIES_V1 = Object.freeze([
  "planning.portable",
  "planning.reducer",
  "planning.snapshot",
  "planning.replanning",
  "planning.fencing",
  "planning.mesh-projection",
  "planning.evaluation",
  "planning.durable",
] as const);

export type PlanningConformanceCapabilityV1 =
  (typeof PLANNING_CONFORMANCE_CAPABILITIES_V1)[number];

export const PLANNING_REQUIRED_CONFORMANCE_CAPABILITIES_V1 = Object.freeze([
  "planning.portable",
  "planning.reducer",
] as const satisfies readonly PlanningConformanceCapabilityV1[]);

export type PlanningConformanceCaseIdV1 =
  | "planning.intent.closed-record"
  | "planning.proposal.scope-widening"
  | "planning.reducer.dependency-cycle"
  | "planning.reducer.exact-replay"
  | "planning.snapshot.cross-scope"
  | "planning.snapshot.rollback"
  | "planning.replanning.causal-predecessor"
  | "planning.fencing.stale-result"
  | "planning.mesh-projection.assignment-bound"
  | "planning.evaluation.public-artifact"
  | "planning.durable.restart-high-water";

export type PlanningConformanceExpectedVerdictV1 = "accepted" | "rejected";

export interface PlanningConformanceCaseDefinitionV1 {
  readonly caseId: PlanningConformanceCaseIdV1;
  readonly capability: PlanningConformanceCapabilityV1;
  readonly expectedVerdict: PlanningConformanceExpectedVerdictV1;
  readonly expectedReasonCode: string | null;
}

/** The complete public suite. Case identifiers and capability membership are closed. */
export const PLANNING_CONFORMANCE_CASES_V1 = Object.freeze([
  define(
    "planning.intent.closed-record",
    "planning.portable",
    "rejected",
    "unknown_field",
  ),
  define(
    "planning.proposal.scope-widening",
    "planning.portable",
    "rejected",
    "scope_widening",
  ),
  define(
    "planning.reducer.dependency-cycle",
    "planning.reducer",
    "rejected",
    "dependency_cycle",
  ),
  define("planning.reducer.exact-replay", "planning.reducer", "accepted", null),
  define(
    "planning.snapshot.cross-scope",
    "planning.snapshot",
    "rejected",
    "snapshot_scope_mismatch",
  ),
  define(
    "planning.snapshot.rollback",
    "planning.snapshot",
    "rejected",
    "snapshot_rollback",
  ),
  define(
    "planning.replanning.causal-predecessor",
    "planning.replanning",
    "rejected",
    "causal_predecessor_missing",
  ),
  define(
    "planning.fencing.stale-result",
    "planning.fencing",
    "rejected",
    "stale_fence",
  ),
  define(
    "planning.mesh-projection.assignment-bound",
    "planning.mesh-projection",
    "rejected",
    "assignment_binding_mismatch",
  ),
  define(
    "planning.evaluation.public-artifact",
    "planning.evaluation",
    "rejected",
    "private_evidence_disclosed",
  ),
  define(
    "planning.durable.restart-high-water",
    "planning.durable",
    "accepted",
    null,
  ),
] as const satisfies readonly PlanningConformanceCaseDefinitionV1[]);

export interface PlanningConformanceChallengeV1 {
  readonly schemaVersion: 1;
  readonly caseId: PlanningConformanceCaseIdV1;
  readonly fixtureDigest: PlanningDigestV1;
  /** Public test data only. It must not contain keys, credentials or raw evidence. */
  readonly input: PlanningJson;
}

export interface PlanningConformanceAssessmentV1 {
  readonly schemaVersion: 1;
  readonly caseId: PlanningConformanceCaseIdV1;
  readonly fixtureDigest: PlanningDigestV1;
  readonly verdict: PlanningConformanceExpectedVerdictV1;
  readonly reasonCode: string | null;
  /** Commitment to the implementation's public, redacted execution evidence. */
  readonly evidenceDigest: PlanningDigestV1;
}

export interface PlanningConformanceFactoryContextV1 {
  readonly seed: number;
  readonly signal: AbortSignal;
}

/**
 * The adapter is the only implementation-controlled execution boundary. The
 * runner supplies all fixtures and checks its returned public assessment; it
 * does not receive a private state handle, a persistence handle or authority.
 * This is executable adapter conformance, not a cryptographic proof that an
 * implementation cannot special-case a public fixture.
 */
export interface PlanningConformanceAdapterV1 {
  assess(
    challenge: PlanningConformanceChallengeV1,
    signal: AbortSignal,
  ): PlanningConformanceAssessmentV1 | Promise<PlanningConformanceAssessmentV1>;
  cleanup?(): void | Promise<void>;
}

export type PlanningConformanceFactoryV1 = (
  context: PlanningConformanceFactoryContextV1,
) => PlanningConformanceAdapterV1 | Promise<PlanningConformanceAdapterV1>;

export interface PlanningConformanceOptionsV1 {
  readonly factory: PlanningConformanceFactoryV1;
  readonly declaredCapabilities: readonly PlanningConformanceCapabilityV1[];
  readonly seed?: number;
  readonly timeoutMs?: number;
  readonly totalTimeoutMs?: number;
  readonly cleanupTimeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly clock?: () => number;
}

export interface PlanningConformanceCaseResultV1 {
  readonly caseId: PlanningConformanceCaseIdV1;
  readonly capability: PlanningConformanceCapabilityV1;
  readonly outcome: "passed" | "failed" | "not_declared";
  readonly reasonCode: string | null;
  readonly durationMs: number;
  readonly fixtureDigest: PlanningDigestV1;
  readonly evidenceDigest: PlanningDigestV1 | null;
}

export interface PlanningConformanceReportV1 {
  readonly schemaVersion: 1;
  readonly conformanceVersion: 1;
  readonly suiteDigest: PlanningDigestV1;
  readonly fixtureManifestDigest: PlanningDigestV1;
  readonly implementation: Readonly<{ name: string; version: string }>;
  readonly declaredCapabilities: readonly PlanningConformanceCapabilityV1[];
  readonly seed: number;
  readonly cases: readonly PlanningConformanceCaseResultV1[];
  readonly counts: Readonly<{
    passed: number;
    failed: number;
    notDeclared: number;
    total: number;
  }>;
  readonly verdict: "passed" | "failed";
}

export interface PlanningConformanceReportInputV1 {
  readonly implementation: Readonly<{ name: string; version: string }>;
  readonly declaredCapabilities: readonly PlanningConformanceCapabilityV1[];
  readonly seed: number;
  readonly cases: readonly PlanningConformanceCaseResultV1[];
}

/** Stable commitment to the public case definitions. */
export const PLANNING_CONFORMANCE_SUITE_DIGEST_V1 = commitment({
  schemaVersion: 1,
  cases: PLANNING_CONFORMANCE_CASES_V1.map((entry) => ({ ...entry })),
} as unknown as PlanningJson);

/**
 * Runs every case against a fresh caller-supplied adapter. No adapter is
 * allowed to share implicit state between cases, and undeclared groups are
 * recorded instead of silently omitted.
 */
export async function runPlanningConformanceV1(
  options: PlanningConformanceOptionsV1,
): Promise<readonly PlanningConformanceCaseResultV1[]> {
  const normalizedOptions = normalizePlanningOptions(options);
  const context = planningRunnerContext(normalizedOptions);
  const capabilities = normalizeCapabilities(
    normalizedOptions.declaredCapabilities,
  );
  for (const capability of PLANNING_REQUIRED_CONFORMANCE_CAPABILITIES_V1) {
    if (!capabilities.has(capability)) {
      throw new TypeError(
        "Required planning conformance capability is missing",
      );
    }
  }
  const fixtures = createPlanningConformanceFixturesV1();
  return Object.freeze(
    await Promise.all(
      PLANNING_CONFORMANCE_CASES_V1.map(async (definition) => {
        const challenge = fixtures.get(definition.caseId)!;
        if (!capabilities.has(definition.capability)) {
          return result(
            definition,
            "not_declared",
            null,
            0,
            challenge.fixtureDigest,
            null,
          );
        }
        let assessment: PlanningConformanceAssessmentV1 | undefined;
        const bounded = await runPlanningBoundedCase({
          context,
          run: async (signal) => {
            const adapter = await awaitConformanceOperation(
              normalizedOptions.factory(
                Object.freeze({ seed: context.seed, signal }),
              ),
              signal,
            );
            assertAdapter(adapter);
            let failure: unknown;
            try {
              assessment = validatePlanningConformanceAssessmentV1(
                await awaitConformanceOperation(
                  adapter.assess(challenge, signal),
                  signal,
                ),
              );
              assertAssessment(definition, challenge, assessment);
            } catch (error) {
              failure = error;
            }
            await runConformanceCleanup(
              adapter.cleanup?.bind(adapter),
              context.cleanupTimeoutMs,
              failure,
            );
            if (failure !== undefined) throw failure;
          },
        });
        return result(
          definition,
          bounded.outcome === "passed" ? "passed" : "failed",
          bounded.outcome === "passed"
            ? null
            : (bounded.reasonCode ?? "assertion_failed"),
          bounded.durationMs,
          challenge.fixtureDigest,
          bounded.outcome === "passed"
            ? (assessment?.evidenceDigest ?? null)
            : null,
        );
      }),
    ),
  );
}

interface PlanningRunnerContextV1 {
  readonly seed: number;
  readonly timeoutMs: number;
  readonly cleanupTimeoutMs: number;
  readonly deadline: number;
  readonly signal: AbortSignal | undefined;
  readonly clock: () => number;
}

function normalizePlanningOptions(
  input: unknown,
): PlanningConformanceOptionsV1 {
  const value = exactOptionRecord(input);
  if (typeof value.factory !== "function") {
    throw new TypeError("Planning conformance factory is required");
  }
  return Object.freeze({
    factory: value.factory as PlanningConformanceFactoryV1,
    declaredCapabilities:
      value.declaredCapabilities as readonly PlanningConformanceCapabilityV1[],
    ...(value.seed === undefined ? {} : { seed: value.seed as number }),
    ...(value.timeoutMs === undefined
      ? {}
      : { timeoutMs: value.timeoutMs as number }),
    ...(value.totalTimeoutMs === undefined
      ? {}
      : { totalTimeoutMs: value.totalTimeoutMs as number }),
    ...(value.cleanupTimeoutMs === undefined
      ? {}
      : { cleanupTimeoutMs: value.cleanupTimeoutMs as number }),
    ...(value.signal === undefined
      ? {}
      : { signal: value.signal as AbortSignal }),
    ...(value.clock === undefined
      ? {}
      : { clock: value.clock as () => number }),
  });
}

function exactOptionRecord(input: unknown): Record<string, unknown> {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null) ||
    Object.getOwnPropertySymbols(input).length !== 0
  )
    throw new TypeError("Planning conformance options are invalid");
  const required = ["declaredCapabilities", "factory"];
  const permitted = [
    ...required,
    "cleanupTimeoutMs",
    "clock",
    "seed",
    "signal",
    "timeoutMs",
    "totalTimeoutMs",
  ];
  const names = Object.getOwnPropertyNames(input);
  if (
    names.some((name) => !permitted.includes(name)) ||
    required.some((name) => !names.includes(name))
  )
    throw new TypeError("Planning conformance options have unknown fields");
  const result: Record<string, unknown> = Object.create(null);
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(input, name);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError("Planning conformance options have accessors");
    }
    result[name] = descriptor.value;
  }
  return Object.freeze(result);
}

function planningRunnerContext(
  options: PlanningConformanceOptionsV1,
): PlanningRunnerContextV1 {
  const seed = integer(options.seed ?? 0, "seed", 0, 0xffff_ffff);
  const timeoutMs = integer(options.timeoutMs ?? 5_000, "timeout", 10, 60_000);
  const totalTimeoutMs = integer(
    options.totalTimeoutMs ?? 60_000,
    "suite timeout",
    10,
    300_000,
  );
  const cleanupTimeoutMs = integer(
    options.cleanupTimeoutMs ?? 2_000,
    "cleanup timeout",
    10,
    30_000,
  );
  if (
    options.signal !== undefined &&
    !(options.signal instanceof AbortSignal)
  ) {
    throw new TypeError("Planning conformance abort signal is invalid");
  }
  if (options.clock !== undefined && typeof options.clock !== "function") {
    throw new TypeError("Planning conformance clock is invalid");
  }
  return Object.freeze({
    seed,
    timeoutMs,
    cleanupTimeoutMs,
    deadline: monotonicNow() + totalTimeoutMs,
    signal: options.signal,
    clock: options.clock ?? Date.now,
  });
}

async function runPlanningBoundedCase(input: {
  readonly context: PlanningRunnerContextV1;
  readonly run: (signal: AbortSignal) => void | Promise<void>;
}): Promise<
  Readonly<{
    outcome: "passed" | "failed";
    reasonCode: string | null;
    durationMs: number;
  }>
> {
  const started = input.context.clock();
  const remaining = Math.trunc(input.context.deadline - monotonicNow());
  if (remaining <= 0)
    return Object.freeze({
      outcome: "failed",
      reasonCode: "suite_timeout",
      durationMs: 0,
    });
  const controller = new AbortController();
  const relay = () => controller.abort(new PlanningConformanceAbort("aborted"));
  input.context.signal?.addEventListener("abort", relay, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (input.context.signal?.aborted)
      throw new PlanningConformanceAbort("aborted");
    const timeoutReason =
      remaining <= input.context.timeoutMs ? "suite_timeout" : "timeout";
    timer = setTimeout(
      () => controller.abort(new PlanningConformanceAbort(timeoutReason)),
      Math.min(remaining, input.context.timeoutMs),
    );
    await input.run(controller.signal);
    if (controller.signal.aborted) throw controller.signal.reason;
    return Object.freeze({
      outcome: "passed",
      reasonCode: null,
      durationMs: duration(started, input.context.clock()),
    });
  } catch (error) {
    return Object.freeze({
      outcome: "failed",
      reasonCode: planningFailureCode(error),
      durationMs: duration(started, input.context.clock()),
    });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    input.context.signal?.removeEventListener("abort", relay);
  }
}

class PlanningConformanceAbort extends Error {
  constructor(readonly code: "timeout" | "suite_timeout" | "aborted") {
    super(code);
  }
}

function planningFailureCode(error: unknown): string {
  if (error instanceof PlanningConformanceAbort) return error.code;
  if (error instanceof MeshConformanceCleanupError) {
    return error.previousFailure instanceof PlanningConformanceAbort
      ? `${error.previousFailure.code}_cleanup_failed`
      : "cleanup_failed";
  }
  return "assertion_failed";
}

function duration(started: number, ended: number): number {
  const value = Math.max(0, Math.trunc(ended - started));
  return Number.isSafeInteger(value) ? Math.min(value, 60_000) : 60_000;
}

function monotonicNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}

/** Builds a sealed, canonical public report from a complete suite execution. */
export function createPlanningConformanceReportV1(
  input: PlanningConformanceReportInputV1,
): PlanningConformanceReportV1 {
  exactRecord(input, [
    "cases",
    "declaredCapabilities",
    "implementation",
    "seed",
  ]);
  const capabilities = [
    ...normalizeCapabilities(input.declaredCapabilities),
  ].sort(compareAscii);
  for (const capability of PLANNING_REQUIRED_CONFORMANCE_CAPABILITIES_V1) {
    if (!capabilities.includes(capability))
      throw new TypeError(
        "Required planning conformance capability is missing",
      );
  }
  const implementation = normalizeImplementation(input.implementation);
  const seed = integer(input.seed, "seed", 0, 0xffff_ffff);
  const cases = normalizeResults(input.cases, new Set(capabilities));
  const counts = Object.freeze({
    passed: cases.filter((entry) => entry.outcome === "passed").length,
    failed: cases.filter((entry) => entry.outcome === "failed").length,
    notDeclared: cases.filter((entry) => entry.outcome === "not_declared")
      .length,
    total: cases.length,
  });
  return Object.freeze({
    schemaVersion: 1,
    conformanceVersion: PLANNING_CONFORMANCE_VERSION_V1,
    suiteDigest: PLANNING_CONFORMANCE_SUITE_DIGEST_V1,
    fixtureManifestDigest: planningConformanceFixtureManifestDigestV1(),
    implementation,
    declaredCapabilities: Object.freeze(capabilities),
    seed,
    cases,
    counts,
    verdict: counts.failed === 0 ? "passed" : "failed",
  });
}

/** Rejects a tampered, incomplete, undisclosed-capability or aggregate-inconsistent report. */
export function validatePlanningConformanceReportV1(
  value: unknown,
): PlanningConformanceReportV1 {
  exactRecord(value, [
    "cases",
    "conformanceVersion",
    "counts",
    "declaredCapabilities",
    "fixtureManifestDigest",
    "implementation",
    "schemaVersion",
    "seed",
    "suiteDigest",
    "verdict",
  ]);
  const report = value as unknown as PlanningConformanceReportV1;
  if (
    report.schemaVersion !== 1 ||
    report.conformanceVersion !== PLANNING_CONFORMANCE_VERSION_V1 ||
    report.suiteDigest !== PLANNING_CONFORMANCE_SUITE_DIGEST_V1 ||
    report.fixtureManifestDigest !==
      planningConformanceFixtureManifestDigestV1()
  )
    throw new TypeError("Planning conformance report binding is invalid");
  const normalized = createPlanningConformanceReportV1({
    implementation: report.implementation,
    declaredCapabilities: report.declaredCapabilities,
    seed: report.seed,
    cases: report.cases,
  });
  exactRecord(report.counts, ["failed", "notDeclared", "passed", "total"]);
  if (
    report.counts.passed !== normalized.counts.passed ||
    report.counts.failed !== normalized.counts.failed ||
    report.counts.notDeclared !== normalized.counts.notDeclared ||
    report.counts.total !== normalized.counts.total ||
    report.verdict !== normalized.verdict
  )
    throw new TypeError(
      "Planning conformance report aggregate is inconsistent",
    );
  return normalized;
}

/** Public deterministic fixtures; each one is a bounded, redacted challenge. */
export function createPlanningConformanceFixturesV1(): ReadonlyMap<
  PlanningConformanceCaseIdV1,
  PlanningConformanceChallengeV1
> {
  const fixtures = PLANNING_CONFORMANCE_CASES_V1.map((definition) => {
    const input = deepFreezePlanning(fixtureInput(definition.caseId));
    return deepFreezePlanning({
      schemaVersion: 1 as const,
      caseId: definition.caseId,
      fixtureDigest: commitment({
        schemaVersion: 1,
        caseId: definition.caseId,
        input,
      }),
      input,
    });
  });
  return new Map(fixtures.map((fixture) => [fixture.caseId, fixture]));
}

export function planningConformanceFixtureManifestDigestV1(): PlanningDigestV1 {
  const fixtures = createPlanningConformanceFixturesV1();
  return commitment({
    schemaVersion: 1,
    fixtures: PLANNING_CONFORMANCE_CASES_V1.map((definition) => ({
      caseId: definition.caseId,
      fixtureDigest: fixtures.get(definition.caseId)!.fixtureDigest,
    })),
  });
}

function fixtureInput(caseId: PlanningConformanceCaseIdV1): PlanningJson {
  const common = { schemaVersion: 1, fixtureVersion: 1 };
  switch (caseId) {
    case "planning.intent.closed-record":
      return Object.freeze({
        ...common,
        operation: "intent.validate",
        intent: {
          missionIntentId: "mission:planning-conformance",
          revision: 1,
        },
        injectedAuthority: "must-not-be-accepted",
      }) as unknown as PlanningJson;
    case "planning.proposal.scope-widening":
      return Object.freeze({
        ...common,
        operation: "proposal.validate",
        permittedCapabilityKeys: ["documents.write"],
        proposalCapabilityKeys: ["documents.write", "root.admin"],
      }) as unknown as PlanningJson;
    case "planning.reducer.dependency-cycle":
      return Object.freeze({
        ...common,
        operation: "reducer.apply",
        fragments: [
          { fragmentId: "fragment:a", dependencies: ["fragment:b"] },
          { fragmentId: "fragment:b", dependencies: ["fragment:a"] },
        ],
      }) as unknown as PlanningJson;
    case "planning.reducer.exact-replay":
      return Object.freeze({
        ...common,
        operation: "reducer.replay",
        commands: [
          {
            commandId: "command:1",
            logicalTimeMs: 1,
            kind: "observation.record",
          },
          {
            commandId: "command:1",
            logicalTimeMs: 1,
            kind: "observation.record",
          },
        ],
      }) as unknown as PlanningJson;
    case "planning.snapshot.cross-scope":
      return Object.freeze({
        ...common,
        operation: "snapshot.restore",
        snapshotScope: "tenant:one/policy:a/mission:one",
        targetScope: "tenant:two/policy:a/mission:one",
        snapshotGeneration: 4,
        targetHighWater: 4,
      }) as unknown as PlanningJson;
    case "planning.snapshot.rollback":
      return Object.freeze({
        ...common,
        operation: "snapshot.restore",
        snapshotScope: "tenant:one/policy:a/mission:one",
        targetScope: "tenant:one/policy:a/mission:one",
        snapshotGeneration: 3,
        targetHighWater: 4,
      }) as unknown as PlanningJson;
    case "planning.replanning.causal-predecessor":
      return Object.freeze({
        ...common,
        operation: "replanning.apply",
        triggerObservationDigest: null,
        predecessorPlanDigest: null,
        revisedPlanDigest:
          "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      }) as unknown as PlanningJson;
    case "planning.fencing.stale-result":
      return Object.freeze({
        ...common,
        operation: "effect.apply",
        currentFence: "fence:2",
        resultFence: "fence:1",
        workId: "work:planning-conformance",
      }) as unknown as PlanningJson;
    case "planning.mesh-projection.assignment-bound":
      return Object.freeze({
        ...common,
        operation: "mesh-projection.validate",
        assignmentDigest:
          "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        extensionAssignmentDigest:
          "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      }) as unknown as PlanningJson;
    case "planning.evaluation.public-artifact":
      return Object.freeze({
        ...common,
        operation: "evaluation.artifact.validate",
        artifact: {
          traceDigest:
            "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
        privateEvidence: "must-not-be-disclosed",
      }) as unknown as PlanningJson;
    case "planning.durable.restart-high-water":
      return Object.freeze({
        ...common,
        operation: "durability.reopen",
        scope: "tenant:one/policy:a/mission:one",
        expectedStateDigest:
          "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        expectedFenceHighWater: 2,
      }) as unknown as PlanningJson;
  }
}

export function validatePlanningConformanceAssessmentV1(
  value: unknown,
): PlanningConformanceAssessmentV1 {
  exactRecord(value, [
    "caseId",
    "evidenceDigest",
    "fixtureDigest",
    "reasonCode",
    "schemaVersion",
    "verdict",
  ]);
  const assessment = value as unknown as PlanningConformanceAssessmentV1;
  if (
    assessment.schemaVersion !== 1 ||
    !caseDefinition(assessment.caseId) ||
    !isDigest(assessment.fixtureDigest) ||
    !isDigest(assessment.evidenceDigest) ||
    !["accepted", "rejected"].includes(assessment.verdict) ||
    (assessment.reasonCode !== null && !isReason(assessment.reasonCode))
  )
    throw new TypeError("Planning conformance assessment is invalid");
  return Object.freeze({ ...assessment });
}

function assertAssessment(
  definition: PlanningConformanceCaseDefinitionV1,
  challenge: PlanningConformanceChallengeV1,
  assessment: PlanningConformanceAssessmentV1,
): void {
  if (
    assessment.caseId !== definition.caseId ||
    assessment.fixtureDigest !== challenge.fixtureDigest ||
    assessment.verdict !== definition.expectedVerdict ||
    assessment.reasonCode !== definition.expectedReasonCode
  )
    throw new TypeError(
      "Planning conformance assessment does not match public fixture",
    );
}

function normalizeResults(
  values: readonly PlanningConformanceCaseResultV1[],
  capabilities: ReadonlySet<PlanningConformanceCapabilityV1>,
): readonly PlanningConformanceCaseResultV1[] {
  const candidates = ownArrayValues<unknown>(
    values,
    PLANNING_CONFORMANCE_CASES_V1.length,
    "case results",
  );
  if (candidates.length !== PLANNING_CONFORMANCE_CASES_V1.length) {
    throw new TypeError("Planning conformance case coverage is incomplete");
  }
  const fixtures = createPlanningConformanceFixturesV1();
  const byId = new Map<string, PlanningConformanceCaseResultV1>();
  for (const candidate of candidates) {
    exactRecord(candidate, [
      "capability",
      "caseId",
      "durationMs",
      "evidenceDigest",
      "fixtureDigest",
      "outcome",
      "reasonCode",
    ]);
    const result = candidate as unknown as PlanningConformanceCaseResultV1;
    if (byId.has(result.caseId))
      throw new TypeError("Planning conformance case is duplicated");
    byId.set(result.caseId, result);
  }
  return Object.freeze(
    PLANNING_CONFORMANCE_CASES_V1.map((definition) => {
      const value = byId.get(definition.caseId) as unknown as
        PlanningConformanceCaseResultV1 | undefined;
      if (!value) throw new TypeError("Planning conformance case is missing");
      const declared = capabilities.has(definition.capability);
      if (
        value.caseId !== definition.caseId ||
        value.capability !== definition.capability ||
        !["passed", "failed", "not_declared"].includes(value.outcome) ||
        !Number.isSafeInteger(value.durationMs) ||
        value.durationMs < 0 ||
        value.durationMs > 60_000 ||
        value.fixtureDigest !==
          fixtures.get(definition.caseId)!.fixtureDigest ||
        (value.reasonCode !== null && !isReason(value.reasonCode)) ||
        (value.evidenceDigest !== null && !isDigest(value.evidenceDigest)) ||
        (!declared &&
          (value.outcome !== "not_declared" ||
            value.reasonCode !== null ||
            value.evidenceDigest !== null)) ||
        (declared && value.outcome === "not_declared") ||
        (value.outcome === "passed" &&
          (value.reasonCode !== null || value.evidenceDigest === null)) ||
        (value.outcome === "failed" &&
          (value.reasonCode === null || value.evidenceDigest !== null))
      )
        throw new TypeError("Planning conformance case result is invalid");
      return Object.freeze({ ...value }) as PlanningConformanceCaseResultV1;
    }),
  );
}

function result(
  definition: PlanningConformanceCaseDefinitionV1,
  outcome: PlanningConformanceCaseResultV1["outcome"],
  reasonCode: string | null,
  durationMs: number,
  fixtureDigest: PlanningDigestV1,
  evidenceDigest: PlanningDigestV1 | null,
): PlanningConformanceCaseResultV1 {
  return Object.freeze({
    caseId: definition.caseId,
    capability: definition.capability,
    outcome,
    reasonCode,
    durationMs,
    fixtureDigest,
    evidenceDigest,
  });
}

function normalizeCapabilities(
  values: readonly PlanningConformanceCapabilityV1[],
): ReadonlySet<PlanningConformanceCapabilityV1> {
  const candidateValues = ownArrayValues<unknown>(
    values,
    PLANNING_CONFORMANCE_CAPABILITIES_V1.length,
    "capabilities",
  );
  if (candidateValues.length > PLANNING_CONFORMANCE_CAPABILITIES_V1.length) {
    throw new RangeError("Planning conformance capability count is invalid");
  }
  const result = new Set<PlanningConformanceCapabilityV1>();
  for (const candidate of candidateValues) {
    if (typeof candidate !== "string") {
      throw new TypeError("Planning conformance capability is invalid");
    }
    const value = candidate as PlanningConformanceCapabilityV1;
    if (
      !PLANNING_CONFORMANCE_CAPABILITIES_V1.includes(value) ||
      result.has(value)
    ) {
      throw new TypeError("Planning conformance capability is invalid");
    }
    result.add(value);
  }
  return result;
}

function normalizeImplementation(
  value: PlanningConformanceReportInputV1["implementation"],
): Readonly<{ name: string; version: string }> {
  exactRecord(value, ["name", "version"]);
  if (
    !isText(value.name, 128) ||
    !/^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/u.test(value.version)
  ) {
    throw new TypeError("Planning conformance implementation is invalid");
  }
  return Object.freeze({ name: value.name, version: value.version });
}

function assertAdapter(
  value: unknown,
): asserts value is PlanningConformanceAdapterV1 {
  if (
    !value ||
    typeof value !== "object" ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0
  )
    throw new TypeError("Planning conformance factory is invalid");
  const names = Object.getOwnPropertyNames(value).sort(compareAscii);
  if (
    names.length < 1 ||
    names.length > 2 ||
    names[0] !== "assess" ||
    (names.length === 2 && names[1] !== "cleanup")
  )
    throw new TypeError("Planning conformance factory is invalid");
  const assess = Object.getOwnPropertyDescriptor(value, "assess");
  const cleanup = Object.getOwnPropertyDescriptor(value, "cleanup");
  if (
    !assess ||
    !assess.enumerable ||
    !("value" in assess) ||
    typeof assess.value !== "function" ||
    (cleanup !== undefined &&
      (!cleanup.enumerable ||
        !("value" in cleanup) ||
        (cleanup.value !== undefined && typeof cleanup.value !== "function")))
  )
    throw new TypeError("Planning conformance factory is invalid");
}

function define(
  caseId: PlanningConformanceCaseIdV1,
  capability: PlanningConformanceCapabilityV1,
  expectedVerdict: PlanningConformanceExpectedVerdictV1,
  expectedReasonCode: string | null,
): PlanningConformanceCaseDefinitionV1 {
  return Object.freeze({
    caseId,
    capability,
    expectedVerdict,
    expectedReasonCode,
  });
}

function caseDefinition(
  value: unknown,
): PlanningConformanceCaseDefinitionV1 | undefined {
  return PLANNING_CONFORMANCE_CASES_V1.find(
    (definition) => definition.caseId === value,
  );
}

function commitment(value: PlanningJson): PlanningDigestV1 {
  const encoded = new TextEncoder().encode(
    `agentplat.mesh-conformance/planning/v1\0${canonicalizePlanningJsonV1(value)}`,
  );
  return `sha256:${sha256HexPlanningV1(encoded)}`;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0
  )
    throw new TypeError("Planning conformance record is invalid");
  const actual = Object.getOwnPropertyNames(value).sort(compareAscii);
  const expected = [...keys].sort(compareAscii);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError("Planning conformance record has unknown fields");
  }
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError("Planning conformance record has accessors");
    }
  }
}

function ownArrayValues<T>(
  value: unknown,
  maximum: number,
  label: string,
): readonly T[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > maximum ||
    Object.getOwnPropertySymbols(value).length !== 0
  )
    throw new TypeError(`Planning conformance ${label} are invalid`);
  const result: T[] = [];
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== value.length + 1 || !names.includes("length")) {
    throw new TypeError(`Planning conformance ${label} are sparse`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError(`Planning conformance ${label} have accessors`);
    }
    result.push(descriptor.value as T);
  }
  return Object.freeze(result);
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
  ) {
    throw new RangeError(`Planning conformance ${label} is invalid`);
  }
  return value as number;
}

function isDigest(value: unknown): value is PlanningDigestV1 {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function isReason(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9._:-]{0,63}$/u.test(value);
}

function isText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    new TextEncoder().encode(value).byteLength <= maximum &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
