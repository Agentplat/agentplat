import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const options = parseOptions(process.argv.slice(2));

export function analyzeProductionDependencyAuditV1(report, allowlist, today) {
  validateAllowlist(allowlist, today);
  if (report === null || typeof report !== "object" || Array.isArray(report))
    fail("dependency_audit_report_invalid");
  const advisories = normalizeAdvisories(report);
  const accepted = new Map(
    allowlist.acceptedAdvisories.map((entry) => [
      String(entry.advisoryId),
      entry,
    ]),
  );
  const highOrCritical = advisories.filter(
    (entry) => entry.severity === "high" || entry.severity === "critical",
  );
  const unaccepted = highOrCritical.filter(
    (entry) => !accepted.has(entry.advisoryId),
  );
  const acceptedIds = highOrCritical
    .filter((entry) => accepted.has(entry.advisoryId))
    .map((entry) => entry.advisoryId);
  const severityCounts = Object.freeze(
    Object.fromEntries(
      ["info", "low", "moderate", "high", "critical"].map((severity) => [
        severity,
        advisories.filter((entry) => entry.severity === severity).length,
      ]),
    ),
  );
  const body = {
    schemaVersion: 1,
    kind: "production_dependency_audit",
    status: unaccepted.length === 0 ? "passed" : "failed",
    severityCounts,
    advisoryIds: advisories.map((entry) => entry.advisoryId),
    acceptedHighCriticalAdvisoryIds: acceptedIds,
    unacceptedHighCriticalAdvisoryIds: unaccepted.map(
      (entry) => entry.advisoryId,
    ),
  };
  return Object.freeze({
    ...body,
    reportDigest: digest("production-dependency-audit-v1", body),
  });
}

async function main() {
  exactOptions(options, ["allowlist", "mode", "output-directory"]);
  if (options.mode !== "run") fail("dependency_audit_mode_invalid");
  const allowlistPath = absolutePath(options.allowlist, "allowlist");
  const outputDirectory = absolutePath(
    options["output-directory"],
    "output_directory",
  );
  const allowlist = parseJson(await readFile(allowlistPath, "utf8"));
  let stdout;
  try {
    stdout = execFileSync("corepack", ["pnpm", "audit", "--prod", "--json"], {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (typeof error?.stdout !== "string" || error.stdout.length === 0)
      fail("dependency_audit_unavailable");
    stdout = error.stdout;
  }
  const report = analyzeProductionDependencyAuditV1(
    parseJson(stdout),
    allowlist,
    new Date().toISOString().slice(0, 10),
  );
  await mkdir(outputDirectory, { recursive: true });
  await writeJsonImmutable(
    path.join(outputDirectory, "production-dependency-audit.json"),
    report,
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (report.status !== "passed") process.exitCode = 2;
}

function normalizeAdvisories(report) {
  const rows = [];
  if (
    report.advisories !== undefined &&
    (report.advisories === null ||
      typeof report.advisories !== "object" ||
      Array.isArray(report.advisories))
  )
    fail("dependency_audit_report_invalid");
  for (const [key, advisory] of Object.entries(report.advisories ?? {})) {
    if (
      advisory === null ||
      typeof advisory !== "object" ||
      Array.isArray(advisory) ||
      !["info", "low", "moderate", "high", "critical"].includes(
        advisory.severity,
      )
    )
      fail("dependency_audit_report_invalid");
    const advisoryId = String(
      advisory.id ?? advisory.github_advisory_id ?? key,
    );
    assertAdvisoryId(advisoryId);
    rows.push({ advisoryId, severity: advisory.severity });
  }
  const via = report.vulnerabilities;
  if (via !== undefined) {
    if (via === null || typeof via !== "object" || Array.isArray(via))
      fail("dependency_audit_report_invalid");
    for (const vulnerability of Object.values(via)) {
      if (
        vulnerability === null ||
        typeof vulnerability !== "object" ||
        Array.isArray(vulnerability) ||
        !Array.isArray(vulnerability.via)
      )
        fail("dependency_audit_report_invalid");
      for (const advisory of vulnerability.via) {
        if (typeof advisory === "string") continue;
        if (
          advisory === null ||
          typeof advisory !== "object" ||
          Array.isArray(advisory) ||
          !["info", "low", "moderate", "high", "critical"].includes(
            advisory.severity,
          )
        )
          fail("dependency_audit_report_invalid");
        const advisoryId = String(
          advisory.source ?? advisory.id ?? advisory.url ?? "",
        );
        assertAdvisoryId(advisoryId);
        rows.push({ advisoryId, severity: advisory.severity });
      }
    }
  }
  const unique = new Map();
  for (const row of rows) {
    const previous = unique.get(row.advisoryId);
    if (previous !== undefined && previous !== row.severity)
      fail("dependency_audit_report_invalid");
    unique.set(row.advisoryId, row.severity);
  }
  return [...unique.entries()]
    .map(([advisoryId, severity]) => ({ advisoryId, severity }))
    .sort((left, right) => compareAscii(left.advisoryId, right.advisoryId));
}

function validateAllowlist(value, today) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    !sameKeys(value, ["acceptedAdvisories", "schemaVersion"]) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.acceptedAdvisories)
  )
    fail("dependency_audit_allowlist_invalid");
  let previous = "";
  for (const entry of value.acceptedAdvisories) {
    if (
      entry === null ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      Object.getPrototypeOf(entry) !== Object.prototype ||
      !sameKeys(entry, ["advisoryId", "expiresOn", "reason"])
    )
      fail("dependency_audit_allowlist_invalid");
    assertAdvisoryId(String(entry.advisoryId));
    if (
      typeof entry.reason !== "string" ||
      entry.reason.length < 12 ||
      entry.reason.length > 512 ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(entry.expiresOn) ||
      entry.expiresOn < today ||
      String(entry.advisoryId) <= previous
    )
      fail("dependency_audit_allowlist_invalid");
    previous = String(entry.advisoryId);
  }
}

