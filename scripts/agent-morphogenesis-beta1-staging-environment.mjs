#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = option("--mode") ?? "contract-smoke";
const profile = await json(path.join(
  root,
  "config/agent-morphogenesis-beta1-staging-qualification-v1.json",
));

if (mode === "contract-smoke") {
  const template = await json(path.join(
    root,
    "deploy/agent-morphogenesis-beta1-distributed-staging/inventory.template.json",
  ));
  assert.equal(template.status, "unbound-template");
  assert.equal(template.cluster.failureDomains.length, 3);
  assert.equal(template.agentMesh.peerIdentities.length, 4);
  assert.equal(template.agentMesh.processes.length, 4);
  assert.equal(template.agentMesh.minimumCumulativeProcessStarts, 6);
  assert.equal(template.keyCustody.nonExportable, true);
  assert.equal(template.rollbackWitness.monotonic, true);
  assert.equal(template.claimBoundary.productionClaimPermitted, false);
  assert.match(JSON.stringify(template), /REPLACE_/u);
  const fixture = boundFixture(template);
  rejectTemplateValues(fixture);
  validateInventory(fixture);
  for (const mutate of [
    (value) => { value.cluster.failureDomains[1].nodeUid = value.cluster.failureDomains[0].nodeUid; },
    (value) => { value.images.agentplatRuntime = "registry.invalid/agentplat:latest"; },
    (value) => { value.keyCustody.nonExportable = false; },
    (value) => { value.rollbackWitness.protectionDomainId = value.cluster.clusterId; },
  ]) {
    const invalid = structuredClone(fixture);
    mutate(invalid);
    assert.throws(() => validateInventory(invalid));
  }
  console.log(JSON.stringify({
    status: "passed",
    inventoryStatus: "unbound-template",
    inspectionPermitted: false,
    stagingQualification: "not-established",
    productionClaimPermitted: false,
  }, null, 2));
} else if (mode === "inspect") {
  const inventoryPath = external(required("--inventory"));
  const outputDirectory = external(required("--output-directory"));
  const inventory = await json(inventoryPath);
  rejectTemplateValues(inventory);
  validateInventory(inventory);
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-staging-environment-inspection-v1",
    status: "passed",
    profileId: profile.profileId,
    sourceCommit: inventory.sourceCommit,
    inventoryDigest: digest("agentplat-agent-morphogenesis-beta1-distributed-staging-inventory-v1", inventory),
    clusterId: inventory.cluster.clusterId,
    failureDomainCount: inventory.cluster.failureDomains.length,
    nodeUidCount: new Set(inventory.cluster.failureDomains.map(({ nodeUid }) => nodeUid)).size,
    meshPeerIdentityCount: inventory.agentMesh.peerIdentities.length,
    activeMeshProcessCount: inventory.agentMesh.processes.length,
    minimumCumulativeMeshProcessStarts: inventory.agentMesh.minimumCumulativeProcessStarts,
    meshFailureDomainCount: new Set(inventory.agentMesh.processes.map(({ failureDomainId }) => failureDomainId)).size,
    keyCustody: {
      provider: inventory.keyCustody.provider,
      canonicalKeyId: inventory.keyCustody.canonicalKeyId,
      nonExportable: true,
      rotationEnabled: true,
    },
    rollbackWitnessProtectionDomainId: inventory.rollbackWitness.protectionDomainId,
    observabilityConfigured: true,
    inspectionScope: "declared-environment-bindings-only",
    runtimeEvidenceCollected: false,
    stagingQualification: "not-established",
    productionReadiness: "not-established",
    productionClaimPermitted: false,
  };
  const receipt = {
    ...body,
    receiptDigest: digest(
      "agentplat-agent-morphogenesis-beta1-staging-environment-inspection-v1",
      body,
    ),
  };
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, "environment-inspection.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  console.log(JSON.stringify(receipt, null, 2));
} else if (mode === "resolve-provider") {
  const inventoryPath = external(required("--inventory"));
  const inspectionPath = external(required("--inspection"));
  const outputDirectory = external(required("--output-directory"));
  const inventory = await json(inventoryPath);
  const inspection = await json(inspectionPath);
  rejectTemplateValues(inventory);
  validateInventory(inventory);
  assert.equal(inspection.status, "passed");
  assert.equal(inspection.sourceCommit, inventory.sourceCommit);
  assert.equal(
    inspection.inventoryDigest,
    digest("agentplat-agent-morphogenesis-beta1-distributed-staging-inventory-v1", inventory),
  );
  const kubectl = option("--kubectl") ?? "kubectl";
  const context = inventory.cluster.kubeContext;
  const kubeConfig = commandJson(kubectl, [
    "--context", context, "config", "view", "--minify", "--raw", "-o", "json",
  ]);
  const resolvedServer = kubeConfig.clusters?.[0]?.cluster?.server;
  assert.equal(normalizeUrl(resolvedServer), normalizeUrl(inventory.cluster.apiServer));
  const namespace = commandJson(kubectl, [
    "--context", context, "get", "namespace", inventory.cluster.namespace,
    "-o", "json",
  ]);
  assert.equal(namespace.metadata?.uid, inventory.cluster.namespaceUid);
  const nodes = commandJson(kubectl, [
    "--context", context, "get", "nodes", "-o", "json",
  ]).items;
  assert.ok(Array.isArray(nodes));
  const nodesByUid = new Map(nodes.map((node) => [node.metadata?.uid, node]));
  const resolvedNodes = inventory.cluster.failureDomains.map((domain) => {
    const node = nodesByUid.get(domain.nodeUid);
    assert.ok(node, `declared node UID is absent: ${domain.nodeUid}`);
    assert.equal(node.metadata?.labels?.["topology.kubernetes.io/zone"], domain.zone);
    assert.notEqual(node.spec?.unschedulable, true);
    assert.equal(
      node.status?.conditions?.some(
        (condition) => condition.type === "Ready" && condition.status === "True",
      ),
      true,
    );
    return {
      domainId: domain.domainId,
      zone: domain.zone,
      nodeUid: domain.nodeUid,
      nodeName: node.metadata?.name,
      providerId: node.spec?.providerID,
      ready: true,
    };
  });
  const aws = option("--aws-cli") ?? "aws";
  const awsPrefix = [
    ...(option("--aws-profile") ? ["--profile", option("--aws-profile")] : []),
    ...(option("--aws-region") ? ["--region", option("--aws-region")] : []),
  ];
  const key = commandJson(aws, [
    ...awsPrefix, "kms", "get-public-key", "--key-id",
    inventory.keyCustody.canonicalKeyId, "--output", "json",
  ]);
  assert.equal(key.KeyId, inventory.keyCustody.canonicalKeyId);
  assert.equal(key.KeySpec, "ECC_NIST_EDWARDS25519");
  assert.equal(key.KeyUsage, "SIGN_VERIFY");
  assert.ok(key.SigningAlgorithms?.includes("ED25519_SHA_512"));
  assert.equal(typeof key.PublicKey, "string");
  const publicKey = Buffer.from(key.PublicKey, "base64");
  const imported = await crypto.subtle.importKey(
    "spki", publicKey, { name: "Ed25519" }, false, ["verify"],
  );
  assert.equal(imported.type, "public");
  const metadata = commandJson(aws, [
    ...awsPrefix, "kms", "describe-key", "--key-id",
    inventory.keyCustody.canonicalKeyId, "--output", "json",
  ]).KeyMetadata;
  assert.equal(metadata?.Arn, inventory.keyCustody.canonicalKeyId);
  assert.equal(metadata?.Enabled, true);
  assert.equal(metadata?.KeyState, "Enabled");
  assert.equal(metadata?.KeySpec, "ECC_NIST_EDWARDS25519");
  assert.equal(metadata?.KeyUsage, "SIGN_VERIFY");
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-staging-provider-resolution-v1",
    status: "passed",
    sourceCommit: inventory.sourceCommit,
    inventoryDigest: inspection.inventoryDigest,
    inspectionReceiptDigest: inspection.receiptDigest,
    cluster: {
      context,
      apiServer: inventory.cluster.apiServer,
      namespace: inventory.cluster.namespace,
      namespaceUid: inventory.cluster.namespaceUid,
      resolvedNodes,
    },
    keyCustody: {
      provider: "aws-kms",
      canonicalKeyId: key.KeyId,
      publicKeyFingerprint: `sha256:${createHash("sha256").update(publicKey).digest("hex")}`,
      keySpec: key.KeySpec,
      keyUsage: key.KeyUsage,
      signingAlgorithm: "ED25519_SHA_512",
      keyState: metadata.KeyState,
      nonExportable: true,
    },
    resolutionScope: "read-only-kubernetes-and-kms-identity",
    runtimeEvidenceCollected: false,
    stagingQualification: "not-established",
    productionReadiness: "not-established",
    productionClaimPermitted: false,
  };
  const receipt = {
    ...body,
    receiptDigest: digest(
      "agentplat-agent-morphogenesis-beta1-staging-provider-resolution-v1",
      body,
    ),
  };
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, "provider-resolution.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  console.log(JSON.stringify(receipt, null, 2));
} else {
  throw new TypeError("staging_environment_mode_invalid");
}

