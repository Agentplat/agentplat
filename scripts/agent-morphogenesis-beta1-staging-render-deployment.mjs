#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parse(process.argv.slice(2));
const mode = options.mode ?? "contract-smoke";
const deploymentDirectory = path.join(
  root,
  "deploy/agent-morphogenesis-beta1-distributed-staging/kubernetes",
);

if (mode === "contract-smoke") {
  assert.deepEqual(Object.keys(options).sort(), ["mode"]);
  const rendered = kustomize();
  assert.match(rendered, /agentplat-staging-mesh-peer:RENDER_REQUIRED/u);
  assert.match(rendered, /TARGET_WIRE_VERSIONS_BY_PEER/u);
  assert.match(rendered, /PUBLIC_KEY_BINDINGS/u);
  assert.doesNotMatch(rendered, /kind: Secret/u);
  assert.doesNotMatch(rendered, /PRIVATE_KEY|PRIVATE_KEY_JWK/u);
  console.log(JSON.stringify({
    status: "passed",
    renderPermitted: false,
    imageStatus: "render-required-by-digest",
    secretsRendered: false,
    deploymentApplied: false,
    stagingQualification: "not-established",
    productionClaimPermitted: false,
  }, null, 2));
} else if (mode === "render") {
  exact([
    "inspection", "inventory", "mode", "output-directory",
    "provider-resolution", "public-key-bindings", "source-sha",
  ]);
  const outputDirectory = external(required("output-directory"));
  const [inventory, inspection, providerResolution, publicKeyBindings] = await Promise.all([
    json(external(required("inventory"))),
    json(external(required("inspection"))),
    json(external(required("provider-resolution"))),
    json(external(required("public-key-bindings"))),
  ]);
  const sourceCommit = required("source-sha");
  assert.match(sourceCommit, /^[0-9a-f]{40}$/u);
  assert.equal(inventory.status, "bound");
  assert.equal(inventory.sourceCommit, sourceCommit);
  assert.equal(inspection.status, "passed");
  assert.equal(providerResolution.status, "passed");
  assert.equal(providerResolution.sourceCommit, sourceCommit);
  assert.equal(providerResolution.inspectionReceiptDigest, inspection.receiptDigest);
  assert.equal(inspection.inventoryDigest, providerResolution.inventoryDigest);
  assert.match(inventory.images.agentplatRuntime, /@sha256:[0-9a-f]{64}$/u);
  assert.equal(inventory.images.sourceCommitLabel, sourceCommit);
  assert.doesNotMatch(JSON.stringify(inventory), /REPLACE_|localhost|127\.0\.0\.1/iu);
  const peers = inventory.agentMesh.peerIdentities;
  assert.deepEqual(Object.keys(publicKeyBindings).sort(), [...peers].sort());
  for (const process of inventory.agentMesh.processes) {
    assert.equal(publicKeyBindings[process.peerId]?.keyId, process.keyId);
    assert.equal(typeof publicKeyBindings[process.peerId]?.jwk, "object");
    assert.equal(publicKeyBindings[process.peerId].jwk.kty, "OKP");
    assert.equal(publicKeyBindings[process.peerId].jwk.crv, "Ed25519");
    assert.equal(typeof publicKeyBindings[process.peerId].jwk.x, "string");
    assert.equal("d" in publicKeyBindings[process.peerId].jwk, false);
  }
  const publicKeyBindingsDigest = sha(canonical(publicKeyBindings));
  assert.equal(publicKeyBindingsDigest, inventory.agentMesh.publicKeyBindingsDigest);
  const peerEndpoints = Object.fromEntries(
    inventory.agentMesh.processes.map(({ peerId, endpoint }) => [peerId, endpoint]),
  );
  assert.equal(Object.keys(peerEndpoints).length, peers.length);
  const processSpecs = inventory.agentMesh.processes.map(
    ({ processId, peerId, instanceId, keyId }) => ({
      processId, peerId, instanceId, keyId,
    }),
  );
  const wireVersions = wireVersionsByPeer(peers);
  const base = kustomize().replace(
    "agentplat-staging-mesh-peer:RENDER_REQUIRED",
    inventory.images.agentplatRuntime,
  );
  assert.doesNotMatch(base, /RENDER_REQUIRED/u);
  assert.equal(base.includes(inventory.images.agentplatRuntime), true);
  const configMap = {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name: "morphogenesis-mesh-runtime",
      namespace: inventory.cluster.namespace,
      labels: {
        "app.kubernetes.io/part-of": "agentplat",
        "agentplat.com/evidence-boundary": "staging-only",
      },
    },
    immutable: true,
    data: {
      "process-specs.json": JSON.stringify(processSpecs),
      "peer-endpoints.json": JSON.stringify(peerEndpoints),
      "target-wire-versions-by-peer.json": JSON.stringify(wireVersions),
      "public-key-bindings.json": JSON.stringify(publicKeyBindings),
      "tenant-id": inventory.agentMesh.tenantId,
      "mesh-id": inventory.agentMesh.meshId,
      "postgres-schema": inventory.agentMesh.postgresSchema,
      "signer-endpoint": inventory.agentMesh.externalSignerEndpoint,
    },
  };
  const artifacts = {
    "distributed-base.yaml": Buffer.from(base),
    "runtime-configmap.json": Buffer.from(`${JSON.stringify(configMap, null, 2)}\n`),
  };
  const artifactManifest = Object.entries(artifacts).map(([name, bytes]) => ({
    name,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }));
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-staging-deployment-render-v1",
    status: "rendered",
    sourceCommit,
    inventoryDigest: inspection.inventoryDigest,
    inspectionReceiptDigest: inspection.receiptDigest,
    providerResolutionReceiptDigest: providerResolution.receiptDigest,
    image: inventory.images.agentplatRuntime,
    namespace: inventory.cluster.namespace,
    activeMeshProcesses: processSpecs.length,
    minimumCumulativeProcessStarts: inventory.agentMesh.minimumCumulativeProcessStarts,
    publicKeyBindingsDigest,
    artifacts: artifactManifest,
    secretsRendered: false,
    requiredPrecreatedSecret: "morphogenesis-mesh-credentials",
    deploymentApplied: false,
    stagingQualification: "not-established",
    productionReadiness: "not-established",
    productionClaimPermitted: false,
  };
  const manifest = {
    ...body,
    manifestDigest: digest(
      "agentplat-agent-morphogenesis-beta1-staging-deployment-render-v1",
      body,
    ),
  };
  await mkdir(outputDirectory, { recursive: false });
  await Promise.all([
    ...Object.entries(artifacts).map(([name, bytes]) =>
      writeFile(path.join(outputDirectory, name), bytes, { flag: "wx" }),
    ),
    writeFile(
      path.join(outputDirectory, "deployment-render-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    ),
  ]);
  console.log(JSON.stringify(manifest, null, 2));
} else {
  throw new TypeError("staging_deployment_render_mode_invalid");
}

function wireVersionsByPeer(peers) {
  return Object.fromEntries(peers.map((peer, peerIndex) => [
    peer,
    Object.fromEntries(peers
      .filter((candidate) => candidate !== peer)
      .map((candidate, candidateIndex) => [candidate, (peerIndex + candidateIndex) % 2])),
  ]));
}

function kustomize() {
  return execFileSync("kubectl", ["kustomize", deploymentDirectory], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
}

function sha(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function digest(domain, value) {
  return sha(`${domain}\n${JSON.stringify(value)}`);
}

function required(name) {
  const value = options[name];
  if (!value) throw new TypeError(`${name} is required`);
  return value;
}

function external(value) {
  const resolved = path.resolve(value);
  const relative = path.relative(root, resolved);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)))
    throw new TypeError("staging deployment render paths must be external");
  return resolved;
}

function exact(expected) {
  assert.deepEqual(Object.keys(options).sort(), expected.sort());
}

function parse(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--") continue;
    if (!args[index].startsWith("--")) throw new TypeError("invalid option");
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new TypeError(`missing value for ${args[index]}`);
    result[args[index].slice(2)] = value;
    index += 1;
  }
  return result;
}

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
