import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  DEFAULT_COLLECTIVE_STATISTICAL_CAMPAIGN_ARTIFACT_STREAM_LIMITS_V1,
  digestCollectiveStatisticalCampaignArtifactV1,
  verifyCollectiveStatisticalCampaignArtifactStreamV1,
} from "../packages/mesh-sim/dist/index.js";

const encoder = new TextEncoder();

function fixture() {
  const values = {
    "artifact:a": { schemaVersion: 1, value: "a" },
    "artifact:b": { schemaVersion: 1, value: "b" },
  };
  const bytes = Object.fromEntries(
    Object.entries(values).map(([artifactId, value]) => [
      artifactId,
      encoder.encode(JSON.stringify(value)),
    ]),
  );
  const artifacts = Object.entries(values).map(([artifactId, value]) => ({
    schemaVersion: 1,
    artifactId,
    kind: "policy",
    path: `artifacts/${artifactId.slice(-1)}.json`,
    byteLength: bytes[artifactId].byteLength,
    sha256: createHash("sha256").update(bytes[artifactId]).digest("hex"),
    canonicalDigest: digestCollectiveStatisticalCampaignArtifactV1(
      "policy",
      value,
    ),
  }));
  return { artifacts, bytes };
}

function reader(bytes, listed = Object.keys(bytes)) {
  return {
    schemaVersion: 1,
    async listArtifactIdsV1() {
      return listed;
    },
    async *openArtifactV1(artifactId) {
      const value = bytes[artifactId];
      if (!value) return;
      const split = Math.max(1, Math.floor(value.byteLength / 2));
      yield value.slice(0, split);
      yield value.slice(split);
    },
  };
}

test("stream verification closes, hashes and visits artifacts in ASCII order", async () => {
  const value = fixture();
  const visited = [];
  const result = await verifyCollectiveStatisticalCampaignArtifactStreamV1({
    schemaVersion: 1,
    artifacts: [...value.artifacts].reverse(),
    reader: reader(value.bytes, ["artifact:b", "artifact:a"]),
    visitArtifactV1(artifact) {
      visited.push([artifact.index.artifactId, artifact.value.value]);
    },
  });
  assert.deepEqual(result.orderedArtifactIds, ["artifact:a", "artifact:b"]);
  assert.deepEqual(visited, [
    ["artifact:a", "a"],
    ["artifact:b", "b"],
  ]);
  assert.equal(
    result.totalBytes,
    Object.values(value.bytes).reduce(
      (sum, bytes) => sum + bytes.byteLength,
      0,
    ),
  );
});

test("stream verification rejects missing, extra, truncated and substituted bytes", async () => {
  const value = fixture();
  await assert.rejects(
    verifyCollectiveStatisticalCampaignArtifactStreamV1({
      schemaVersion: 1,
      artifacts: value.artifacts,
      reader: reader(value.bytes, ["artifact:a"]),
    }),
    /exact_index_closure/u,
  );
  await assert.rejects(
    verifyCollectiveStatisticalCampaignArtifactStreamV1({
      schemaVersion: 1,
      artifacts: value.artifacts,
      reader: reader(value.bytes, ["artifact:a", "artifact:b", "artifact:c"]),
    }),
    /exact_index_closure/u,
  );
  const truncated = {
    ...value.bytes,
    "artifact:a": value.bytes["artifact:a"].slice(1),
  };
  await assert.rejects(
    verifyCollectiveStatisticalCampaignArtifactStreamV1({
      schemaVersion: 1,
      artifacts: value.artifacts,
      reader: reader(truncated),
    }),
    /byte_length/u,
  );
  const substituted = {
    ...value.bytes,
    "artifact:a": encoder.encode(
      JSON.stringify({ schemaVersion: 1, value: "x" }),
    ),
  };
  await assert.rejects(
    verifyCollectiveStatisticalCampaignArtifactStreamV1({
      schemaVersion: 1,
      artifacts: value.artifacts,
      reader: reader(substituted),
    }),
    /sha256_mismatch/u,
  );
});

