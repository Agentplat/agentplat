import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MESH_CONFORMANCE_CAPABILITIES,
  MESH_CONFORMANCE_CASES,
  createMeshConformanceReport,
  validateMeshConformanceReport,
} from "@agentplat/mesh-conformance";
import { runMeshDurabilityConformance } from "@agentplat/mesh-conformance/durability";
import { runMeshProtocolConformance } from "@agentplat/mesh-conformance/protocol";
import { runMeshRoomsConformance } from "@agentplat/mesh-conformance/rooms";
import { runMeshTransportConformance } from "@agentplat/mesh-conformance/transport";
import {
  MESH_DURABILITY_SCHEMA_VERSION,
  MESH_DURABLE_GENESIS_DIGEST,
  computeMeshDurableValueDigest,
  createMeshDurableJournalEntry,
  createMeshDurableSnapshotCodecRegistry,
} from "@agentplat/mesh/durability";
import {
  DEFAULT_MESH_CRYPTO_POLICY,
  createStaticMeshKeyResolver,
  createWebCryptoMeshEnvelopeSigner,
  importMeshEd25519PublicKey,
  verifyMeshEnvelope,
} from "@agentplat/mesh-crypto";
import {
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  canonicalizeMeshJsonBytes,
  parseSignedMeshEnvelope,
} from "@agentplat/mesh-protocol";
import {
  createMemoryRoomMeshIdempotencyRepository,
  createRoomMeshBridge,
} from "@agentplat/rooms-mesh";

const encoder = new TextEncoder();
const fixturesRoot = new URL(
  "../packages/mesh-protocol/fixtures/",
  import.meta.url,
);
const allCapabilities = [...MESH_CONFORMANCE_CAPABILITIES];

async function protocolFixtures() {
  const [v0EnvelopeBytes, v1EnvelopeBytes] = await Promise.all([
    readFile(new URL("v0/peer-ping.json", fixturesRoot)),
    readFile(new URL("v1/peer-ping.json", fixturesRoot)),
  ]);
  const v1 = JSON.parse(v1EnvelopeBytes.toString("utf8"));
  return {
    v0EnvelopeBytes,
    v1EnvelopeBytes,
    unknownEnvelopeBytes: encoder.encode(
      JSON.stringify({ ...v1, wireVersion: 2 }),
    ),
    substitutedV1EnvelopeBytes: encoder.encode(
      JSON.stringify({ ...v1, wireVersion: 0 }),
    ),
    canonicalValueA: { b: 2, a: 1 },
    canonicalValueB: { a: 1, b: 2 },
    expectedCanonicalBytes: encoder.encode('{"a":1,"b":2}'),
  };
}

