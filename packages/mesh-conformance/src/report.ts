import {
  MESH_CONFORMANCE_CAPABILITIES,
  MESH_CONFORMANCE_CASES,
  MESH_CONFORMANCE_REPORT_SCHEMA_VERSION,
  MESH_REQUIRED_CONFORMANCE_CAPABILITIES,
  type MeshConformanceCapability,
  type MeshConformanceCaseResult,
  type MeshConformanceCounts,
  type MeshConformanceReport,
  type MeshConformanceReportInput,
} from "./contracts.js";

const digestPattern = /^sha256:(?:[A-Fa-f0-9]{64}|[A-Za-z0-9_-]{43})$/u;
const reasonPattern = /^[a-z][a-z0-9._:-]{0,63}$/u;
const versionPattern = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/u;
const forbiddenReportKey =
  /(?:credential|password|private|secret|signature|token|connection|string|payload|envelope|snapshot|raw)/iu;

export function createMeshConformanceReport(
  input: MeshConformanceReportInput,
): MeshConformanceReport {
  assertExactRecord(input, [
    "cases",
    "conformanceVersion",
    "declaredCapabilities",
    "endedAt",
    ...(input.environment === undefined ? [] : ["environment"]),
    "fixtureManifestDigest",
    "implementation",
    "seed",
    "startedAt",
    "suiteDigest",
  ]);
  const capabilities = normalizeCapabilities(input.declaredCapabilities);
  for (const required of MESH_REQUIRED_CONFORMANCE_CAPABILITIES) {
    if (!capabilities.includes(required)) {
      throw new TypeError("Required Mesh conformance capability is missing");
    }
  }
  const cases = normalizeCases(input.cases, new Set(capabilities));
  const counts = countCases(cases);
  const verdict = counts.failed === 0 ? "passed" : "failed";
  const report = Object.freeze({
    schemaVersion: MESH_CONFORMANCE_REPORT_SCHEMA_VERSION,
    conformanceVersion: boundedVersion(input.conformanceVersion),
    suiteDigest: boundedDigest(input.suiteDigest),
    fixtureManifestDigest: boundedDigest(input.fixtureManifestDigest),
    implementation: normalizeImplementation(input.implementation),
    declaredCapabilities: capabilities,
    seed: boundedSeed(input.seed),
    startedAt: timestamp(input.startedAt),
    endedAt: timestamp(input.endedAt),
    environment: normalizeEnvironment(input.environment ?? {}),
    cases,
    counts,
    verdict,
  });
  if (Date.parse(report.endedAt) < Date.parse(report.startedAt)) {
    throw new TypeError("Mesh conformance report time range is invalid");
  }
  return report;
}

export function validateMeshConformanceReport(
  input: unknown,
): MeshConformanceReport {
  assertExactRecord(input, [
    "cases",
    "conformanceVersion",
    "counts",
    "declaredCapabilities",
    "endedAt",
    "environment",
    "fixtureManifestDigest",
    "implementation",
    "schemaVersion",
    "seed",
    "startedAt",
    "suiteDigest",
    "verdict",
  ]);
  const report = input as unknown as MeshConformanceReport;
  if (report.schemaVersion !== MESH_CONFORMANCE_REPORT_SCHEMA_VERSION) {
    throw new TypeError("Mesh conformance report schema is unsupported");
  }
  const normalized = createMeshConformanceReport({
    conformanceVersion: report.conformanceVersion,
    suiteDigest: report.suiteDigest,
    fixtureManifestDigest: report.fixtureManifestDigest,
    implementation: report.implementation,
    declaredCapabilities: report.declaredCapabilities,
    seed: report.seed,
    startedAt: report.startedAt,
    endedAt: report.endedAt,
    environment: report.environment,
    cases: report.cases,
  });
  if (
    !sameCounts(normalized.counts, report.counts) ||
    normalized.verdict !== report.verdict
  ) {
    throw new TypeError("Mesh conformance report aggregate is inconsistent");
  }
  return normalized;
}