function validateInventory(value) {
  assert.equal(value.schemaVersion, 1);
  assert.equal(
    value.kind,
    "agentplat-agent-morphogenesis-beta1-distributed-staging-inventory-v1",
  );
  assert.equal(value.status, "bound");
  assert.equal(value.profileId, profile.profileId);
  assert.match(value.sourceCommit, /^[0-9a-f]{40}$/u);
  https(value.cluster.apiServer, "cluster API");
  text(value.cluster.provider, "cluster provider");
  text(value.cluster.clusterId, "cluster ID");
  text(value.cluster.kubeContext, "Kubernetes context");
  text(value.cluster.namespace, "Kubernetes namespace");
  text(value.cluster.namespaceUid, "Kubernetes namespace UID");
  text(value.cluster.region, "cluster region");
  assert.ok(
    value.cluster.failureDomains.length >=
      profile.requiredInfrastructure.minimumFailureDomains,
  );
  unique(value.cluster.failureDomains, ({ domainId }) => domainId, "failure domain IDs");
  unique(value.cluster.failureDomains, ({ zone }) => zone, "failure domain zones");
  unique(value.cluster.failureDomains, ({ nodeUid }) => nodeUid, "failure domain node UIDs");
  const domainIds = new Set(value.cluster.failureDomains.map(({ domainId }) => domainId));
  for (const domain of value.cluster.failureDomains) {
    text(domain.domainId, "failure domain ID");
    text(domain.zone, "failure domain zone");
    text(domain.nodeUid, "failure domain node UID");
  }
  assert.match(value.images.agentplatRuntime, /@sha256:[0-9a-f]{64}$/u);
  assert.equal(value.images.sourceCommitLabel, value.sourceCommit);
  assert.equal(value.postgresql.tlsMode, "verify-full");
  assert.equal(value.postgresql.persistent, true);
  assert.equal(value.postgresql.backupEnabled, true);
  assert.equal(value.postgresql.pointInTimeRecoveryEnabled, true);
  assert.match(value.postgresql.endpoint, /^postgresql:\/\//u);
  assert.ok(value.postgresql.failureDomainIds.length >= 2);
  subset(value.postgresql.failureDomainIds, domainIds, "PostgreSQL failure domains");
  https(value.temporal.endpoint, "Temporal endpoint");
  assert.equal(value.temporal.tlsEnabled, true);
  assert.equal(value.temporal.persistent, true);
  subset(value.temporal.workerFailureDomainIds, domainIds, "Temporal worker failure domains");
  assert.equal(new Set(value.temporal.workerFailureDomainIds).size >= 3, true);
  assert.ok(
    value.agentMesh.peerIdentities.length >=
      profile.requiredInfrastructure.minimumAgentMeshPeerIdentities,
  );
  text(value.agentMesh.postgresSchema, "Mesh PostgreSQL schema");
  https(value.agentMesh.externalSignerEndpoint, "Mesh external signer endpoint");
  assert.match(value.agentMesh.publicKeyBindingsDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.ok(
    value.agentMesh.processes.length >=
      profile.requiredInfrastructure.minimumActiveAgentMeshPeerProcesses,
  );
  assert.ok(
    value.agentMesh.minimumCumulativeProcessStarts >=
      profile.requiredInfrastructure.minimumCumulativeAgentMeshProcessStarts,
  );
  unique(value.agentMesh.peerIdentities, (item) => item, "Mesh peer identities");
  unique(value.agentMesh.processes, ({ processId }) => processId, "Mesh process IDs");
  const peers = new Set(value.agentMesh.peerIdentities);
  for (const process of value.agentMesh.processes) {
    assert.ok(peers.has(process.peerId));
    text(process.instanceId, "Mesh instance ID");
    text(process.keyId, "Mesh key ID");
    assert.ok(domainIds.has(process.failureDomainId));
    https(process.endpoint, "Mesh process endpoint");
  }
  assert.equal(
    new Set(value.agentMesh.processes.map(({ failureDomainId }) => failureDomainId)).size >= 3,
    true,
  );
  assert.equal(value.keyCustody.provider, "aws-kms");
  assert.match(value.keyCustody.canonicalKeyId, /^arn:aws:kms:[a-z0-9-]+:[0-9]{12}:key\/[0-9a-f-]+$/u);
  assert.match(value.keyCustody.accountId, /^[0-9]{12}$/u);
  assert.equal(value.keyCustody.keySpec, "ECC_NIST_EDWARDS25519");
  assert.equal(value.keyCustody.signingAlgorithm, "ED25519_SHA_512");
  assert.equal(value.keyCustody.nonExportable, true);
  assert.equal(value.keyCustody.rotationEnabled, true);
  text(value.keyCustody.rotationEvidenceReference, "KMS rotation evidence");
  text(value.rollbackWitness.provider, "rollback witness provider");
  text(value.rollbackWitness.resourceId, "rollback witness resource ID");
  https(value.rollbackWitness.endpoint, "rollback witness endpoint");
  text(value.rollbackWitness.protectionDomainId, "rollback witness protection domain");
  assert.notEqual(value.rollbackWitness.protectionDomainId, value.cluster.clusterId);
  assert.notEqual(value.rollbackWitness.protectionDomainId, value.keyCustody.accountId);
  assert.equal(value.rollbackWitness.monotonic, true);
  assert.equal(value.rollbackWitness.durable, true);
  assert.notEqual(value.rollbackWitness.writeIdentity, value.rollbackWitness.readIdentity);
  https(value.faultInjection.gatewayEndpoint, "fault injection gateway endpoint");
  assert.deepEqual([...value.faultInjection.supportedFaultClasses].sort(), [
    "host-loss", "network-partition", "postgres-failover", "temporal-worker-loss",
  ]);
  https(value.scenarioExecution.gatewayEndpoint, "scenario execution gateway endpoint");
  https(value.observability.otlpEndpoint, "OTLP endpoint");
  https(value.observability.gatewayEndpoint, "observability gateway endpoint");
  https(value.observability.metricsEndpoint, "metrics endpoint");
  https(value.observability.logsEndpoint, "logs endpoint");
  text(value.observability.alertReceiverId, "alert receiver ID");
  text(value.observability.alertDeliveryEvidenceReference, "alert delivery evidence");
  assert.deepEqual(value.claimBoundary, {
    stagingQualification: "not-established",
    productionReadiness: "not-established",
    productionClaimPermitted: false,
  });
}

function rejectTemplateValues(value) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /REPLACE_|example|localhost|127\.0\.0\.1|single-host/iu);
}