async function protocolFactory(defect) {
  const [generatedKeys, fixtureKeyRecord] = await Promise.all([
    crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
      "sign",
      "verify",
    ]),
    readFile(new URL("v1/public-key.raw.json", fixturesRoot), "utf8").then(
      JSON.parse,
    ),
  ]);
  const fixtureKey = await importMeshEd25519PublicKey(
    new Uint8Array(Buffer.from(fixtureKeyRecord.publicKeyRaw, "base64url")),
  );
  const resolver = createStaticMeshKeyResolver([
    {
      tenantId: "tenant-a",
      meshId: "mesh-a",
      peerId: "peer-a",
      keyId: "fixture-key-v1",
      algorithm: MESH_SIGNATURE_ALGORITHM,
      publicKey: fixtureKey,
      validFrom: "2026-01-01T00:00:00Z",
      validUntil: "2027-01-01T00:00:00Z",
      status: "active",
    },
    {
      tenantId: "tenant-a",
      meshId: "mesh-a",
      peerId: "peer-conformance",
      keyId: "key-conformance",
      algorithm: MESH_SIGNATURE_ALGORITHM,
      publicKey: generatedKeys.publicKey,
      validFrom: "2026-01-01T00:00:00Z",
      validUntil: "2027-01-01T00:00:00Z",
      status: "active",
    },
  ]);
  return {
    parse(bytes, acceptedWireVersions) {
      if (defect === "accept_unknown") {
        const candidate = JSON.parse(new TextDecoder().decode(bytes));
        if (candidate.wireVersion === 2) {
          return { accepted: true, wireVersion: 2 };
        }
      }
      const result = parseSignedMeshEnvelope(bytes, { acceptedWireVersions });
      return result.ok
        ? { accepted: true, wireVersion: result.value.wireVersion }
        : { accepted: false, reasonCode: result.issues[0].code };
    },
    canonicalize(value) {
      const result = canonicalizeMeshJsonBytes(value);
      if (!result.ok) throw new TypeError(result.issues[0].code);
      return result.value;
    },
    async write(wireVersion) {
      const signed = await createWebCryptoMeshEnvelopeSigner({
        signingPolicy: { allowedWireVersions: [wireVersion] },
      }).sign({
        envelope: {
          protocol: MESH_PROTOCOL,
          wireVersion,
          messageId:
            wireVersion === 0
              ? "AAAAAAAAAAAAAAAAAAAAAA"
              : "BBBBBBBBBBBBBBBBBBBBBA",
          tenantId: "tenant-a",
          meshId: "mesh-a",
          type: "peer.ping",
          sender: {
            peerId: "peer-conformance",
            instanceId: "instance-conformance",
          },
          audience: { kind: "peer", peerId: "peer-a" },
          sequence: wireVersion + 1,
          sentAt: "2026-07-30T00:00:00Z",
          expiresAt: "2026-07-30T00:00:30Z",
          payload: { type: "peer.ping" },
          proof: {
            algorithm: MESH_SIGNATURE_ALGORITHM,
            keyId: "key-conformance",
          },
        },
        privateKey: generatedKeys.privateKey,
      });
      return encoder.encode(JSON.stringify(signed));
    },
    async verify(bytes) {
      if (defect === "relabel_after_sign") return true;
      const parsed = parseSignedMeshEnvelope(bytes);
      if (!parsed.ok) return false;
      const result = await verifyMeshEnvelope({
        envelope: parsed.value,
        resolver,
        policy: DEFAULT_MESH_CRYPTO_POLICY,
        verifiedAt: "2026-07-30T00:00:01Z",
      });
      return result.verified;
    },
  };
}

function transportFactory(defect) {
  return async (scenario) => {
    const attempts = [];
    let calls = 0;
    return {
      async deliver(bytes) {
        calls += 1;
        attempts.push(
          defect === "retry_bytes" && calls === 2
            ? Uint8Array.of(...bytes, 0)
            : new Uint8Array(bytes),
        );
        if (scenario === "redirect") {
          return { disposition: "permanent_rejection" };
        }
        if (scenario === "retry" && calls === 1) {
          return { disposition: "retryable", retryAfterMs: 1 };
        }
        return {
          disposition: "accepted",
          messageId: JSON.parse(new TextDecoder().decode(bytes)).messageId,
        };
      },
      observations() {
        return {
          attempts,
          redirectFollowed:
            defect === "follow_redirect" && scenario === "redirect",
        };
      },
    };
  };
}

function durabilityFactory(defect) {
  return async (scenario) => {
    if (scenario === "snapshot_migration") {
      return snapshotConformanceAdapter(defect);
    }
    const fixtures = await durabilityEnvelopes();
    const repository = new ConformanceMemoryRepository(
      defect === scenario ? defect : undefined,
    );
    const repositories = [repository];
    let activeRepository = repository;
    return {
      repository,
      scope: durabilityScope,
      ...fixtures,
      restartRepository() {
        activeRepository = activeRepository.restart();
        repositories.push(activeRepository);
        return activeRepository;
      },
      advanceTime: (milliseconds) => activeRepository.advanceTime(milliseconds),
      cleanup: () => repositories.forEach((entry) => entry.close()),
    };
  };
}

const durabilityScope = Object.freeze({
  tenantId: "tenant-conformance",
  meshId: "mesh-conformance",
  peerId: "peer-b",
  instanceId: "peer-b-1",
});