function normalizeCases(
  input: readonly MeshConformanceCaseResult[],
  declared: ReadonlySet<MeshConformanceCapability>,
): readonly MeshConformanceCaseResult[] {
  if (!Array.isArray(input) || input.length !== MESH_CONFORMANCE_CASES.length) {
    throw new TypeError("Mesh conformance report case coverage is incomplete");
  }
  const byId = new Map(input.map((entry) => [entry.caseId, entry]));
  if (byId.size !== input.length) {
    throw new TypeError("Mesh conformance report case is duplicated");
  }
  return Object.freeze(
    MESH_CONFORMANCE_CASES.map((definition) => {
      const entry = byId.get(definition.id);
      if (!entry) {
        throw new TypeError("Mesh conformance report case is missing");
      }
      assertExactRecord(entry, [
        "capability",
        "caseId",
        "durationMs",
        "outcome",
        ...(entry.reasonCode === undefined ? [] : ["reasonCode"]),
      ]);
      if (
        entry.capability !== definition.capability ||
        !["passed", "failed", "skipped", "not_declared"].includes(
          entry.outcome,
        ) ||
        !Number.isSafeInteger(entry.durationMs) ||
        entry.durationMs < 0 ||
        entry.durationMs > 60_000 ||
        (entry.reasonCode !== undefined &&
          !reasonPattern.test(entry.reasonCode))
      ) {
        throw new TypeError("Mesh conformance report case is invalid");
      }
      const isDeclared = declared.has(definition.capability);
      if (
        (!isDeclared && entry.outcome !== "not_declared") ||
        (isDeclared &&
          (entry.outcome === "not_declared" || entry.outcome === "skipped")) ||
        (definition.required && entry.outcome === "skipped") ||
        (entry.outcome === "failed" && entry.reasonCode === undefined) ||
        (entry.outcome !== "failed" && entry.reasonCode !== undefined)
      ) {
        throw new TypeError("Mesh conformance case outcome is inconsistent");
      }
      return Object.freeze({ ...entry });
    }),
  );
}

function normalizeCapabilities(
  values: readonly MeshConformanceCapability[],
): readonly MeshConformanceCapability[] {
  if (
    !Array.isArray(values) ||
    values.length > MESH_CONFORMANCE_CAPABILITIES.length
  ) {
    throw new RangeError("Mesh conformance capability count is invalid");
  }
  const unique = new Set(values);
  if (
    unique.size !== values.length ||
    values.some((value) => !MESH_CONFORMANCE_CAPABILITIES.includes(value))
  ) {
    throw new TypeError("Mesh conformance capability manifest is invalid");
  }
  return Object.freeze([...unique].sort(compareAscii));
}

function normalizeImplementation(
  value: MeshConformanceReportInput["implementation"],
) {
  assertExactRecord(value, ["name", "version"]);
  return Object.freeze({
    name: boundedText(value.name, 128),
    version: boundedVersion(value.version),
  });
}

function normalizeEnvironment(
  value: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Mesh conformance environment is invalid");
  }
  const entries = Object.entries(value).sort(([left], [right]) =>
    compareAscii(left, right),
  );
  if (entries.length > 16) {
    throw new RangeError("Mesh conformance environment is too large");
  }
  const result: Record<string, string> = Object.create(null);
  for (const [key, nested] of entries) {
    if (
      !/^[a-z][a-z0-9._-]{0,31}$/u.test(key) ||
      forbiddenReportKey.test(key)
    ) {
      throw new TypeError("Mesh conformance environment key is forbidden");
    }
    result[key] = boundedText(nested, 128);
  }
  return Object.freeze(result);
}

function countCases(
  cases: readonly MeshConformanceCaseResult[],
): MeshConformanceCounts {
  const counts = { passed: 0, failed: 0, skipped: 0, notDeclared: 0 };
  for (const entry of cases) {
    if (entry.outcome === "not_declared") counts.notDeclared += 1;
    else counts[entry.outcome] += 1;
  }
  return Object.freeze({ total: cases.length, ...counts });
}

function sameCounts(left: MeshConformanceCounts, right: MeshConformanceCounts) {
  return (
    right &&
    left.total === right.total &&
    left.passed === right.passed &&
    left.failed === right.failed &&
    left.skipped === right.skipped &&
    left.notDeclared === right.notDeclared
  );
}

function boundedDigest(value: string): string {
  if (typeof value !== "string" || !digestPattern.test(value)) {
    throw new TypeError("Mesh conformance digest is invalid");
  }
  return value;
}

function boundedVersion(value: string): string {
  if (typeof value !== "string" || !versionPattern.test(value)) {
    throw new TypeError("Mesh conformance version is invalid");
  }
  return value;
}

function boundedText(value: string, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    new TextEncoder().encode(value).byteLength > maximum ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new TypeError("Mesh conformance report text is invalid");
  }
  return value;
}

function boundedSeed(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError("Mesh conformance seed is invalid");
  }
  return value;
}

function timestamp(value: string): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new TypeError("Mesh conformance timestamp is invalid");
  }
  return value;
}

function assertExactRecord(value: unknown, keys: readonly string[]): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Mesh conformance record is invalid");
  }
  const actual = Object.keys(value).sort(compareAscii);
  const expected = [...keys].sort(compareAscii);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError("Mesh conformance record must have an exact shape");
  }
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
