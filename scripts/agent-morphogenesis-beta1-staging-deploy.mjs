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

if (mode === "contract-smoke") {
  exact(["mode"]);
  console.log(JSON.stringify({
    status: "passed",
    serverSideDryRunRequired: true,
    explicitApplyConfirmationRequired: true,
    requiredSecretKeys: ["channel-token", "control-token", "database-url"],
    secretsRead: false,
    deploymentApplied: false,
    stagingQualification: "not-established",
    productionClaimPermitted: false,
  }, null, 2));
} else if (mode === "preflight") {
  exact(["inventory", "mode", "output-directory", "render-directory"]);
  const inventory = await json(external(required("inventory")));
  const renderDirectory = external(required("render-directory"));
  const outputDirectory = external(required("output-directory"));
  const render = await verifyRender(renderDirectory, inventory);
  const kube = kubectl(inventory);
  const secretKeys = kube.text([
    "get", "secret", "morphogenesis-mesh-credentials", "-n",
    inventory.cluster.namespace,
    "-o", "go-template={{range $key, $value := .data}}{{$key}}{{\"\\n\"}}{{end}}",
  ]).split("\n").filter(Boolean).sort();
  assert.deepEqual(secretKeys, ["channel-token", "control-token", "database-url"]);
  kube.text([
    "apply", "--server-side", "--dry-run=server", "-f",
    path.join(renderDirectory, "runtime-configmap.json"),
  ]);
  kube.text([
    "apply", "--server-side", "--dry-run=server", "-f",
    path.join(renderDirectory, "distributed-base.yaml"),
  ]);
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-staging-deployment-preflight-v1",
    status: "passed",
    sourceCommit: inventory.sourceCommit,
    inventoryDigest: render.inventoryDigest,
    renderManifestDigest: render.manifestDigest,
    clusterId: inventory.cluster.clusterId,
    kubeContext: inventory.cluster.kubeContext,
    namespace: inventory.cluster.namespace,
    namespaceUid: inventory.cluster.namespaceUid,
    serverSideDryRun: "passed",
    requiredSecretName: "morphogenesis-mesh-credentials",
    requiredSecretKeys: secretKeys,
    secretValuesRead: false,
    deploymentApplied: false,
    stagingQualification: "not-established",
    productionReadiness: "not-established",
    productionClaimPermitted: false,
  };
  const receipt = { ...body, receiptDigest: digest("staging-deployment-preflight-v1", body) };
  await emit(outputDirectory, "deployment-preflight.json", receipt);
  console.log(JSON.stringify(receipt, null, 2));
} else if (mode === "apply") {
  exact([
    "confirm", "inventory", "mode", "output-directory", "preflight",
    "render-directory",
  ]);
  assert.equal(options.confirm, "APPLY_MORPHOGENESIS_DISTRIBUTED_STAGING");
  const inventory = await json(external(required("inventory")));
  const renderDirectory = external(required("render-directory"));
  const outputDirectory = external(required("output-directory"));
  const preflight = await json(external(required("preflight")));
  const render = await verifyRender(renderDirectory, inventory);
  assert.equal(preflight.status, "passed");
  assert.equal(preflight.renderManifestDigest, render.manifestDigest);
  assert.equal(preflight.inventoryDigest, render.inventoryDigest);
  assert.equal(preflight.deploymentApplied, false);
  const kube = kubectl(inventory);
  kube.text(["apply", "--server-side", "-f", path.join(renderDirectory, "runtime-configmap.json")]);
  kube.text(["apply", "--server-side", "-f", path.join(renderDirectory, "distributed-base.yaml")]);
  kube.text([
    "rollout", "status", "statefulset/morphogenesis-mesh", "-n",
    inventory.cluster.namespace, "--timeout=10m",
  ]);
  const statefulSet = kube.json([
    "get", "statefulset", "morphogenesis-mesh", "-n",
    inventory.cluster.namespace, "-o", "json",
  ]);
  assert.equal(statefulSet.status?.readyReplicas, 4);
  assert.equal(statefulSet.status?.currentReplicas, 4);
  assert.equal(statefulSet.spec?.template?.spec?.containers?.[0]?.image, inventory.images.agentplatRuntime);
  const pods = kube.json([
    "get", "pods", "-n", inventory.cluster.namespace,
    "-l", "app.kubernetes.io/name=morphogenesis-mesh-peer", "-o", "json",
  ]).items;
  assert.equal(pods.length, 4);
  const nodes = kube.json(["get", "nodes", "-o", "json"]).items;
  const nodesByName = new Map(nodes.map((node) => [node.metadata.name, node]));
  const placements = [];
  for (const pod of pods.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name))) {
    assert.equal(pod.status.phase, "Running");
    assert.equal(pod.status.conditions?.some(
      (condition) => condition.type === "Ready" && condition.status === "True",
    ), true);
    const container = pod.status.containerStatuses?.find(({ name }) => name === "peer");
    assert.equal(container?.ready, true);
    assert.match(container?.imageID, /@sha256:[0-9a-f]{64}$/u);
    const node = nodesByName.get(pod.spec.nodeName);
    assert.ok(node);
    const health = JSON.parse(kube.text([
      "exec", "-n", inventory.cluster.namespace, pod.metadata.name, "-c", "peer",
      "--", "node", "-e",
      "fetch('http://127.0.0.1:43101/healthz').then(async r=>{if(!r.ok)process.exit(2);process.stdout.write(await r.text())})",
    ]));
    assert.equal(health.status, "ready");
    assert.equal(health.signingCustody, "external-https");
    placements.push({
      podName: pod.metadata.name,
      podUid: pod.metadata.uid,
      peerId: health.peerId,
      instanceId: health.instanceId,
      nodeName: pod.spec.nodeName,
      nodeUid: node.metadata.uid,
      zone: node.metadata.labels?.["topology.kubernetes.io/zone"],
      imageId: container.imageID,
      ready: true,
      signingCustody: health.signingCustody,
    });
  }
  assert.equal(new Set(placements.map(({ peerId }) => peerId)).size, 4);
  assert.equal(new Set(placements.map(({ zone }) => zone)).size >= 3, true);
  assert.equal(new Set(placements.map(({ nodeUid }) => nodeUid)).size >= 3, true);
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-staging-deployment-receipt-v1",
    status: "deployed",
    sourceCommit: inventory.sourceCommit,
    inventoryDigest: render.inventoryDigest,
    renderManifestDigest: render.manifestDigest,
    preflightReceiptDigest: preflight.receiptDigest,
    clusterId: inventory.cluster.clusterId,
    namespace: inventory.cluster.namespace,
    namespaceUid: inventory.cluster.namespaceUid,
    statefulSetUid: statefulSet.metadata.uid,
    statefulSetGeneration: statefulSet.metadata.generation,
    image: inventory.images.agentplatRuntime,
    activeMeshProcesses: placements.length,
    cumulativeMeshProcessStarts: placements.length,
    placements,
    failureDomainCount: new Set(placements.map(({ zone }) => zone)).size,
    nodeCount: new Set(placements.map(({ nodeUid }) => nodeUid)).size,
    externalSigningCustodyObserved: true,
    secretValuesRead: false,
    stagingQualification: "not-established",
    productionReadiness: "not-established",
    productionClaimPermitted: false,
  };
  const receipt = { ...body, receiptDigest: digest("staging-deployment-receipt-v1", body) };
  await emit(outputDirectory, "deployment-receipt.json", receipt);
  console.log(JSON.stringify(receipt, null, 2));
} else {
  throw new TypeError("staging_deploy_mode_invalid");
}

