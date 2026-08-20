import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const directory = process.argv[2] ?? "output/pilots/agent-mesh-semantic-pilot-v1-20260819-v4/artifacts";
const names = (await readdir(directory)).filter((name) => name.startsWith("trace_") && name.endsWith(".json"));
const rows = [];
for (const name of names) {
  const artifact = JSON.parse(await readFile(join(directory, name), "utf8"));
  const records = artifact.records ?? [];
  const inference = records.find((record) => record.kind === "inference.assessed");
  if (!inference) continue;
  const faults = records.filter((record) => record.kind === "fault.observed").map((record) => record.faultBinding?.faultFamily ?? record.reasonCode ?? "unknown");
  const unsafe = records.some((record) => record.status === "unsafe" || record.reasonCode?.includes("violation"));
  const committed = records.some((record) => record.kind === "environment.effect.committed" && record.status === "accepted");
  const cause = unsafe ? "unsafe_effect_path" : faults.length === 0 ? (committed ? "nominal_useful_path" : "controller_or_terminal_restriction") : "fault_or_recovery_context";
  rows.push({ artifact: name, runner: inference.runner, seed: inference.seed, scenario: name.match(/_(nominal|benign|mixed|adversarial)_/)?.[1] ?? "unknown", faults, usefulProxy: committed, unsafe, cause, traceDigest: artifact.traceDigest });
}
const byCause = Object.fromEntries([...new Set(rows.map((row) => row.cause))].map((cause) => [cause, rows.filter((row) => row.cause === cause).length]));
const output = { sourceDirectory: directory, traceCount: rows.length, decisionCount: rows.length, byCause, unsafeCount: rows.filter((row) => row.unsafe).length, usefulProxyCount: rows.filter((row) => row.usefulProxy).length, replayRowsExcluded: rows.filter((row) => row.artifact.includes("_replay")).length, note: "Runtime traces contain one inference.assessed event per execution and do not contain the semantic metric vector required for evaluator-owned causal classification; causes are operational proxies, not semantic endpoint labels.", rows };
console.log(JSON.stringify(output, null, 2));