async function durabilityEnvelopes() {
  const keys = await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
    "sign",
    "verify",
  ]);
  const signer = createWebCryptoMeshEnvelopeSigner();
  const signed = (messageId, sequence, senderPeerId, audiencePeerId) =>
    signer.sign({
      envelope: {
        protocol: MESH_PROTOCOL,
        wireVersion: 1,
        messageId,
        tenantId: durabilityScope.tenantId,
        meshId: durabilityScope.meshId,
        type: "peer.ping",
        sender: {
          peerId: senderPeerId,
          instanceId: `${senderPeerId}-1`,
        },
        audience: { kind: "peer", peerId: audiencePeerId },
        sequence,
        sentAt: "2026-08-01T00:00:00Z",
        expiresAt: "2026-08-01T00:00:30Z",
        payload: { type: "peer.ping" },
        proof: { algorithm: MESH_SIGNATURE_ALGORITHM, keyId: "key-test" },
      },
      privateKey: keys.privateKey,
    });
  const inboundEnvelopes = await Promise.all([
    signed("AAAAAAAAAAAAAAAAAAAAAA", 1, "peer-a", durabilityScope.peerId),
    signed("BBBBBBBBBBBBBBBBBBBBBA", 2, "peer-a", durabilityScope.peerId),
  ]);
  return {
    inboundEnvelopes,
    conflictingInboundEnvelope: await signed(
      inboundEnvelopes[0].messageId,
      3,
      "peer-a",
      durabilityScope.peerId,
    ),
    outboundEnvelopes: await Promise.all([
      signed("CCCCCCCCCCCCCCCCCCCCCA", 4, durabilityScope.peerId, "peer-a"),
      signed("DDDDDDDDDDDDDDDDDDDDDA", 5, durabilityScope.peerId, "peer-a"),
    ]),
  };
}

async function snapshotConformanceAdapter(defect) {
  let migrationInvocation = 0;
  const format = "application/vnd.agentplat.conformance-snapshot+json";
  const registry = createMeshDurableSnapshotCodecRegistry([
    {
      descriptor: { format, schemaVersion: 2 },
      readableSchemaVersions: [1, 2],
      encode(value) {
        return { count: value.count, label: value.label };
      },
      decode(state, schemaVersion) {
        return {
          count: state.count,
          label: schemaVersion === 1 ? "current" : state.label,
        };
      },
      migrate(state) {
        migrationInvocation += 1;
        return {
          count: state.count,
          label:
            defect === "snapshot_migration"
              ? `current-${migrationInvocation}`
              : "current",
        };
      },
    },
  ]);
  const state = { count: 1 };
  return {
    registry,
    legacySnapshot: Object.freeze({
      schemaVersion: MESH_DURABILITY_SCHEMA_VERSION,
      scope: durabilityScope,
      revision: 1,
      state,
      stateDigest: await computeMeshDurableValueDigest(state),
      snapshotFormat: format,
      snapshotSchemaVersion: 1,
      committedAt: "2026-08-01T00:00:00Z",
    }),
    expectedState: { count: 1, label: "current" },
  };
}

class ConformanceMemoryRepository {
  #clock = 0;
  #closed = false;
  #inbox = new Map();
  #outbox = new Map();
  #snapshot;
  #journal = [];
  #transitions = new Map();
  #defect;

  constructor(defect) {
    this.#defect = defect;
  }

  advanceTime(milliseconds) {
    this.#clock += milliseconds;
  }