async function verifyRender(directory, inventory) {
  const manifest = await json(path.join(directory, "deployment-render-manifest.json"));
  assert.equal(manifest.status, "rendered");
  assert.equal(manifest.sourceCommit, inventory.sourceCommit);
  assert.equal(manifest.image, inventory.images.agentplatRuntime);
  for (const artifact of manifest.artifacts) {
    const bytes = await readFile(path.join(directory, artifact.name));
    assert.equal(bytes.byteLength, artifact.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256);
  }
  const { manifestDigest, ...body } = manifest;
  assert.equal(manifestDigest, digest("agentplat-agent-morphogenesis-beta1-staging-deployment-render-v1", body));
  return manifest;
}

function kubectl(inventory) {
  const prefix = ["--context", inventory.cluster.kubeContext];
  return {
    text(args) {
      return execFileSync("kubectl", [...prefix, ...args], {
        cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    },
    json(args) { return JSON.parse(this.text(args)); },
  };
}

async function emit(directory, name, value) {
  await mkdir(directory, { recursive: false });
  await writeFile(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8", flag: "wx",
  });
}

function digest(domain, value) {
  return `sha256:${createHash("sha256").update(`${domain}\n${JSON.stringify(value)}`).digest("hex")}`;
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
    throw new TypeError("staging deployment paths must be external");
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
