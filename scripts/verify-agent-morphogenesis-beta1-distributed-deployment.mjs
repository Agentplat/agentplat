#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(
  root,
  "deploy/agent-morphogenesis-beta1-distributed-staging/kubernetes",
);
const rendered = execFileSync("kubectl", ["kustomize", directory], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 4 * 1024 * 1024,
});
for (const phrase of [
  "kind: StatefulSet",
  "replicas: 6",
  "topology.kubernetes.io/zone",
  "kubernetes.io/hostname",
  "whenUnsatisfiable: DoNotSchedule",
  "requiredDuringSchedulingIgnoredDuringExecution",
  "kind: PodDisruptionBudget",
  "minAvailable: 4",
  "automountServiceAccountToken: false",
  "readOnlyRootFilesystem: true",
  "audience: agentplat-mesh-signer",
  "kind: NetworkPolicy",
  "agentplat-staging-mesh-peer:RENDER_REQUIRED",
]) assert.ok(rendered.includes(phrase), `distributed deployment missing: ${phrase}`);
assert.doesNotMatch(rendered, /PRIVATE_KEY_JWK/u);
assert.match(rendered, /MESH_EXTERNAL_SIGNER_ENDPOINT/u);
assert.match(rendered, /MESH_SIGNER_TOKEN_FILE/u);
const entrypoint = await readFile(
  path.join(root, "examples/mesh-multiprocess/staging-entrypoint.mjs"),
  "utf8",
);
assert.match(entrypoint, /POD_UID/u);
assert.match(entrypoint, /MESH_PROCESS_SPECS/u);
assert.match(entrypoint, /MESH_LISTEN_HOST/u);
const dockerfile = await readFile(
  path.join(
    root,
    "deploy/agent-morphogenesis-beta1-distributed-staging/Dockerfile.mesh-peer",
  ),
  "utf8",
);
assert.match(dockerfile, /USER node/u);
assert.doesNotMatch(dockerfile, /PRIVATE_KEY/u);

console.log(JSON.stringify({
  status: "passed",
  meshProcesses: 6,
  minimumAvailable: 4,
  topologyKeys: ["topology.kubernetes.io/zone", "kubernetes.io/hostname"],
  privateKeyMounted: false,
  imageStatus: "render-required-by-digest",
  deploymentApplied: false,
  stagingQualification: "not-established",
  productionClaimPermitted: false,
}, null, 2));