function boundFixture(template) {
  const sourceCommit = "a".repeat(40);
  return {
    ...structuredClone(template),
    status: "bound",
    sourceCommit,
    cluster: {
      provider: "synthetic-provider",
      clusterId: "cluster-staging-immutable-123",
      apiServer: "https://cluster.staging.invalid",
      kubeContext: "agentplat-staging-fixture",
      namespace: "agentplat-morphogenesis-staging",
      namespaceUid: "namespace-uid-staging-123",
      region: "region-1",
      failureDomains: [
        { domainId: "zone-a", zone: "region-1a", nodeUid: "node-uid-a-123" },
        { domainId: "zone-b", zone: "region-1b", nodeUid: "node-uid-b-456" },
        { domainId: "zone-c", zone: "region-1c", nodeUid: "node-uid-c-789" },
      ],
    },
    images: {
      agentplatRuntime: `registry.invalid/agentplat-staging@sha256:${"b".repeat(64)}`,
      sourceCommitLabel: sourceCommit,
    },
    postgresql: {
      resourceId: "database-immutable-123",
      endpoint: "postgresql://database.staging.invalid:5432/agentplat",
      tlsMode: "verify-full",
      persistent: true,
      backupEnabled: true,
      pointInTimeRecoveryEnabled: true,
      failureDomainIds: ["zone-a", "zone-b"],
    },
    temporal: {
      resourceId: "temporal-immutable-123",
      endpoint: "https://temporal.staging.invalid:7233",
      namespace: "agentplat-morphogenesis-staging",
      tlsEnabled: true,
      persistent: true,
      workerFailureDomainIds: ["zone-a", "zone-b", "zone-c"],
    },
    agentMesh: {
      tenantId: "tenant:staging-fixture",
      meshId: "mesh:staging-fixture",
      postgresSchema: "mesh_morphogenesis_staging",
      externalSignerEndpoint: "https://signer.staging.invalid/v1/sign",
      publicKeyBindingsDigest: `sha256:${"c".repeat(64)}`,
      peerIdentities: ["peer-a", "peer-b", "peer-c", "peer-d"],
      minimumCumulativeProcessStarts: 6,
      processes: [
        ["mesh-a-1", "peer-a", "zone-a"],
        ["mesh-b-1", "peer-b", "zone-b"],
        ["mesh-c-1", "peer-c", "zone-c"],
        ["mesh-d-1", "peer-d", "zone-a"],
      ].map(([processId, peerId, failureDomainId]) => ({
        processId,
        peerId,
        instanceId: `${processId}-instance`,
        keyId: `key-${peerId}`,
        failureDomainId,
        endpoint: `https://${processId}.staging.invalid`,
      })),
    },
    keyCustody: {
      provider: "aws-kms",
      canonicalKeyId: "arn:aws:kms:us-east-1:123456789012:key/11111111-2222-3333-4444-555555555555",
      accountId: "123456789012",
      keySpec: "ECC_NIST_EDWARDS25519",
      signingAlgorithm: "ED25519_SHA_512",
      nonExportable: true,
      rotationEnabled: true,
      rotationEvidenceReference: "evidence:kms-rotation-fixture",
    },
    rollbackWitness: {
      provider: "independent-provider",
      resourceId: "witness-immutable-123",
      endpoint: "https://witness.staging.invalid",
      protectionDomainId: "witness-domain-987",
      monotonic: true,
      durable: true,
      writeIdentity: "identity:witness-write",
      readIdentity: "identity:witness-read",
    },
    observability: {
      gatewayEndpoint: "https://observability.staging.invalid/v1/preflight",
      otlpEndpoint: "https://otlp.staging.invalid",
      metricsEndpoint: "https://metrics.staging.invalid",
      logsEndpoint: "https://logs.staging.invalid",
      alertReceiverId: "receiver:staging-ops",
      alertDeliveryEvidenceReference: "evidence:alert-delivery-fixture",
    },
    faultInjection: {
      gatewayEndpoint: "https://faults.staging.invalid/v1/execute",
      supportedFaultClasses: [
        "network-partition", "host-loss", "postgres-failover", "temporal-worker-loss",
      ],
    },
    scenarioExecution: {
      gatewayEndpoint: "https://scenarios.staging.invalid/v1/execute",
    },
  };
}

function subset(values, allowed, label) {
  for (const value of values) assert.ok(allowed.has(value), `${label} contains unknown domain`);
}

function unique(values, key, label) {
  assert.equal(new Set(values.map(key)).size, values.length, `${label} are not unique`);
}

function https(value, label) {
  assert.match(value, /^https:\/\//u, `${label} must use HTTPS`);
}

function text(value, label) {
  assert.equal(typeof value, "string", `${label} is missing`);
  assert.ok(value.length >= 3, `${label} is too short`);
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function required(name) {
  const value = option(name);
  if (!value) throw new TypeError(`${name} is required`);
  return value;
}

function external(value) {
  const resolved = path.resolve(value);
  const relative = path.relative(root, resolved);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)))
    throw new TypeError("staging environment artifact path must be external");
  return resolved;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\n${JSON.stringify(value)}`)
    .digest("hex")}`;
}

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function commandJson(executable, args) {
  const output = execFileSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    return JSON.parse(output);
  } catch {
    throw new Error("staging provider command returned invalid JSON");
  }
}

function normalizeUrl(value) {
  assert.equal(typeof value, "string");
  const url = new URL(value);
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/$/u, "")}`;
}