  restart() {
    this.#open();
    const restarted = new ConformanceMemoryRepository(this.#defect);
    restarted.#clock = this.#clock;
    restarted.#inbox = cloneMap(this.#inbox);
    restarted.#outbox = cloneMap(this.#outbox);
    restarted.#snapshot =
      this.#snapshot === undefined
        ? undefined
        : structuredClone(this.#snapshot);
    restarted.#journal = structuredClone(this.#journal);
    restarted.#transitions = new Map(this.#transitions);
    this.close();
    return restarted;
  }

  async receive({ scope, envelope }) {
    this.#open();
    const digest = await computeMeshDurableValueDigest(envelope);
    const existing = this.#inbox.get(envelope.messageId);
    if (existing) {
      if (this.#defect === "inbox_conflict") {
        return {
          accepted: true,
          duplicate: true,
          receivedAt: this.#at(),
          envelopeDigest: digest,
        };
      }
      return existing.envelopeDigest === digest
        ? {
            accepted: true,
            duplicate: true,
            receivedAt: existing.receivedAt,
            envelopeDigest: digest,
          }
        : { accepted: false, code: "message_conflict" };
    }
    if (this.#defect !== "inbox_commit") {
      this.#inbox.set(envelope.messageId, {
        schemaVersion: 2,
        scope: Object.freeze({ ...scope }),
        messageId: envelope.messageId,
        envelope,
        envelopeDigest: digest,
        status: "pending",
        attempts: 0,
        receivedAt: this.#at(),
        availableAt: this.#at(),
      });
    }
    return {
      accepted: true,
      duplicate: false,
      receivedAt: this.#at(),
      envelopeDigest: digest,
    };
  }

  async loadSnapshot() {
    this.#open();
    return this.#snapshot;
  }

  async claimInbox({ workerId, limit, leaseDurationMs }) {
    this.#open();
    const result = [];
    for (const [messageId, record] of [...this.#inbox].sort()) {
      if (result.length >= limit) break;
      if (
        record.status !== "pending" &&
        !(
          record.status === "processing" &&
          record.claim.expiresAtMs <= this.#clock
        )
      ) {
        continue;
      }
      const generation = (record.claim?.generation ?? 0) + 1;
      const claim = Object.freeze({
        workerId,
        leaseToken: `${workerId}-${generation}`,
        generation,
        expiresAt: this.#at(this.#clock + leaseDurationMs),
        expiresAtMs: this.#clock + leaseDurationMs,
      });
      const updated = Object.freeze({
        ...record,
        status: "processing",
        attempts: record.attempts + 1,
        claim,
      });
      this.#inbox.set(messageId, updated);
      result.push(publicRecord(updated));
    }
    return Object.freeze(result);
  }

  async commitInboxTransition(input) {
    this.#open();
    const stored = this.#inbox.get(input.inbox.messageId);
    if (
      this.#defect !== "stale_claim" &&
      (!stored ||
        stored.status !== "processing" ||
        stored.claim.leaseToken !== input.inbox.claim?.leaseToken ||
        stored.claim.generation !== input.inbox.claim?.generation ||
        stored.claim.expiresAtMs <= this.#clock)
    ) {
      return { committed: false, code: "claim_lost" };
    }
    if ((this.#snapshot?.revision ?? 0) !== input.expectedSnapshotRevision) {
      return { committed: false, code: "revision_conflict" };
    }
    const previousTransition = this.#transitions.get(input.transitionId);
    if (previousTransition && previousTransition !== input.inbox.messageId) {
      return { committed: false, code: "transition_conflict" };
    }
    for (const draft of input.outbox) {
      const existing = this.#outbox.get(draft.effectId);
      if (existing && existing.messageId !== draft.envelope.messageId) {
        if (this.#defect === "atomic_transition") {
          this.#snapshot = await this.#makeSnapshot(
            input.nextState,
            input.expectedSnapshotRevision + 1,
            input.nextStateDescriptor,
          );
        }
        return { committed: false, code: "outbox_conflict" };
      }
    }
    const snapshot =
      input.outcome === "applied"
        ? await this.#makeSnapshot(
            input.nextState,
            input.expectedSnapshotRevision + 1,
            input.nextStateDescriptor,
          )
        : undefined;
    const journal = [];
    let previousDigest =
      this.#journal.at(-1)?.digest ?? MESH_DURABLE_GENESIS_DIGEST;
    for (const draft of input.journal) {
      const entry = await createMeshDurableJournalEntry({
        scope: input.inbox.scope,
        sequence: this.#journal.length + journal.length + 1,
        previousDigest,
        transitionId: input.transitionId,
        inboxMessageId: input.inbox.messageId,
        snapshotRevision: snapshot?.revision ?? this.#snapshot?.revision ?? 0,
        snapshotDigest:
          snapshot?.stateDigest ??
          this.#snapshot?.stateDigest ??
          MESH_DURABLE_GENESIS_DIGEST,
        draft,
        occurredAt: this.#at(),
      });
      journal.push(entry);
      previousDigest = entry.digest;
    }
    const outbox = [];
    for (const draft of input.outbox) {
      const record = Object.freeze({
        schemaVersion: 2,
        scope: input.inbox.scope,
        ...draft,
        messageId: draft.envelope.messageId,
        envelopeDigest: await computeMeshDurableValueDigest(draft.envelope),
        status: "pending",
        attempts: 0,
        availableAt: this.#at(),
        createdAt: this.#at(),
      });
      this.#outbox.set(draft.effectId, record);
      outbox.push(record);
    }
    if (snapshot) this.#snapshot = snapshot;
    this.#journal.push(...journal);
    this.#transitions.set(input.transitionId, input.inbox.messageId);
    this.#inbox.set(
      input.inbox.messageId,
      Object.freeze({
        ...stored,
        status: input.outcome === "applied" ? "applied" : "rejected",
        claim: undefined,
      }),
    );
    return {
      committed: true,
      ...(snapshot ? { snapshot } : {}),
      journal,
      outbox,
    };
  }

