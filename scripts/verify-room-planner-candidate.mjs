import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { evaluateRoomPlannerTraces } from "./evaluate-room-planner.mjs";
const [archiveArg] = process.argv.slice(2);
if (!archiveArg)
  throw Error("Usage: node scripts/verify-room-planner-candidate.mjs ARCHIVE");
const candidate = JSON.parse(
    await readFile("config/room-planner-pilot-candidate-v1.json", "utf8"),
  ),
  archive = resolve(archiveArg);
if (
  candidate.schemaVersion !== 1 ||
  candidate.distribution !== "source-only" ||
  candidate.published !== false ||
  candidate.deploymentEnabled !== false
)
  throw Error("Invalid source-only candidate boundary");
if (
  createHash("sha256")
    .update(await readFile(archive))
    .digest("hex") !== candidate.qualification.archiveSha256
)
  throw Error("Evidence archive digest mismatch");
const data = JSON.parse(
  execFileSync(
    "python3",
    [
      "-c",
      `
import sys,json,tarfile,hashlib
with tarfile.open(sys.argv[1]) as tar:
 members=tar.getmembers();names=[m.name for m in members]
 if len(names)!=len(set(names)) or any(not m.isfile() or m.name.startswith('/') or '..' in m.name.split('/') for m in members):raise RuntimeError('Unsafe archive')
 if sum(m.size for m in members)>100*1024*1024:raise RuntimeError('Archive size bound exceeded')
 bodies={m.name:tar.extractfile(m).read() for m in members}
 manifest=json.loads(bodies['MANIFEST.json'])
 if {e['path'] for e in manifest}!=set(names)-{'MANIFEST.json'}:raise RuntimeError('Incomplete archive manifest')
 for e in manifest:
  if hashlib.sha256(bodies[e['path']]).hexdigest()!=e['sha256']:raise RuntimeError('Manifest digest mismatch')
 rows={name:json.loads(body) for name,body in bodies.items() if name.endswith(('/summary.json','/traces.json','/protocol.json','/cohort.json')) or name=='budget.json'}
 packages={name:hashlib.sha256(body).hexdigest() for name,body in bodies.items() if name.startswith('packages/')}
 print(json.dumps({'rows':rows,'packages':packages,'files':len(bodies)}))
`,
      archive,
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  ),
);
for (const pkg of candidate.packages)
  if (data.packages[`packages/${pkg.artifact}`] !== pkg.sha256)
    throw Error("Package bytes differ from candidate");
const ids = [
    candidate.qualification.developmentCampaignId,
    candidate.qualification.holdoutCampaignId,
  ],
  sets = [];
for (const id of ids) {
  const prefix = `campaigns/${id}`,
    summary = data.rows[`${prefix}/summary.json`],
    traces = data.rows[`${prefix}/traces.json`],
    cohort = data.rows[`${prefix}/cohort.json`];
  if (
    cohort.cohortDigest !== candidate.cohortDigest ||
    summary.cohortDigest !== candidate.cohortDigest
  )
    throw Error("Campaign cohort mismatch");
  if (
    JSON.stringify(evaluateRoomPlannerTraces(traces)) !==
    JSON.stringify(summary.metrics)
  )
    throw Error("Summary metrics are not derived from traces");
  sets.push(new Set(summary.metrics.rows.map((row) => row.caseId)));
}
if ([...sets[0]].some((id) => sets[1].has(id)))
  throw Error("Holdout cases overlap development cases");
const gates = ids.flatMap(
  (id) => data.rows[`campaigns/${id}/summary.json`].pilotGates ?? [],
);
const passedGates =
  gates.length === 10 &&
  gates.every(
    (g) =>
      g.businessComplete &&
      g.governedComplete &&
      g.correctionContinuity &&
      g.directWhenRequested !== false,
  );
const protocols = ids.map((id) => data.rows[`campaigns/${id}/protocol.json`]);
for (const path of [
  "src/server/room-planner.ts",
  "src/server/agent-runtime.ts",
  "src/server/planner-policy.mjs",
]) {
  const hashes = protocols.map(
    (p) => p.consumer.find((f) => f.path === path)?.sha256,
  );
  if (!hashes[0] || hashes[0] !== hashes[1])
    throw Error("Product changed between development and holdout");
}
const budget = data.rows["budget.json"],
  spent = budget.calls.reduce((n, c) => n + (c.costMicros ?? 0), 0),
  reserved = budget.calls
    .filter((c) => c.status !== "completed")
    .reduce((n, c) => n + c.upperMicros, 0);
if (
  spent !== candidate.qualification.accountedCostMicros ||
  reserved !== candidate.qualification.reservedMicros ||
  spent + reserved > budget.limitMicros ||
  budget.limitMicros > 5_000_000
)
  throw Error("Budget evidence mismatch");
if (
  (candidate.qualifiedFor === "controlled supplied-evidence pilot") !==
  (passedGates && reserved === 0)
)
  throw Error("Candidate qualification does not match its gates");
console.log(
  JSON.stringify(
    {
      valid: true,
      cohortDigest: candidate.cohortDigest,
      packages: candidate.packages.length,
      verifiedFiles: data.files,
      spentUsd: spent / 1e6,
      sourceOnly: true,
    },
    null,
    2,
  ),
);