function parseOptions(args) {
  const result = Object.create(null);
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (
      !name?.startsWith("--") ||
      value === undefined ||
      value.startsWith("--")
    )
      fail("dependency_audit_option_syntax_invalid");
    const key = name.slice(2);
    if (key in result) fail("dependency_audit_option_duplicate");
    result[key] = value;
  }
  return result;
}

function exactOptions(value, expected) {
  if (!sameKeys(value, expected)) fail("dependency_audit_option_set_invalid");
}

function sameKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}

function absolutePath(value, label) {
  if (typeof value !== "string" || value.length === 0)
    fail(`dependency_audit_${label}_invalid`);
  return path.resolve(value);
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    fail("dependency_audit_report_invalid");
  }
}

function assertAdvisoryId(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    fail("dependency_audit_advisory_id_invalid");
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function digest(kind, value) {
  return `sha256:${createHash("sha256")
    .update(`${kind}\0${canonical(value)}`)
    .digest("hex")}`;
}

function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number")
    return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort(compareAscii)
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(",")}}`;
}

async function writeJsonImmutable(file, value) {
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  try {
    await link(temporary, file);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const [existing, proposed] = await Promise.all([
      readFile(file, "utf8"),
      readFile(temporary, "utf8"),
    ]);
    if (existing !== proposed) fail("dependency_audit_artifact_conflict");
  } finally {
    await rm(temporary, { force: true });
  }
}

function fail(reasonCode) {
  throw new Error(reasonCode);
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const reasonCode = /^dependency_audit_[a-z0-9_]{1,160}$/u.test(message)
      ? message
      : "dependency_audit_failed";
    process.stderr.write(
      `${JSON.stringify({ status: "rejected", reasonCode })}\n`,
    );
    process.exitCode = 2;
  }
}