  async abandonInbox({ inbox, retryAfterMs }) {
    const stored = this.#inbox.get(inbox.messageId);
    if (!stored || stored.claim?.leaseToken !== inbox.claim?.leaseToken)
      return false;
    this.#inbox.set(
      inbox.messageId,
      Object.freeze({
        ...stored,
        status: "pending",
        claim: undefined,
        availableAtMs: this.#clock + retryAfterMs,
      }),
    );
    return true;
  }

  async claimOutbox({ workerId, limit, leaseDurationMs }) {
    const result = [];
    for (const [effectId, record] of this.#outbox) {
      if (result.length >= limit) break;
      if (record.status !== "pending") continue;
      const claim = Object.freeze({
        workerId,
        leaseToken: `${workerId}-1`,
        generation: 1,
        expiresAt: this.#at(this.#clock + leaseDurationMs),
      });
      const updated = Object.freeze({
        ...record,
        status: "delivering",
        attempts: 1,
        claim,
      });
      this.#outbox.set(effectId, updated);
      result.push(updated);
    }
    return Object.freeze(result);
  }

  async settleOutbox({ outbox }) {
    const stored = this.#outbox.get(outbox.effectId);
    if (stored?.claim?.leaseToken !== outbox.claim?.leaseToken) return false;
    this.#outbox.set(
      outbox.effectId,
      Object.freeze({ ...stored, status: "delivered", claim: undefined }),
    );
    return true;
  }

  async inspectJournal({ afterSequence = 0, limit }) {
    const entries = this.#journal
      .filter((entry) => entry.sequence > afterSequence)
      .slice(0, limit);
    if (this.#defect === "journal_chain" && entries.length > 1) {
      const broken = structuredClone(entries);
      broken[1].previousDigest = MESH_DURABLE_GENESIS_DIGEST;
      return broken;
    }
    return Object.freeze(entries);
  }

  close() {
    this.#closed = true;
  }

  async #makeSnapshot(state, revision, descriptor) {
    return Object.freeze({
      schemaVersion: 2,
      scope: durabilityScope,
      revision,
      state: structuredClone(state),
      stateDigest: await computeMeshDurableValueDigest(state),
      snapshotFormat: descriptor?.format ?? "application/json",
      snapshotSchemaVersion: descriptor?.schemaVersion ?? 0,
      committedAt: this.#at(),
    });
  }

  #at(milliseconds = this.#clock) {
    return new Date(Date.UTC(2026, 7, 1) + milliseconds).toISOString();
  }

  #open() {
    if (this.#closed) throw new Error("repository closed");
  }
}