test("stream verification enforces per-artifact and total limits before visiting", async () => {
  const value = fixture();
  let visits = 0;
  await assert.rejects(
    verifyCollectiveStatisticalCampaignArtifactStreamV1({
      schemaVersion: 1,
      artifacts: value.artifacts,
      reader: reader(value.bytes),
      limits: {
        maximumArtifactBytes: value.artifacts[0].byteLength,
        maximumTotalBytes: value.artifacts[0].byteLength,
      },
      visitArtifactV1() {
        visits += 1;
      },
    }),
    /total_byte_limit/u,
  );
  assert.equal(visits, 1);
  await assert.rejects(
    verifyCollectiveStatisticalCampaignArtifactStreamV1({
      schemaVersion: 1,
      artifacts: value.artifacts,
      reader: reader(value.bytes),
      limits: { maximumArtifactBytes: 1 },
    }),
    /byteLength_is_invalid/u,
  );
});

test("stream limits are hard caps and hostile index or chunk streams fail closed", async () => {
  const value = fixture();
  await assert.rejects(
    verifyCollectiveStatisticalCampaignArtifactStreamV1({
      schemaVersion: 1,
      artifacts: value.artifacts,
      reader: reader(value.bytes),
      limits: {
        maximumArtifactBytes:
          DEFAULT_COLLECTIVE_STATISTICAL_CAMPAIGN_ARTIFACT_STREAM_LIMITS_V1.maximumArtifactBytes +
          1,
      },
    }),
    /maximumArtifactBytes_is_invalid/u,
  );
  await assert.rejects(
    verifyCollectiveStatisticalCampaignArtifactStreamV1({
      schemaVersion: 1,
      artifacts: value.artifacts,
      reader: {
        ...reader(value.bytes),
        async listArtifactIdsV1() {
          return new Set(Object.keys(value.bytes));
        },
      },
    }),
    /reader_index_is_invalid/u,
  );
  const hostileList = ["artifact:a", "artifact:b"];
  Object.defineProperty(hostileList, Symbol.iterator, {
    value: function* () {
      while (true) yield "artifact:a";
    },
  });
  await assert.rejects(
    verifyCollectiveStatisticalCampaignArtifactStreamV1({
      schemaVersion: 1,
      artifacts: value.artifacts,
      reader: reader(value.bytes, hostileList),
    }),
    /reader_index_is_invalid/u,
  );
  const hostileArtifacts = value.artifacts.slice();
  Object.defineProperty(hostileArtifacts, Symbol.iterator, {
    value: function* () {
      while (true) yield value.artifacts[0];
    },
  });
  await assert.rejects(
    verifyCollectiveStatisticalCampaignArtifactStreamV1({
      schemaVersion: 1,
      artifacts: hostileArtifacts,
      reader: reader(value.bytes),
    }),
    /stream_index_is_invalid/u,
  );
  let lengthReads = 0;
  const changingLength = new Proxy(value.artifacts.slice(), {
    get(target, property, receiver) {
      if (property === "length") {
        lengthReads += 1;
        return lengthReads === 1 ? target.length : Number.POSITIVE_INFINITY;
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const bounded = await verifyCollectiveStatisticalCampaignArtifactStreamV1({
    schemaVersion: 1,
    artifacts: changingLength,
    reader: reader(value.bytes),
  });
  assert.equal(bounded.artifactCount, 2);
  assert.equal(lengthReads, 0);
  const oversizedLength = new Proxy(value.artifacts.slice(), {
    getOwnPropertyDescriptor(target, property) {
      if (property === "length")
        return {
          value: Number.MAX_SAFE_INTEGER,
          writable: true,
          enumerable: false,
          configurable: false,
        };
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  });
  await assert.rejects(
    verifyCollectiveStatisticalCampaignArtifactStreamV1({
      schemaVersion: 1,
      artifacts: oversizedLength,
      reader: reader(value.bytes),
    }),
    /stream_index_is_invalid/u,
  );
  await assert.rejects(
    verifyCollectiveStatisticalCampaignArtifactStreamV1({
      schemaVersion: 1,
      artifacts: value.artifacts,
      reader: {
        ...reader(value.bytes),
        async *openArtifactV1(artifactId) {
          yield new Uint8Array(0);
          yield value.bytes[artifactId];
        },
      },
    }),
    /chunk_is_invalid/u,
  );
});
