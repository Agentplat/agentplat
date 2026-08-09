import assert from "node:assert/strict";
import test from "node:test";

import {
  DistributedCollectiveProtocolRuntimeV1,
  InMemoryDistributedCollectiveArtifactStoreV1,
  InMemoryDistributedCollectiveProtocolStoreV1,
} from "../dist/distributed-collective-protocol.js";

const hex = (character) => `sha256:${character.repeat(64)}`;
const overlay = (character) => `sha256:${character.repeat(43)}`;

function protocolFixture(overrides = {}) {
  let failPublish = true;
  let publishes = 0;
  const runtime = new DistributedCollectiveProtocolRuntimeV1({
    protocolId: "protocol:reconcile",
    scopeDigest: hex("1"),
    membershipConfigurationDigest: hex("2"),
    localPeerId: "peer:local",
    localInstanceId: "instance:local",
    plane: {
      async publish() {
        publishes += 1;
        if (failPublish) throw new Error("simulated crash after journal");
        return { update: { updateDigest: overlay("A") } };
      },
    },
    artifacts: new InMemoryDistributedCollectiveArtifactStoreV1(),
    authenticity: {
      localKeyId: "key:local",
      async sign(messageDigest) {
        return `signed:${messageDigest}`;
      },
      async verify(input) {
        return input.signature === `signed:${input.messageDigest}`;
      },
    },
    membership: { async verifyPeer() { return true; } },
    store: new InMemoryDistributedCollectiveProtocolStoreV1(),
    crypto: globalThis.crypto,
    ...overrides,
  });
  return {
    runtime,
    allowPublish() { failPublish = false; },
    publishes: () => publishes,
  };
}

test("a journaled publish is reconciled without allocating a new sequence", async () => {
  const fixture = protocolFixture();
  await fixture.runtime.initialize(0);
  const first = {
    cycleId: "cycle:one",
    streamId: "stream:one",
    kind: "mission.signal",
    payload: { signal: "first" },
    logicalTimeMs: 10,
    lifetime: 100,
    commandBindingDigest: hex("a"),
  };
  await assert.rejects(fixture.runtime.publish(first), /simulated crash/);
  const recovered = await fixture.runtime.reconcilePublish(first);
  assert.ok(recovered);
  assert.equal(recovered.sequence, 1);
  assert.equal(fixture.publishes(), 1);

  fixture.allowPublish();
  const later = await fixture.runtime.publish({
    ...first,
    payload: { signal: "later" },
    logicalTimeMs: 11,
    commandBindingDigest: hex("b"),
  });
  assert.equal(later.sequence, 2);
  const recoveredBehindHead = await fixture.runtime.reconcilePublish(first);
  assert.equal(recoveredBehindHead?.messageDigest, recovered.messageDigest);
  assert.equal(recoveredBehindHead?.sequence, 1);
});

test("a reused command binding with different publication content fails closed", async () => {
  const fixture = protocolFixture();
  await fixture.runtime.initialize(0);
  const original = {
    cycleId: "cycle:one",
    streamId: "stream:one",
    kind: "mission.signal",
    payload: { signal: "original" },
    logicalTimeMs: 10,
    lifetime: 100,
    commandBindingDigest: hex("c"),
  };
  await assert.rejects(fixture.runtime.publish(original), /simulated crash/);
  await assert.rejects(
    fixture.runtime.reconcilePublish({
      ...original,
      payload: { signal: "caller-authored-result" },
    }),
    /binding mismatch/,
  );
  await assert.rejects(
    fixture.runtime.publish({
      ...original,
      payload: { signal: "caller-authored-result" },
    }),
    /binding mismatch/,
  );
});

test("an unacknowledged command publication survives accepted/outbox compaction", async () => {
  const fixture = protocolFixture({
    maximumRetainedReferences: 16,
    maximumOutboxRecords: 2,
  });
  await fixture.runtime.initialize(0);
  const protectedPublish = {
    cycleId: "cycle:protected",
    streamId: "stream:protected",
    kind: "mission.signal",
    payload: { signal: "protected" },
    logicalTimeMs: 10,
    lifetime: 1_000,
    commandBindingDigest: hex("d"),
  };
  await assert.rejects(
    fixture.runtime.publish(protectedPublish),
    /simulated crash/,
  );
  fixture.allowPublish();
  await fixture.runtime.flushOutbox(10);
  for (let index = 0; index < 24; index += 1) {
    await fixture.runtime.publish({
      cycleId: "cycle:protected",
      streamId: "stream:protected",
      kind: "mission.signal",
      payload: { signal: `later:${index}` },
      logicalTimeMs: 11 + index,
      lifetime: 1_000,
    });
  }
  const recovered = await fixture.runtime.reconcilePublish(protectedPublish);
  assert.equal(recovered?.sequence, 1);
  assert.equal(
    await fixture.runtime.acknowledgePublishCommand(hex("d")),
    true,
  );
});

test("an expired unacknowledged command keeps a durable reconciliation tombstone", async () => {
  const fixture = protocolFixture();
  await fixture.runtime.initialize(0);
  const input = {
    cycleId: "cycle:expired",
    streamId: "stream:expired",
    kind: "mission.signal",
    payload: { signal: "expired" },
    logicalTimeMs: 10,
    lifetime: 1,
    commandBindingDigest: hex("e"),
  };
  await assert.rejects(fixture.runtime.publish(input), /simulated crash/);
  assert.equal(await fixture.runtime.flushOutbox(11), 0);
  const state = await fixture.runtime.load();
  assert.equal(state.outbox[0]?.status, "expired");
  assert.equal((await fixture.runtime.reconcilePublish(input))?.sequence, 1);
});