function cloneMap(input) {
  return new Map(
    [...input].map(([key, value]) => [key, structuredClone(value)]),
  );
}

function publicRecord(record) {
  const {
    expiresAtMs: _recordExpiry,
    availableAtMs: _available,
    ...copy
  } = record;
  if (copy.claim) {
    const { expiresAtMs: _claimExpiry, ...claim } = copy.claim;
    copy.claim = Object.freeze(claim);
  }
  return Object.freeze(copy);
}

function roomsFactory(defect) {
  return async (scenario) => {
    let sinkApplications = 0;
    let sequence = 0;
    const idempotency =
      defect === "no_idempotency"
        ? {
            claim({ idempotencyKey, workerId }) {
              return {
                status: "claimed",
                claim: {
                  idempotencyKey,
                  workerId,
                  leaseToken: `token-${++sequence}`,
                  generation: sequence,
                  expiresAt: Date.now() + 60_000,
                },
              };
            },
            complete() {
              return true;
            },
            abandon() {
              return true;
            },
          }
        : createMemoryRoomMeshIdempotencyRepository({
            clock: () => 1_000,
            tokenSource: () => `token-${++sequence}`,
          });
    const projection = roomProjection();
    const bridge = createRoomMeshBridge({
      bridgeId: "bridge-conformance",
      workerId: "worker-conformance",
      idempotency,
      sink: {
        async apply() {
          sinkApplications += 1;
          if (scenario === "retry" && sinkApplications === 1) {
            throw new Error("injected failure");
          }
          return { applied: true };
        },
      },
    });
    return {
      bridge,
      projection,
      reproject: () => structuredClone(projection),
      sinkApplications: () => sinkApplications,
    };
  };
}

function roomProjection() {
  return {
    schemaVersion: 1,
    kind: "room.message",
    idempotencyKey: `room-mesh:sha256:${"A".repeat(43)}`,
    tenantId: "tenant-a",
    roomId: "room-a",
    taskId: "task-a",
    source: {
      meshId: "mesh-a",
      messageId: "MMMMMMMMMMMMMMMMMMMMMA",
      messageType: "work.progress",
      senderPeerId: "peer-a",
      objectiveId: "objective-a",
      workItemId: "work-a",
      assignmentEpoch: 1,
      assignmentAuthorityId: "award-a",
      fencingToken: "award-a",
    },
    input: {
      id: "message-a",
      role: "agent",
      content: "Progress fixture",
      metadata: { bridgeId: "bridge-conformance" },
    },
  };
}

async function runReference(capabilities = allCapabilities) {
  const fixtures = await protocolFixtures();
  const protocol = await runMeshProtocolConformance({
    declaredCapabilities: capabilities,
    factory: () => protocolFactory(),
    fixtures,
  });
  const transport = await runMeshTransportConformance({
    declaredCapabilities: capabilities,
    factory: transportFactory(),
    signedEnvelopeBytes: fixtures.v1EnvelopeBytes,
  });
  const durability = await runMeshDurabilityConformance({
    declaredCapabilities: capabilities,
    factory: durabilityFactory(),
    allowDestructiveTests: true,
  });
  const rooms = await runMeshRoomsConformance({
    declaredCapabilities: capabilities,
    factory: roomsFactory(),
    allowDestructiveTests: true,
  });
  return [...protocol, ...transport, ...durability, ...rooms];
}

test("reference implementations pass every declared conformance case", async () => {
  const cases = await runReference();
  assert.equal(cases.length, MESH_CONFORMANCE_CASES.length);
  assert.equal(
    cases.every((entry) => entry.outcome === "passed"),
    true,
    JSON.stringify(cases.filter((entry) => entry.outcome !== "passed")),
  );

  const report = createMeshConformanceReport({
    conformanceVersion: "0.3.0-beta.1",
    suiteDigest: `sha256:${"a".repeat(64)}`,
    fixtureManifestDigest: `sha256:${"b".repeat(64)}`,
    implementation: { name: "agentplat-reference", version: "0.3.0-beta.1" },
    declaredCapabilities: allCapabilities,
    seed: 24_601,
    startedAt: "2026-08-01T00:00:00.000Z",
    endedAt: "2026-08-01T00:00:01.000Z",
    environment: { runtime: "node", architecture: "test" },
    cases,
  });
  assert.equal(report.verdict, "passed");
  assert.equal(report.counts.passed, MESH_CONFORMANCE_CASES.length);
  assert.deepEqual(validateMeshConformanceReport(report), report);
});

test("undeclared optional capabilities are not_declared and cannot fake a pass", async () => {
  const required = [
    "protocol.v0.read",
    "protocol.v1.read",
    "protocol.v1.write",
    "protocol.canonical",
  ];
  const cases = await runReference(required);
  assert.equal(
    cases.filter((entry) => entry.outcome === "not_declared").length,
    MESH_CONFORMANCE_CASES.filter((entry) => !entry.required).length,
  );
  assert.equal(
    cases.filter((entry) => entry.outcome === "passed").length,
    MESH_CONFORMANCE_CASES.filter((entry) => entry.required).length,
  );
});

test("closed reports reject unknown fields, secrets and inconsistent counts", async () => {
  const cases = await runReference();
  const input = {
    conformanceVersion: "0.3.0-beta.1",
    suiteDigest: `sha256:${"a".repeat(64)}`,
    fixtureManifestDigest: `sha256:${"b".repeat(64)}`,
    implementation: { name: "reference", version: "0.3.0-beta.1" },
    declaredCapabilities: allCapabilities,
    seed: 1,
    startedAt: "2026-08-01T00:00:00Z",
    endedAt: "2026-08-01T00:00:01Z",
    cases,
  };
  const report = createMeshConformanceReport(input);
  assert.throws(
    () => createMeshConformanceReport({ ...input, unexpected: true }),
    /exact shape/u,
  );
  assert.throws(
    () => validateMeshConformanceReport({ ...report, payload: "forbidden" }),
    /exact shape/u,
  );
  assert.throws(
    () =>
      createMeshConformanceReport({
        ...input,
        environment: { api_token: "x" },
      }),
    /key is forbidden/u,
  );
  assert.throws(
    () =>
      validateMeshConformanceReport({
        ...report,
        counts: { ...report.counts, passed: 0 },
      }),
    /aggregate is inconsistent/u,
  );
});

test("negative implementations fail the intended sensitivity cases", async () => {
  const fixtures = await protocolFixtures();
  for (const [defect, caseId] of [
    ["accept_unknown", "protocol.unknown.reject"],
    ["relabel_after_sign", "protocol.version.signature_binding"],
  ]) {
    const results = await runMeshProtocolConformance({
      declaredCapabilities: allCapabilities,
      factory: () => protocolFactory(defect),
      fixtures,
    });
    assert.equal(
      results.find((entry) => entry.caseId === caseId).outcome,
      "failed",
    );
  }

  for (const [defect, caseId] of [
    ["retry_bytes", "transport.retry.exact_bytes"],
    ["follow_redirect", "transport.redirect.refused"],
  ]) {
    const results = await runMeshTransportConformance({
      declaredCapabilities: allCapabilities,
      factory: transportFactory(defect),
      signedEnvelopeBytes: fixtures.v1EnvelopeBytes,
    });
    assert.equal(
      results.find((entry) => entry.caseId === caseId).outcome,
      "failed",
    );
  }

  for (const [defect, caseId] of [
    ["inbox_commit", "durability.inbox.commit_receipt"],
    ["inbox_conflict", "durability.inbox.conflict"],
    ["atomic_transition", "durability.transition.atomic"],
    ["stale_claim", "durability.claim.stale_fenced"],
    ["journal_chain", "durability.journal.chain"],
    ["snapshot_migration", "durability.snapshot.migration"],
  ]) {
    const results = await runMeshDurabilityConformance({
      declaredCapabilities: allCapabilities,
      factory: durabilityFactory(defect),
      allowDestructiveTests: true,
    });
    assert.equal(
      results.find((entry) => entry.caseId === caseId).outcome,
      "failed",
    );
  }

  const rooms = await runMeshRoomsConformance({
    declaredCapabilities: allCapabilities,
    factory: roomsFactory("no_idempotency"),
    allowDestructiveTests: true,
  });
  assert.equal(
    rooms.find((entry) => entry.caseId === "rooms.projection.duplicate")
      .outcome,
    "failed",
  );
});

test("timeouts abort the case and still complete bounded cleanup", async () => {
  const fixtures = await protocolFixtures();
  const baseAdapter = await protocolFactory();
  let cleanupCount = 0;
  const observedSeeds = [];
  const results = await runMeshProtocolConformance({
    declaredCapabilities: [
      "protocol.v0.read",
      "protocol.v1.read",
      "protocol.v1.write",
      "protocol.canonical",
    ],
    timeoutMs: 50,
    seed: 24_601,
    totalTimeoutMs: 1_000,
    cleanupTimeoutMs: 20,
    factory: (context) => {
      assert.equal(Object.isFrozen(context), true);
      assert.equal(context.signal instanceof AbortSignal, true);
      observedSeeds.push(context.seed);
      const adapter = baseAdapter;
      return {
        ...adapter,
        parse(bytes, acceptedWireVersions) {
          const candidate = JSON.parse(new TextDecoder().decode(bytes));
          if (candidate.wireVersion === 0) return new Promise(() => {});
          return adapter.parse(bytes, acceptedWireVersions);
        },
        cleanup() {
          cleanupCount += 1;
        },
      };
    },
    fixtures,
  });
  const timedOut = results.find(
    (entry) => entry.caseId === "protocol.v0.parse",
  );
  assert.equal(timedOut.outcome, "failed");
  assert.equal(timedOut.reasonCode, "timeout");
  assert.equal(cleanupCount, 6);
  assert.deepEqual(observedSeeds, Array(6).fill(24_601));
});

test("abort and cleanup failures have distinct bounded outcomes", async () => {
  const fixtures = await protocolFixtures();
  const capabilities = [
    "protocol.v0.read",
    "protocol.v1.read",
    "protocol.v1.write",
    "protocol.canonical",
  ];
  const controller = new AbortController();
  controller.abort();
  const aborted = await runMeshProtocolConformance({
    declaredCapabilities: capabilities,
    signal: controller.signal,
    factory: () => protocolFactory(),
    fixtures,
  });
  assert.equal(
    aborted
      .filter((entry) => entry.outcome !== "not_declared")
      .every(
        (entry) => entry.outcome === "failed" && entry.reasonCode === "aborted",
      ),
    true,
  );

  const baseAdapter = await protocolFactory();
  const cleanupFailed = await runMeshProtocolConformance({
    declaredCapabilities: capabilities,
    timeoutMs: 50,
    totalTimeoutMs: 1_000,
    cleanupTimeoutMs: 10,
    factory: () => ({
      ...baseAdapter,
      cleanup: () => new Promise(() => {}),
    }),
    fixtures,
  });
  assert.equal(
    cleanupFailed
      .filter((entry) => entry.outcome !== "not_declared")
      .every(
        (entry) =>
          entry.outcome === "failed" && entry.reasonCode === "cleanup_failed",
      ),
    true,
  );

  const timeoutAndCleanupFailed = await runMeshProtocolConformance({
    declaredCapabilities: capabilities,
    timeoutMs: 20,
    totalTimeoutMs: 1_000,
    cleanupTimeoutMs: 10,
    factory: () => ({
      ...baseAdapter,
      parse: () => new Promise(() => {}),
      cleanup: () => new Promise(() => {}),
    }),
    fixtures,
  });
  assert.equal(timeoutAndCleanupFailed[0].reasonCode, "timeout_cleanup_failed");
});
