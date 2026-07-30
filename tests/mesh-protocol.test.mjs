import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  canonicalizeMeshJson,
  canonicalizeMeshJsonBytes,
  canonicalizeMeshPayload,
  canonicalizeMeshSigningDocument,
  createMeshSigningDocument,
  parseMeshJson,
  parseSignedMeshEnvelope,
  validateMeshEnvelopeContext,
  validateSignedMeshEnvelope,
} from '@agentplat/mesh-protocol';

const fixtureUrl = (name) =>
  new URL(
    `../packages/mesh-protocol/fixtures/v0/${name}.json`,
    import.meta.url
  );

const utf8Encoder = new TextEncoder();
const loadFixtureText = (name) => readFile(fixtureUrl(name), 'utf8');
const loadFixtureBytes = (name) => readFile(fixtureUrl(name));

const loadFixture = async (name) => JSON.parse(await loadFixtureText(name));

test('Work Progress, Checkpoint and Result fixtures enforce the wire boundary', async () => {
  const fixtures = await Promise.all(
    ['work-progress', 'work-checkpoint', 'work-result'].map(async (name) => [
      name,
      await loadFixture(name),
    ])
  );
  for (const [name, fixture] of fixtures) {
    const parsed = parseSignedMeshEnvelope(await loadFixtureBytes(name));
    assert.equal(parsed.ok, true, `${name} wire bytes`);
    assert.equal(Object.isFrozen(parsed.value), true);
    assert.equal(Object.isFrozen(parsed.value.payload), true);
    assert.equal(validateSignedMeshEnvelope(fixture).ok, true);
  }
  const progress = fixtures.find(([name]) => name === 'work-progress')[1];
  const checkpoint = fixtures.find(([name]) => name === 'work-checkpoint')[1];
  const result = fixtures.find(([name]) => name === 'work-result')[1];

  for (const fixture of [progress, checkpoint, result]) {
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        audience: { kind: 'mesh', topic: 'work' },
      }),
      'invalid_audience',
      '$["audience"]'
    );
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        payload: { ...fixture.payload, assigneePeerId: 'peer-other' },
      }),
      'invalid_payload',
      '$["payload"]["assigneePeerId"]'
    );
    const { causationId: _causationId, ...withoutCausation } = fixture;
    expectIssue(
      validateSignedMeshEnvelope(withoutCausation),
      'invalid_payload',
      '$["causationId"]'
    );
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        objectiveId: 'objective-other',
      }),
      'invalid_payload',
      '$["objectiveId"]'
    );
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        expiresAt: new Date(
          Date.parse(fixture.sentAt) + 5 * 60 * 1000 + 1
        ).toISOString(),
      }),
      'invalid_lifetime',
      '$["expiresAt"]'
    );
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        payload: { ...fixture.payload, unexpected: true },
      }),
      'invalid_payload',
      '$["payload"]["unexpected"]'
    );
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        payload: {
          ...fixture.payload,
          fencingToken: 'different-authority',
        },
      }),
      'invalid_payload',
      '$["payload"]["fencingToken"]'
    );
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        payload: {
          ...fixture.payload,
          leaseExpiresAt: fixture.sentAt,
        },
      }),
      'invalid_payload',
      '$["payload"]["leaseExpiresAt"]'
    );
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        expiresAt: new Date(
          Date.parse(fixture.sentAt) + 60 * 1000
        ).toISOString(),
        payload: {
          ...fixture.payload,
          leaseExpiresAt: new Date(
            Date.parse(fixture.sentAt) + 30 * 1000
          ).toISOString(),
        },
      }),
      'invalid_lifetime',
      '$["expiresAt"]'
    );
  }

  expectIssue(
    validateSignedMeshEnvelope({
      ...progress,
      payload: { ...progress.payload, progressSummary: 'x'.repeat(4097) },
    }),
    'invalid_payload',
    '$["payload"]["progressSummary"]'
  );
  for (const payload of [
    { checkpointSummary: 'x', checkpointReference: 'reference-a' },
    { checkpointSequence: 2 },
    { checkpointSequence: 2, previousCheckpointId: 'checkpoint-a' },
    { previousCheckpointId: 'checkpoint-earlier' },
    { checkpointDigest: 'sha256:not-canonical' },
  ]) {
    expectIssue(
      validateSignedMeshEnvelope({
        ...checkpoint,
        payload: { ...checkpoint.payload, ...payload },
      }),
      'invalid_payload'
    );
  }
  const { checkpointSummary: _checkpointSummary, ...checkpointWithoutSummary } =
    checkpoint.payload;
  expectIssue(
    validateSignedMeshEnvelope({
      ...checkpoint,
      payload: checkpointWithoutSummary,
    }),
    'invalid_payload',
    '$["payload"]'
  );
  assert.equal(
    validateSignedMeshEnvelope({
      ...checkpoint,
      payload: {
        ...checkpointWithoutSummary,
        checkpointReference: 'https://content.example/checkpoint-a',
      },
    }).ok,
    true
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...result,
      payload: {
        ...result.payload,
        resultSummary: 'x',
        resultReference: 'reference-a',
      },
    }),
    'invalid_payload',
    '$["payload"]'
  );
  const { resultSummary: _resultSummary, ...resultWithoutContent } =
    result.payload;
  expectIssue(
    validateSignedMeshEnvelope({
      ...result,
      payload: resultWithoutContent,
    }),
    'invalid_payload',
    '$["payload"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...result,
      payload: { ...result.payload, resultDigest: 'sha256:not-canonical' },
    }),
    'invalid_payload',
    '$["payload"]["resultDigest"]'
  );
  assert.equal(
    validateSignedMeshEnvelope({
      ...result,
      payload: {
        ...resultWithoutContent,
        resultReference: 'https://content.example/result-a',
      },
    }).ok,
    true
  );
});

function expectIssue(result, code, path) {
  assert.equal(result.ok, false);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].code, code);
  if (path !== undefined) assert.equal(result.issues[0].path, path);
}

test('Alpha 2 Work Release and Cancel fixtures are closed direct records', async () => {
  const fixtures = await Promise.all(
    ['work-release', 'work-cancel'].map(async (name) => [
      name,
      await loadFixture(name),
    ])
  );
  for (const [name, fixture] of fixtures) {
    const parsed = parseSignedMeshEnvelope(await loadFixtureBytes(name));
    assert.equal(parsed.ok, true, `${name} wire bytes`);
    assert.equal(Object.isFrozen(parsed.value), true);
    assert.equal(Object.isFrozen(parsed.value.payload), true);
    assert.equal(validateSignedMeshEnvelope(fixture).ok, true);
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        audience: { kind: 'mesh', topic: 'work' },
      }),
      'invalid_audience',
      '$["audience"]'
    );
    const { causationId: _causationId, ...withoutCausation } = fixture;
    expectIssue(
      validateSignedMeshEnvelope(withoutCausation),
      'invalid_payload',
      '$["causationId"]'
    );
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        objectiveId: 'objective-other',
      }),
      'invalid_payload',
      '$["objectiveId"]'
    );
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        expiresAt: new Date(
          Date.parse(fixture.sentAt) + 2 * 60 * 1000 + 1
        ).toISOString(),
      }),
      'invalid_lifetime',
      '$["expiresAt"]'
    );
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        payload: { ...fixture.payload, unexpected: true },
      }),
      'invalid_payload',
      '$["payload"]["unexpected"]'
    );
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        payload: { ...fixture.payload, fencingToken: 'different-authority' },
      }),
      'invalid_payload',
      '$["payload"]["fencingToken"]'
    );
  }
  const release = fixtures.find(([name]) => name === 'work-release')[1];
  const cancel = fixtures.find(([name]) => name === 'work-cancel')[1];
  const { acceptanceId: _acceptanceId, ...pendingCancelPayload } =
    cancel.payload;
  assert.equal(
    validateSignedMeshEnvelope({
      ...release,
      sender: { peerId: 'peer-b', instanceId: 'instance-b' },
      audience: { kind: 'peer', peerId: 'peer-a' },
      payload: {
        ...release.payload,
        releaseAuthority: 'owner',
        releaseDisposition: 'close',
        leaseExpiresAt: '2026-07-30T00:10:02.999Z',
      },
    }).ok,
    true,
    'owner release is not structurally lease-bound'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...release,
      payload: { ...release.payload, releaseAuthority: 'other' },
    }),
    'invalid_payload',
    '$["payload"]["releaseAuthority"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...release,
      payload: { ...release.payload, releaseDisposition: 'other' },
    }),
    'invalid_payload',
    '$["payload"]["releaseDisposition"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...release,
      sender: { peerId: 'peer-b', instanceId: 'instance-b' },
    }),
    'invalid_payload',
    '$["payload"]["assigneePeerId"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...release,
      expiresAt: new Date(Date.parse(release.sentAt) + 60 * 1000).toISOString(),
      payload: {
        ...release.payload,
        leaseExpiresAt: new Date(
          Date.parse(release.sentAt) + 30 * 1000
        ).toISOString(),
      },
    }),
    'invalid_lifetime',
    '$["expiresAt"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...release,
      payload: {
        ...release.payload,
        leaseExpiresAt: release.sentAt,
      },
    }),
    'invalid_payload',
    '$["payload"]["leaseExpiresAt"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...release,
      payload: {
        ...release.payload,
        releaseAuthority: 'owner',
      },
    }),
    'invalid_payload',
    '$["payload"]["ownerPeerId"]'
  );
  assert.equal(
    validateSignedMeshEnvelope({
      ...cancel,
      payload: {
        ...pendingCancelPayload,
        assignmentState: 'award_pending',
      },
    }).ok,
    true,
    'pending cancellation omits acceptance'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...cancel,
      payload: { ...cancel.payload, assignmentState: 'award_pending' },
    }),
    'invalid_payload'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...cancel,
      payload: {
        ...pendingCancelPayload,
        assignmentState: 'active',
      },
    }),
    'invalid_identifier',
    '$["payload"]["acceptanceId"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...cancel,
      payload: { ...cancel.payload, assignmentState: 'other' },
    }),
    'invalid_payload',
    '$["payload"]["assignmentState"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...cancel,
      sender: { peerId: 'peer-a', instanceId: 'instance-a' },
    }),
    'invalid_payload',
    '$["payload"]["ownerPeerId"]'
  );
  assert.equal(
    validateSignedMeshEnvelope({
      ...cancel,
      payload: {
        ...cancel.payload,
        leaseExpiresAt: new Date(Date.parse(cancel.sentAt) - 1).toISOString(),
      },
    }).ok,
    true,
    'owner cancellation is not structurally lease-bound'
  );
});

test('strict JSON parsing rejects ambiguous and malformed documents', () => {
  for (const input of [
    '',
    '{"a":1,}',
    '{"a":1} trailing',
    '{"a":/* comment */1}',
    '{"a":01}',
    '{"a":1e400}',
    '\ufeff{}',
  ]) {
    expectIssue(parseMeshJson(input), 'invalid_json');
  }

  expectIssue(
    parseMeshJson('{"type":1,"\\u0074ype":2}'),
    'duplicate_object_key',
    '$["type"]'
  );
  expectIssue(parseMeshJson('"\\ud800"'), 'invalid_json', '$');
  expectIssue(
    parseMeshJson(Uint8Array.from([0x22, 0xc3, 0x28, 0x22])),
    'invalid_json',
    '$'
  );
  expectIssue(
    parseSignedMeshEnvelope(
      Uint8Array.from([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x3a, 0x31, 0x7d])
    ),
    'invalid_json',
    '$'
  );
  expectIssue(
    parseMeshJson(Uint8Array.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])),
    'invalid_json',
    '$'
  );
});

test('strict JSON limits are enforced at their exact boundaries', () => {
  const encoded = utf8Encoder.encode('{"value":"é"}');
  assert.equal(
    parseMeshJson(encoded, {
      limits: { maximumEnvelopeBytes: encoded.byteLength },
    }).ok,
    true
  );
  expectIssue(
    parseMeshJson(encoded, {
      limits: { maximumEnvelopeBytes: encoded.byteLength - 1 },
    }),
    'structural_limit_exceeded',
    '$'
  );

  assert.equal(
    parseMeshJson('"é"', { limits: { maximumStringBytes: 2 } }).ok,
    true
  );
  expectIssue(
    parseMeshJson('"é"', { limits: { maximumStringBytes: 1 } }),
    'structural_limit_exceeded',
    '$'
  );

  assert.equal(
    parseMeshJson('{"a":1,"b":2}', {
      limits: { maximumObjectKeys: 2, maximumTotalObjectKeys: 2 },
    }).ok,
    true
  );
  expectIssue(
    parseMeshJson('{"a":1,"b":2}', {
      limits: { maximumObjectKeys: 1 },
    }),
    'structural_limit_exceeded',
    '$["b"]'
  );

  assert.equal(
    parseMeshJson('[[0]]', { limits: { maximumNestingDepth: 2 } }).ok,
    true
  );
  expectIssue(
    parseMeshJson('[[0]]', { limits: { maximumNestingDepth: 1 } }),
    'structural_limit_exceeded',
    '$[0]'
  );

  assert.equal(
    parseMeshJson('[0,1]', {
      limits: { maximumArrayItems: 2, maximumTotalArrayItems: 2 },
    }).ok,
    true
  );
  expectIssue(
    parseMeshJson('[0,1]', { limits: { maximumArrayItems: 1 } }),
    'structural_limit_exceeded',
    '$[1]'
  );
  expectIssue(
    parseMeshJson('[0,not-json]', {
      limits: { maximumArrayItems: 1 },
    }),
    'structural_limit_exceeded',
    '$[1]'
  );

  assert.equal(
    parseMeshJson('{"a":{"b":1}}', {
      limits: { maximumTotalObjectKeys: 2 },
    }).ok,
    true
  );
  expectIssue(
    parseMeshJson('{"a":{"b":1}}', {
      limits: { maximumObjectKeys: 2, maximumTotalObjectKeys: 1 },
    }),
    'structural_limit_exceeded',
    '$["a"]["b"]'
  );
  assert.equal(
    parseMeshJson('[[],[]]', {
      limits: { maximumTotalArrayItems: 2 },
    }).ok,
    true
  );
  expectIssue(
    parseMeshJson('[[],[]]', {
      limits: { maximumArrayItems: 2, maximumTotalArrayItems: 1 },
    }),
    'structural_limit_exceeded',
    '$[1]'
  );
});

test('canonical JSON is deterministic and rejects non-I-JSON values', () => {
  const vector = {
    numbers: [333333333.33333329, 1e30, 4.5, 2e-3, 1e-27],
    string: '€$\u000f\nA\'B"\\\\"/',
    literals: [null, true, false],
  };
  const result = canonicalizeMeshJson(vector);
  assert.equal(result.ok, true);
  assert.equal(
    result.value,
    '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}'
  );

  assert.equal(
    canonicalizeMeshJson({ '\r': 1, a: 2, z: 3 }).value,
    '{"\\r":1,"a":2,"z":3}'
  );
  assert.equal(
    canonicalizeMeshJson({
      '\u20ac': 'Euro Sign',
      '\r': 'Carriage Return',
      '\ufb33': 'Hebrew Letter Dalet With Dagesh',
      1: 'One',
      '\ud83d\ude00': 'Emoji: Grinning Face',
      '\u0080': 'Control',
      '\u00f6': 'Latin Small Letter O With Diaeresis',
    }).value,
    '{"\\r":"Carriage Return","1":"One","\u0080":"Control","ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign","😀":"Emoji: Grinning Face","דּ":"Hebrew Letter Dalet With Dagesh"}'
  );
  assert.equal(canonicalizeMeshJson(-0).value, '0');
  assert.notEqual(
    canonicalizeMeshJson('\u00e9').value,
    canonicalizeMeshJson('e\u0301').value
  );

  const cyclic = {};
  cyclic.self = cyclic;
  for (const value of [
    cyclic,
    undefined,
    1n,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    [, 1],
    { value: undefined },
  ]) {
    expectIssue(canonicalizeMeshJson(value), 'invalid_json_value');
  }

  const hidden = {};
  Object.defineProperty(hidden, 'secret', { value: 1 });
  expectIssue(canonicalizeMeshJson(hidden), 'invalid_json_value', '$');

  const accessor = {};
  Object.defineProperty(accessor, 'value', {
    enumerable: true,
    get() {
      throw new Error('canonicalization must not invoke accessors');
    },
  });
  expectIssue(
    canonicalizeMeshJson(accessor),
    'invalid_json_value',
    '$["value"]'
  );

  const accessorArray = [];
  Object.defineProperty(accessorArray, 0, {
    enumerable: true,
    get() {
      throw new Error('canonicalization must not invoke accessors');
    },
  });
  expectIssue(
    canonicalizeMeshJson(accessorArray),
    'invalid_json_value',
    '$[0]'
  );

  const extendedArray = [1];
  extendedArray.extra = true;
  expectIssue(canonicalizeMeshJson(extendedArray), 'invalid_json_value', '$');
  assert.equal(canonicalizeMeshJson(Object.freeze([1])).value, '[1]');
});

test('the three Alpha 1 conformance fixtures validate and are deeply frozen', async () => {
  for (const name of ['peer-hello', 'peer-ping', 'peer-ping-ack']) {
    const result = parseSignedMeshEnvelope(await loadFixtureBytes(name));
    assert.equal(result.ok, true, name);
    assert.equal(Object.isFrozen(result.value), true);
    assert.equal(Object.isFrozen(result.value.sender), true);
    assert.equal(Object.isFrozen(result.value.payload), true);
    assert.equal(Object.isFrozen(result.value.proof), true);
  }
});

test('Alpha 2 discovery and capability fixtures are closed, bounded wire records', async () => {
  const fixtures = await Promise.all(
    [
      'peer-card',
      'peer-goodbye',
      'capability-advertise',
      'capability-withdraw',
    ].map(async (name) => [name, await loadFixture(name)])
  );

  for (const [name, fixture] of fixtures) {
    const result = validateSignedMeshEnvelope(fixture);
    assert.equal(result.ok, true, name);
    assert.equal(
      parseSignedMeshEnvelope(await loadFixtureBytes(name)).ok,
      true,
      `${name} wire bytes`
    );
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        payload: { ...fixture.payload, unexpected: true },
      }),
      'invalid_payload',
      '$["payload"]["unexpected"]'
    );
  }

  const card = fixtures.find(([name]) => name === 'peer-card')[1];
  const goodbye = fixtures.find(([name]) => name === 'peer-goodbye')[1];
  const advertise = fixtures.find(
    ([name]) => name === 'capability-advertise'
  )[1];
  const withdraw = fixtures.find(([name]) => name === 'capability-withdraw')[1];

  for (const fixture of [card, goodbye]) {
    expectIssue(
      validateSignedMeshEnvelope({ ...fixture, objectiveId: 'objective-a' }),
      'invalid_payload',
      '$["objectiveId"]'
    );
  }
  assert.equal(
    validateSignedMeshEnvelope({ ...advertise, objectiveId: 'objective-a' }).ok,
    true
  );
  assert.equal(
    validateSignedMeshEnvelope({ ...withdraw, objectiveId: 'objective-a' }).ok,
    true
  );
  for (const fixture of [goodbye, withdraw]) {
    const { causationId: _causationId, ...withoutCausation } = fixture;
    expectIssue(
      validateSignedMeshEnvelope(withoutCausation),
      'invalid_payload',
      '$["causationId"]'
    );
  }

  expectIssue(
    validateSignedMeshEnvelope({
      ...card,
      payload: { ...card.payload, transportHints: [1] },
    }),
    'invalid_payload',
    '$["payload"]["transportHints"][0]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...card,
      payload: { ...card.payload, previousPeerCardId: 'card-prior' },
    }),
    'invalid_payload',
    '$["payload"]["previousPeerCardId"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...card,
      payload: { ...card.payload, cardRevision: 2 },
    }),
    'invalid_payload',
    '$["payload"]["previousPeerCardId"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...advertise,
      payload: {
        ...advertise.payload,
        previousAdvertisementId: 'advertisement-prior',
      },
    }),
    'invalid_payload',
    '$["payload"]["previousAdvertisementId"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...advertise,
      payload: { ...advertise.payload, capabilityRevision: 2 },
    }),
    'invalid_payload',
    '$["payload"]["previousAdvertisementId"]'
  );

  for (const fixture of [card, goodbye, advertise, withdraw]) {
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        expiresAt:
          fixture.type === 'peer.goodbye'
            ? '2026-07-30T00:01:00.000000001Z'
            : '2026-07-30T00:02:00.000000001Z',
      }),
      'invalid_lifetime',
      '$["expiresAt"]'
    );
  }
});

test('Alpha 2 Objective fixtures are closed, bounded and deeply frozen wire records', async () => {
  const fixtures = await Promise.all(
    ['objective-announce', 'objective-revise', 'objective-cancel'].map(
      async (name) => [name, await loadFixture(name)]
    )
  );

  for (const [name, fixture] of fixtures) {
    const parsed = parseSignedMeshEnvelope(await loadFixtureBytes(name));
    assert.equal(parsed.ok, true, `${name} wire bytes`);
    assert.equal(Object.isFrozen(parsed.value), true);
    assert.equal(Object.isFrozen(parsed.value.payload), true);
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        payload: { ...fixture.payload, unexpected: true },
      }),
      'invalid_payload',
      '$["payload"]["unexpected"]'
    );
  }

  const announce = fixtures.find(([name]) => name === 'objective-announce')[1];
  const revise = fixtures.find(([name]) => name === 'objective-revise')[1];
  const cancel = fixtures.find(([name]) => name === 'objective-cancel')[1];
  assert.equal(validateSignedMeshEnvelope(announce).ok, true);
  assert.equal(validateSignedMeshEnvelope(revise).ok, true);
  assert.equal(validateSignedMeshEnvelope(cancel).ok, true);

  for (const fixture of [announce, revise, cancel]) {
    const { objectiveId: _objectiveId, ...withoutObjectiveId } = fixture;
    expectIssue(
      validateSignedMeshEnvelope(withoutObjectiveId),
      'invalid_payload',
      '$["objectiveId"]'
    );
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        objectiveId: 'objective-other',
      }),
      'invalid_payload',
      '$["objectiveId"]'
    );
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        audience: { kind: 'mesh', topic: 'work' },
      }),
      'invalid_audience',
      '$["audience"]["topic"]'
    );
  }
  assert.equal(
    validateSignedMeshEnvelope({
      ...announce,
      audience: { kind: 'peer', peerId: 'peer-b' },
    }).ok,
    true
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...announce,
      sender: { ...announce.sender, peerId: 'peer-b' },
    }),
    'invalid_payload',
    '$["payload"]["issuerPeerId"]'
  );

  for (const fixture of [revise, cancel]) {
    const { causationId: _causationId, ...withoutCausation } = fixture;
    expectIssue(
      validateSignedMeshEnvelope(withoutCausation),
      'invalid_payload',
      '$["causationId"]'
    );
  }
  expectIssue(
    validateSignedMeshEnvelope({
      ...announce,
      causationId: 'PPPPPPPPPPPPPPPPPPPPPA',
    }),
    'invalid_payload',
    '$["causationId"]'
  );
  for (const [fixture, expiry] of [
    [announce, '2026-07-30T00:05:00.000000001Z'],
    [revise, '2026-07-30T00:05:00.000000001Z'],
    [cancel, '2026-07-30T00:02:00.000000001Z'],
  ]) {
    expectIssue(
      validateSignedMeshEnvelope({ ...fixture, expiresAt: expiry }),
      'invalid_lifetime',
      '$["expiresAt"]'
    );
  }
});

test('Alpha 2 Objective contracts fail closed at frozen boundaries', async () => {
  const announce = await loadFixture('objective-announce');
  const revise = await loadFixture('objective-revise');
  const cancel = await loadFixture('objective-cancel');
  const expectPayloadIssue = (fixture, payload, path) =>
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        payload: { ...fixture.payload, ...payload },
      }),
      'invalid_payload',
      path
    );

  for (const [payload, path] of [
    [{ summary: 'summary', contentReference: 'content-a' }, '$["payload"]'],
    [{ summary: 'x'.repeat(4_097) }, '$["payload"]["summary"]'],
    [{ successCriteria: [] }, '$["payload"]["successCriteria"]'],
    [
      { successCriteria: ['x'.repeat(4_097)] },
      '$["payload"]["successCriteria"][0]',
    ],
    [
      { successCriteria: Array.from({ length: 33 }, () => 'criterion') },
      '$["payload"]["successCriteria"]',
    ],
    [
      { permittedCapabilityKeys: [] },
      '$["payload"]["permittedCapabilityKeys"]',
    ],
    [
      { permittedCapabilityKeys: ['z', 'a'] },
      '$["payload"]["permittedCapabilityKeys"][1]',
    ],
    [{ maximumWorkItems: 1_000_001 }, '$["payload"]["maximumWorkItems"]'],
    [
      { maximumConcurrentAssignments: 11 },
      '$["payload"]["maximumConcurrentAssignments"]',
    ],
    [{ maximumBudgetUnits: -1 }, '$["payload"]["maximumBudgetUnits"]'],
    [
      { maximumBudgetUnits: Number.MAX_SAFE_INTEGER + 1 },
      '$["payload"]["maximumBudgetUnits"]',
    ],
    [{ bidWindowMs: 3_600_001 }, '$["payload"]["bidWindowMs"]'],
    [{ acceptanceWindowMs: 900_001 }, '$["payload"]["acceptanceWindowMs"]'],
    [
      { maximumLeaseDurationMs: 86_400_001 },
      '$["payload"]["maximumLeaseDurationMs"]',
    ],
    [{ recoveryGraceMs: 3_600_001 }, '$["payload"]["recoveryGraceMs"]'],
    [{ maximumLeaseRenewals: 101 }, '$["payload"]["maximumLeaseRenewals"]'],
    [
      { recoveryWitnessPeerIds: ['peer-b', 'peer-c'] },
      '$["payload"]["recoveryWitnessPeerIds"]',
    ],
    [
      { recoveryWitnessPeerIds: ['peer-d', 'peer-c', 'peer-b'] },
      '$["payload"]["recoveryWitnessPeerIds"][1]',
    ],
    [
      { recoveryWitnessThreshold: 1 },
      '$["payload"]["recoveryWitnessThreshold"]',
    ],
    [
      { recoveryWitnessThreshold: 4 },
      '$["payload"]["recoveryWitnessThreshold"]',
    ],
    [
      {
        authorizedObserverPeerIds: Array.from(
          { length: 33 },
          (_, index) => `peer-${index}`
        ),
      },
      '$["payload"]["authorizedObserverPeerIds"]',
    ],
    [
      { authorizedObserverPeerIds: ['peer-z', 'peer-a'] },
      '$["payload"]["authorizedObserverPeerIds"][1]',
    ],
    [
      { validUntil: '2026-08-29T00:00:00.000000001Z' },
      '$["payload"]["validUntil"]',
    ],
  ]) {
    expectPayloadIssue(announce, payload, path);
  }

  assert.equal(
    validateSignedMeshEnvelope({
      ...announce,
      payload: {
        ...announce.payload,
        maximumBudgetUnits: 0,
        maximumLeaseRenewals: 0,
      },
    }).ok,
    true
  );
  assert.equal(
    validateSignedMeshEnvelope({
      ...cancel,
      payload: { ...cancel.payload, objectiveRevision: 1 },
    }).ok,
    true
  );
  assert.equal(
    validateSignedMeshEnvelope({
      ...announce,
      payload: (() => {
        const { summary: _summary, ...withoutSummary } = announce.payload;
        return { ...withoutSummary, contentReference: 'x'.repeat(4_096) };
      })(),
    }).ok,
    true
  );
  {
    const { summary: _summary, ...withoutSummary } = announce.payload;
    expectIssue(
      validateSignedMeshEnvelope({
        ...announce,
        payload: { ...withoutSummary, contentReference: 'x'.repeat(4_097) },
      }),
      'invalid_payload',
      '$["payload"]["contentReference"]'
    );
  }
  assert.equal(
    validateSignedMeshEnvelope({
      ...announce,
      payload: (() => {
        const { summary: _summary, ...withoutSummary } = announce.payload;
        return { ...withoutSummary, contentReference: 'content-a' };
      })(),
    }).ok,
    true
  );
  {
    const { summary: _summary, ...withoutSummary } = announce.payload;
    expectIssue(
      validateSignedMeshEnvelope({ ...announce, payload: withoutSummary }),
      'invalid_payload',
      '$["payload"]'
    );
  }
  expectPayloadIssue(
    announce,
    { objectiveRevision: 2 },
    '$["payload"]["objectiveRevision"]'
  );
  {
    const { previousObjectiveDocumentId: _previous, ...withoutPrevious } =
      revise.payload;
    expectIssue(
      validateSignedMeshEnvelope({ ...revise, payload: withoutPrevious }),
      'invalid_payload',
      '$["payload"]["previousObjectiveDocumentId"]'
    );
  }
  expectIssue(
    validateSignedMeshEnvelope({
      ...announce,
      payload: {
        ...announce.payload,
        validUntil: '2026-07-30T00:00:59.999Z',
      },
    }),
    'invalid_payload',
    '$["payload"]["bidWindowMs"]'
  );
  expectPayloadIssue(
    revise,
    { objectiveRevision: 1 },
    '$["payload"]["objectiveRevision"]'
  );
  expectPayloadIssue(
    revise,
    { previousObjectiveDocumentId: revise.payload.objectiveDocumentId },
    '$["payload"]["previousObjectiveDocumentId"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...cancel,
      payload: { ...cancel.payload, objectiveDocumentId: '' },
    }),
    'invalid_identifier',
    '$["payload"]["objectiveDocumentId"]'
  );
});

test('Alpha 2 Work Offer and Bid fixtures are closed, bounded and deeply frozen wire records', async () => {
  const fixtures = await Promise.all(
    ['work-offer', 'work-bid'].map(async (name) => [
      name,
      await loadFixture(name),
    ])
  );
  for (const [name, fixture] of fixtures) {
    const parsed = parseSignedMeshEnvelope(await loadFixtureBytes(name));
    assert.equal(parsed.ok, true, `${name} wire bytes`);
    assert.equal(Object.isFrozen(parsed.value), true);
    assert.equal(Object.isFrozen(parsed.value.payload), true);
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        payload: { ...fixture.payload, unexpected: true },
      }),
      'invalid_payload',
      '$["payload"]["unexpected"]'
    );
  }

  const offer = fixtures.find(([name]) => name === 'work-offer')[1];
  const bid = fixtures.find(([name]) => name === 'work-bid')[1];
  assert.equal(validateSignedMeshEnvelope(offer).ok, true);
  assert.equal(validateSignedMeshEnvelope(bid).ok, true);
  assert.equal(
    validateSignedMeshEnvelope({
      ...offer,
      audience: { kind: 'mesh', topic: 'work' },
    }).ok,
    true
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...offer,
      audience: { kind: 'mesh', topic: 'objective' },
    }),
    'invalid_audience',
    '$["audience"]["topic"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...bid,
      audience: { kind: 'mesh', topic: 'work' },
    }),
    'invalid_audience',
    '$["audience"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...bid,
      audience: { kind: 'peer', peerId: 'peer-other' },
    }),
    'invalid_audience',
    '$["audience"]["peerId"]'
  );
  for (const [fixture, boundPeer, path] of [
    [offer, 'ownerPeerId', '$["payload"]["ownerPeerId"]'],
    [bid, 'bidderPeerId', '$["payload"]["bidderPeerId"]'],
  ]) {
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        payload: { ...fixture.payload, [boundPeer]: 'peer-other' },
      }),
      'invalid_payload',
      path
    );
  }
});

test('Alpha 2 Work Offer and Bid contracts fail closed at frozen boundaries', async () => {
  const offer = await loadFixture('work-offer');
  const bid = await loadFixture('work-bid');
  const offerIssue = (payload, path) =>
    expectIssue(
      validateSignedMeshEnvelope({
        ...offer,
        payload: { ...offer.payload, ...payload },
      }),
      'invalid_payload',
      path
    );
  const bidIssue = (payload, path) =>
    expectIssue(
      validateSignedMeshEnvelope({
        ...bid,
        payload: { ...bid.payload, ...payload },
      }),
      'invalid_payload',
      path
    );

  for (const [payload, path] of [
    [{ requiredCapabilityKeys: [] }, '$["payload"]["requiredCapabilityKeys"]'],
    [
      { requiredCapabilityKeys: ['z', 'a'] },
      '$["payload"]["requiredCapabilityKeys"][1]',
    ],
    [
      { matchingAttributes: { empty: '' } },
      '$["payload"]["matchingAttributes"]["empty"]',
    ],
    [{ inputSummary: 'x'.repeat(4097) }, '$["payload"]["inputSummary"]'],
    [
      { completionCriteria: Array.from({ length: 33 }, () => 'criterion') },
      '$["payload"]["completionCriteria"]',
    ],
    [{ budgetReservationUnits: -1 }, '$["payload"]["budgetReservationUnits"]'],
    [{ ownerEpoch: 2 }, '$["payload"]["ownerEpoch"]'],
    [{ offerAttempt: 2 }, '$["payload"]["previousOfferId"]'],
    [{ previousOfferId: 'offer-prior' }, '$["payload"]["previousOfferId"]'],
    [
      { previousOfferId: 'offer-a', offerAttempt: 2 },
      '$["payload"]["previousOfferId"]',
    ],
    [
      { bidDeadline: '2026-07-30T00:00:00.000Z' },
      '$["payload"]["bidDeadline"]',
    ],
    [
      { workDeadline: '2026-07-30T00:01:00.000Z' },
      '$["payload"]["workDeadline"]',
    ],
    [
      {
        bidDeadline: '2026-07-30T01:00:00.000000001Z',
        workDeadline: '2026-08-29T00:00:00.000Z',
      },
      '$["payload"]["bidDeadline"]',
    ],
    [
      { workDeadline: '2026-08-29T00:00:00.000000001Z' },
      '$["payload"]["workDeadline"]',
    ],
  ])
    offerIssue(payload, path);

  const { inputSummary: _summary, ...offerWithoutInput } = offer.payload;
  expectIssue(
    validateSignedMeshEnvelope({ ...offer, payload: offerWithoutInput }),
    'invalid_payload',
    '$["payload"]'
  );
  offerIssue({ inputReference: 'input-a' }, '$["payload"]');
  expectIssue(
    validateSignedMeshEnvelope({
      ...offer,
      expiresAt: '2026-07-30T00:01:00.000000001Z',
    }),
    'invalid_lifetime',
    '$["expiresAt"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({ ...offer, objectiveId: 'objective-other' }),
    'invalid_payload',
    '$["objectiveId"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...offer,
      causationId: 'PPPPPPPPPPPPPPPPPPPPPA',
    }),
    'invalid_payload',
    '$["causationId"]'
  );
  assert.equal(
    validateSignedMeshEnvelope({
      ...offer,
      causationId: 'PPPPPPPPPPPPPPPPPPPPPA',
      payload: {
        ...offer.payload,
        offerId: 'offer-b',
        offerAttempt: 2,
        previousOfferId: 'offer-a',
      },
    }).ok,
    true
  );

  for (const [payload, path] of [
    [{ bidRevision: 2 }, '$["payload"]["previousBidId"]'],
    [{ previousBidId: 'bid-prior' }, '$["payload"]["previousBidId"]'],
    [
      { bidRevision: 2, previousBidId: 'bid-a' },
      '$["payload"]["previousBidId"]',
    ],
    [
      { capacityReservationUnits: 0 },
      '$["payload"]["capacityReservationUnits"]',
    ],
    [
      { capacityReservationUnits: 1_000_001 },
      '$["payload"]["capacityReservationUnits"]',
    ],
    [{ budgetUnits: -1 }, '$["payload"]["budgetUnits"]'],
    [
      { assumptions: Array.from({ length: 33 }, () => 'assumption') },
      '$["payload"]["assumptions"]',
    ],
    [
      { bidExpiresAt: '2026-07-30T00:00:01.000Z' },
      '$["payload"]["bidExpiresAt"]',
    ],
    [
      { expectedCompletionAt: '2026-07-30T00:01:00.000Z' },
      '$["payload"]["expectedCompletionAt"]',
    ],
    [
      { expectedCompletionAt: '2026-07-30T01:00:00.000000001Z' },
      '$["payload"]["expectedCompletionAt"]',
    ],
  ])
    bidIssue(payload, path);
  {
    const { causationId: _causation, ...withoutCausation } = bid;
    expectIssue(
      validateSignedMeshEnvelope(withoutCausation),
      'invalid_payload',
      '$["causationId"]'
    );
  }
  expectIssue(
    validateSignedMeshEnvelope({
      ...bid,
      expiresAt: '2026-07-30T00:00:30.000000001Z',
    }),
    'invalid_lifetime',
    '$["expiresAt"]'
  );
  assert.equal(
    validateSignedMeshEnvelope({
      ...bid,
      messageId: 'CCCCCCCCCCCCCCCCCCCCCA',
      payload: { ...bid.payload },
    }).ok,
    true,
    'distinct recipient envelopes can name one stable offer ID'
  );
});

test('Alpha 2 Work Award and responses are closed, direct and deeply frozen', async () => {
  const fixtures = await Promise.all(
    ['work-award', 'work-accept', 'work-decline'].map(async (name) => [
      name,
      await loadFixture(name),
    ])
  );
  for (const [name, fixture] of fixtures) {
    const parsed = parseSignedMeshEnvelope(await loadFixtureBytes(name));
    assert.equal(parsed.ok, true, `${name} wire bytes`);
    assert.equal(Object.isFrozen(parsed.value), true);
    assert.equal(Object.isFrozen(parsed.value.payload), true);
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        payload: { ...fixture.payload, unexpected: true },
      }),
      'invalid_payload',
      '$["payload"]["unexpected"]'
    );
  }
  const award = fixtures.find(([name]) => name === 'work-award')[1];
  const accept = fixtures.find(([name]) => name === 'work-accept')[1];
  const decline = fixtures.find(([name]) => name === 'work-decline')[1];
  for (const fixture of [award, accept, decline]) {
    assert.equal(validateSignedMeshEnvelope(fixture).ok, true);
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        audience: { kind: 'mesh', topic: 'work' },
      }),
      'invalid_audience',
      '$["audience"]'
    );
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        objectiveId: 'objective-other',
      }),
      'invalid_payload',
      '$["objectiveId"]'
    );
  }
  for (const [fixture, field, value] of [
    [award, 'ownerPeerId', 'peer-a'],
    [accept, 'assigneePeerId', 'peer-b'],
    [decline, 'assigneePeerId', 'peer-b'],
  ]) {
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        payload: { ...fixture.payload, [field]: value },
      }),
      'invalid_payload',
      `$["payload"]["${field}"]`
    );
  }
  for (const fixture of [accept, decline]) {
    if (fixture === decline) {
      expectIssue(
        validateSignedMeshEnvelope({
          ...fixture,
          audience: { kind: 'peer', peerId: 'peer-other' },
        }),
        'invalid_audience',
        '$["audience"]["peerId"]'
      );
    }
    const { causationId: _causationId, ...withoutCausation } = fixture;
    expectIssue(
      validateSignedMeshEnvelope(withoutCausation),
      'invalid_payload',
      '$["causationId"]'
    );
    assert.equal(
      validateSignedMeshEnvelope({
        ...fixture,
        causationId: 'BBBBBBBBBBBBBBBBBBBBBA',
      }).ok,
      true,
      `${fixture.type} defers accepted Award causation to local state`
    );
  }
  for (const fixture of [award, accept]) {
    assert.equal(
      validateSignedMeshEnvelope({
        ...fixture,
        audience: { kind: 'peer', peerId: 'peer-witness' },
      }).ok,
      true,
      `${fixture.type} permits a direct witness envelope`
    );
  }
  expectIssue(
    validateSignedMeshEnvelope({
      ...decline,
      audience: { kind: 'peer', peerId: 'peer-witness' },
    }),
    'invalid_audience',
    '$["audience"]["peerId"]'
  );
});

test('Alpha 2 Work Award and response boundaries fail closed', async () => {
  const award = await loadFixture('work-award');
  const accept = await loadFixture('work-accept');
  const decline = await loadFixture('work-decline');
  const awardIssue = (payload, path) =>
    expectIssue(
      validateSignedMeshEnvelope({
        ...award,
        payload: { ...award.payload, ...payload },
      }),
      'invalid_payload',
      path
    );
  for (const [payload, path] of [
    [{ bidRevision: 0 }, '$["payload"]["bidRevision"]'],
    [{ ownerEpoch: 2 }, '$["payload"]["ownerEpoch"]'],
    [{ assignmentEpoch: 0 }, '$["payload"]["assignmentEpoch"]'],
    [{ budgetReservationUnits: -1 }, '$["payload"]["budgetReservationUnits"]'],
    [{ authorityKind: 'other' }, '$["payload"]["authorityKind"]'],
    [
      { assignmentAuthorityId: 'other', fencingToken: 'other' },
      '$["payload"]["assignmentAuthorityId"]',
    ],
    [{ fencingToken: 'other' }, '$["payload"]["fencingToken"]'],
    [{ recoveryCertificateId: 'certificate-a' }, '$["payload"]'],
    [
      { leaseStartsAt: '2026-07-30T00:00:01.999999999Z' },
      '$["payload"]["leaseStartsAt"]',
    ],
    [
      { leaseStartsAt: award.payload.acceptanceDeadline },
      '$["payload"]["acceptanceDeadline"]',
    ],
    [
      { acceptanceDeadline: award.payload.leaseStartsAt },
      '$["payload"]["acceptanceDeadline"]',
    ],
    [
      { leaseExpiresAt: '2026-07-30T00:14:59.999999999Z' },
      '$["payload"]["leaseExpiresAt"]',
    ],
    [
      { workDeadline: '2026-07-30T00:29:59.999999999Z' },
      '$["payload"]["workDeadline"]',
    ],
    [
      {
        acceptanceDeadline: '2026-07-30T00:15:02.000000001Z',
      },
      '$["payload"]["acceptanceDeadline"]',
    ],
    [
      {
        leaseExpiresAt: '2026-07-31T00:00:02.000000001Z',
        workDeadline: '2026-07-31T00:00:02.000000001Z',
      },
      '$["payload"]["leaseExpiresAt"]',
    ],
    [
      { workDeadline: '2026-08-29T00:00:02.000000001Z' },
      '$["payload"]["workDeadline"]',
    ],
  ])
    awardIssue(payload, path);
  for (const payload of [
    { leaseExpiresAt: award.payload.acceptanceDeadline },
    { workDeadline: award.payload.leaseExpiresAt },
  ]) {
    assert.equal(
      validateSignedMeshEnvelope({
        ...award,
        payload: { ...award.payload, ...payload },
      }).ok,
      true
    );
  }
  expectIssue(
    validateSignedMeshEnvelope({
      ...award,
      payload: { ...award.payload, awardId: '' },
    }),
    'invalid_identifier',
    '$["payload"]["awardId"]'
  );
  {
    const { causationId: _causationId, ...withoutCausation } = award;
    expectIssue(
      validateSignedMeshEnvelope(withoutCausation),
      'invalid_payload',
      '$["causationId"]'
    );
  }
  expectIssue(
    validateSignedMeshEnvelope({
      ...award,
      expiresAt: award.payload.acceptanceDeadline,
    }),
    'invalid_lifetime',
    '$["expiresAt"]'
  );
  assert.equal(
    validateSignedMeshEnvelope({
      ...award,
      payload: {
        ...award.payload,
        authorityKind: 'recovery_certificate',
        assignmentEpoch: 2,
        assignmentAuthorityId: 'certificate-a',
        fencingToken: 'certificate-a',
        recoveryCertificateId: 'certificate-a',
        resumeCheckpointId: 'checkpoint-a',
      },
    }).ok,
    true
  );
  awardIssue(
    {
      authorityKind: 'recovery_certificate',
      assignmentEpoch: 1,
      assignmentAuthorityId: 'certificate-a',
      fencingToken: 'certificate-a',
      recoveryCertificateId: 'certificate-a',
    },
    '$["payload"]["assignmentEpoch"]'
  );
  {
    const { recoveryCertificateId: _certificateId, ...withoutCertificate } =
      award.payload;
    expectIssue(
      validateSignedMeshEnvelope({
        ...award,
        payload: {
          ...withoutCertificate,
          authorityKind: 'recovery_certificate',
          assignmentEpoch: 2,
          assignmentAuthorityId: 'certificate-a',
          fencingToken: 'certificate-a',
        },
      }),
      'invalid_identifier',
      '$["payload"]["recoveryCertificateId"]'
    );
  }
  for (const fixture of [accept, decline]) {
    const idField =
      fixture.type === 'work.accept' ? 'acceptanceId' : 'declineId';
    for (const [payload, path, code = 'invalid_payload'] of [
      [{ [idField]: '' }, `$["payload"]["${idField}"]`, 'invalid_identifier'],
      [{ ownerEpoch: 2 }, '$["payload"]["ownerEpoch"]'],
      [{ assignmentEpoch: 0 }, '$["payload"]["assignmentEpoch"]'],
      [{ assignmentAuthorityId: 'other' }, '$["payload"]["fencingToken"]'],
      [{ fencingToken: 'other' }, '$["payload"]["fencingToken"]'],
      [
        { acceptanceDeadline: fixture.sentAt },
        '$["payload"]["acceptanceDeadline"]',
      ],
    ]) {
      expectIssue(
        validateSignedMeshEnvelope({
          ...fixture,
          payload: { ...fixture.payload, ...payload },
        }),
        code,
        path
      );
    }
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        expiresAt: fixture.payload.acceptanceDeadline,
      }),
      'invalid_lifetime',
      '$["expiresAt"]'
    );
  }
});

test('Alpha 2 discovery and capability boundaries fail closed', async () => {
  const card = await loadFixture('peer-card');
  const advertise = await loadFixture('capability-advertise');
  const withdraw = await loadFixture('capability-withdraw');
  const expectPayloadIssue = (fixture, payload, path) =>
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        payload: { ...fixture.payload, ...payload },
      }),
      'invalid_payload',
      path
    );

  for (const [fixture, payload, path] of [
    [card, { subjectPeerId: 'peer-b' }, '$["payload"]["subjectPeerId"]'],
    [card, { instanceId: 'instance-b' }, '$["payload"]["instanceId"]'],
    [advertise, { ownerPeerId: 'peer-b' }, '$["payload"]["ownerPeerId"]'],
    [
      card,
      { validUntil: card.payload.validFrom },
      '$["payload"]["validUntil"]',
    ],
    [
      advertise,
      { validUntil: advertise.payload.validFrom },
      '$["payload"]["validUntil"]',
    ],
    [
      card,
      { protocolVersions: Array.from({ length: 9 }, (_, index) => index) },
      '$["payload"]["protocolVersions"]',
    ],
    [card, { protocolVersions: [1, 0] }, '$["payload"]["protocolVersions"][1]'],
    [card, { protocolVersions: [1] }, '$["payload"]["protocolVersions"]'],
    [
      card,
      {
        transportHints: Array.from(
          { length: 9 },
          (_, index) => `https://hint-${index}`
        ),
      },
      '$["payload"]["transportHints"]',
    ],
    [card, { transportHints: ['z', 'a'] }, '$["payload"]["transportHints"][1]'],
    [card, { transportHints: [''] }, '$["payload"]["transportHints"][0]'],
    [
      card,
      { transportHints: ['x'.repeat(2_049)] },
      '$["payload"]["transportHints"][0]',
    ],
    [
      card,
      {
        capabilityIds: Array.from(
          { length: 33 },
          (_, index) => `capability-${index}`
        ),
      },
      '$["payload"]["capabilityIds"]',
    ],
    [
      card,
      { capabilityIds: ['capability-b', 'capability-a'] },
      '$["payload"]["capabilityIds"][1]',
    ],
    [
      advertise,
      {
        inputMediaTypes: Array.from(
          { length: 17 },
          (_, index) => `application/x-${index}`
        ),
      },
      '$["payload"]["inputMediaTypes"]',
    ],
    [
      advertise,
      { outputMediaTypes: ['z', 'a'] },
      '$["payload"]["outputMediaTypes"][1]',
    ],
    [
      advertise,
      { inputMediaTypes: [''] },
      '$["payload"]["inputMediaTypes"][0]',
    ],
    [
      advertise,
      { outputMediaTypes: ['x'.repeat(129)] },
      '$["payload"]["outputMediaTypes"][0]',
    ],
    [
      advertise,
      {
        attributes: Object.fromEntries(
          Array.from({ length: 33 }, (_, index) => [`key-${index}`, 'value'])
        ),
      },
      '$["payload"]["attributes"]',
    ],
    [
      advertise,
      { attributes: { '': 'value' } },
      '$["payload"]["attributes"][""]',
    ],
    [
      advertise,
      { attributes: { key: '' } },
      '$["payload"]["attributes"]["key"]',
    ],
    [
      advertise,
      { attributes: { key: 'x'.repeat(1_025) } },
      '$["payload"]["attributes"]["key"]',
    ],
    [advertise, { capabilityKey: '' }, '$["payload"]["capabilityKey"]'],
    [advertise, { version: '' }, '$["payload"]["version"]'],
  ]) {
    expectPayloadIssue(fixture, payload, path);
  }

  const utf16Ordered = ['\u{10000}', '\uE000'];
  assert.equal(utf16Ordered[0] < utf16Ordered[1], true);
  assert.equal(
    utf16Ordered[0].codePointAt(0) > utf16Ordered[1].codePointAt(0),
    true
  );
  assert.equal(
    validateSignedMeshEnvelope({
      ...card,
      payload: { ...card.payload, transportHints: utf16Ordered },
    }).ok,
    true
  );
  for (const transportHints of [
    [...utf16Ordered].reverse(),
    [utf16Ordered[0], utf16Ordered[0]],
  ]) {
    expectPayloadIssue(
      card,
      { transportHints },
      '$["payload"]["transportHints"][1]'
    );
  }

  for (const [fixture, topic] of [
    [card, 'capability'],
    [advertise, 'membership'],
  ]) {
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        audience: { kind: 'mesh', topic },
      }),
      'invalid_audience',
      '$["audience"]["topic"]'
    );
  }

  const { advertisementId: _advertisementId, ...advertiseWithoutId } =
    advertise.payload;
  expectIssue(
    validateSignedMeshEnvelope({ ...advertise, payload: advertiseWithoutId }),
    'invalid_payload',
    '$["payload"]["advertisementId"]'
  );
  const { causationId: _causationId, ...withdrawWithoutCausation } = withdraw;
  expectIssue(
    validateSignedMeshEnvelope(withdrawWithoutCausation),
    'invalid_payload',
    '$["causationId"]'
  );

  for (const [fixture, revisionKey, predecessorKey, predecessor] of [
    [card, 'cardRevision', 'previousPeerCardId', 'card-prior'],
    [
      advertise,
      'capabilityRevision',
      'previousAdvertisementId',
      'advertisement-prior',
    ],
  ]) {
    assert.equal(
      validateSignedMeshEnvelope({
        ...fixture,
        causationId: 'PPPPPPPPPPPPPPPPPPPPPA',
        payload: {
          ...fixture.payload,
          [revisionKey]: 2,
          [predecessorKey]: predecessor,
        },
      }).ok,
      true
    );
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        payload: {
          ...fixture.payload,
          [revisionKey]: 2,
          [predecessorKey]: predecessor,
        },
      }),
      'invalid_payload',
      '$["causationId"]'
    );
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        causationId: 'PPPPPPPPPPPPPPPPPPPPPA',
        payload: { ...fixture.payload, [revisionKey]: 2 },
      }),
      'invalid_payload',
      `$["payload"]["${predecessorKey}"]`
    );
    expectIssue(
      validateSignedMeshEnvelope({
        ...fixture,
        causationId: 'PPPPPPPPPPPPPPPPPPPPPA',
      }),
      'invalid_payload',
      '$["causationId"]'
    );
  }

  for (const fixture of [card, advertise]) {
    assert.equal(
      validateSignedMeshEnvelope({
        ...fixture,
        payload: {
          ...fixture.payload,
          validUntil: '2026-07-31T00:00:00.000Z',
        },
      }).ok,
      true
    );
    expectPayloadIssue(
      fixture,
      { validUntil: '2026-07-31T00:00:00.000000001Z' },
      '$["payload"]["validUntil"]'
    );
  }

  expectIssue(
    validateSignedMeshEnvelope({
      ...card,
      causationId: 'PPPPPPPPPPPPPPPPPPPPPA',
      payload: {
        ...card.payload,
        cardRevision: 2,
        previousPeerCardId: card.payload.peerCardId,
      },
    }),
    'invalid_payload',
    '$["payload"]["previousPeerCardId"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...advertise,
      causationId: 'PPPPPPPPPPPPPPPPPPPPPA',
      payload: {
        ...advertise.payload,
        capabilityRevision: 2,
        previousAdvertisementId: advertise.payload.advertisementId,
      },
    }),
    'invalid_payload',
    '$["payload"]["previousAdvertisementId"]'
  );
});

test('parsed capability attributes preserve own prototype-named keys', async () => {
  const wire = (await loadFixtureText('capability-advertise')).replace(
    '"attributes": { "language": "en" }',
    '"attributes": { "__proto__": "preserved" }'
  );
  const result = parseSignedMeshEnvelope(utf8Encoder.encode(wire));
  assert.equal(result.ok, true);
  assert.equal(
    Object.hasOwn(result.value.payload.attributes, '__proto__'),
    true
  );
  assert.equal(result.value.payload.attributes.__proto__, 'preserved');
});

test('envelopes and nested protocol objects use closed schemas', async () => {
  const hello = await loadFixture('peer-hello');
  const { payload: _payload, ...helloWithoutPayload } = hello;
  const canonicalHello = canonicalizeMeshJson(hello);
  assert.equal(canonicalHello.ok, true);
  const canonicalHelloBytes = utf8Encoder.encode(
    canonicalHello.value
  ).byteLength;

  assert.equal(
    validateSignedMeshEnvelope(hello, {
      limits: { maximumEnvelopeBytes: canonicalHelloBytes },
    }).ok,
    true
  );
  expectIssue(
    validateSignedMeshEnvelope(hello, {
      limits: { maximumEnvelopeBytes: canonicalHelloBytes - 1 },
    }),
    'structural_limit_exceeded',
    '$'
  );

  expectIssue(
    validateSignedMeshEnvelope({ ...hello, unexpected: true }),
    'unknown_envelope_field',
    '$["unexpected"]'
  );
  const longField = 'x'.repeat(1_024);
  const longFieldResult = validateSignedMeshEnvelope({
    ...hello,
    [longField]: true,
  });
  assert.equal(longFieldResult.ok, false);
  assert.equal(longFieldResult.issues[0].code, 'unknown_envelope_field');
  assert.equal(longFieldResult.issues[0].path.length, 256);
  assert.equal(longFieldResult.issues[0].path.endsWith('...'), true);
  expectIssue(
    validateSignedMeshEnvelope({ ...hello, type: null }),
    'unsupported_message_type',
    '$["type"]'
  );
  expectIssue(
    parseSignedMeshEnvelope(
      utf8Encoder.encode(JSON.stringify(helloWithoutPayload))
    ),
    'invalid_payload',
    '$["payload"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...hello,
      // Reserved families remain unavailable; Alpha 2 makes peer.card valid.
      type: 'peer.digest',
      payload: { type: 'peer.digest' },
    }),
    'unsupported_message_type',
    '$["type"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...hello,
      sender: { ...hello.sender, role: 'coordinator' },
    }),
    'invalid_payload',
    '$["sender"]["role"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...hello,
      audience: { ...hello.audience, peerId: 'peer-b' },
    }),
    'invalid_audience',
    '$["audience"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...hello,
      payload: { ...hello.payload, extra: true },
    }),
    'invalid_payload',
    '$["payload"]["extra"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...hello,
      payload: { ...hello.payload, type: 'peer.ping' },
    }),
    'type_payload_mismatch',
    '$["payload"]["type"]'
  );
});

test('identifiers, binary representations and counters are canonical', async () => {
  const hello = await loadFixture('peer-hello');

  for (const [field, value, code, path] of [
    ['messageId', 'A'.repeat(21) + 'B', 'invalid_message_id', '$["messageId"]'],
    ['messageId', 'A'.repeat(21) + '=', 'invalid_message_id', '$["messageId"]'],
    ['tenantId', 'tenant with spaces', 'invalid_identifier', '$["tenantId"]'],
    [
      'payloadHash',
      `sha256:${'A'.repeat(42)}B`,
      'invalid_payload_hash',
      '$["payloadHash"]',
    ],
  ]) {
    expectIssue(
      validateSignedMeshEnvelope({ ...hello, [field]: value }),
      code,
      path
    );
  }

  expectIssue(
    validateSignedMeshEnvelope({
      ...hello,
      proof: { ...hello.proof, value: `${'A'.repeat(85)}B` },
    }),
    'invalid_proof',
    '$["proof"]["value"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({ ...hello, sequence: 0 }),
    'invalid_sequence',
    '$["sequence"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...hello,
      payload: { ...hello.payload, cardRevision: Number.MAX_SAFE_INTEGER + 1 },
    }),
    'invalid_payload',
    '$["payload"]["cardRevision"]'
  );
});

test('timestamps and message-specific lifetimes are validated precisely', async () => {
  const hello = await loadFixture('peer-hello');
  const ping = await loadFixture('peer-ping');

  assert.equal(
    validateSignedMeshEnvelope({
      ...ping,
      sentAt: '2026-07-30T01:00:00+01:00',
      expiresAt: '2026-07-30T01:00:30+01:00',
    }).ok,
    true
  );
  for (const sentAt of [
    '2026-02-29T00:00:00Z',
    '2026-07-30 00:00:00Z',
    '2026-07-30T00:00:60Z',
    '2026-07-30T00:00:00',
    '2026-07-30t00:00:00z',
    '2026-07-30T00:00:00.1234567890Z',
    '1969-12-31T23:59:59Z',
  ]) {
    expectIssue(
      validateSignedMeshEnvelope({ ...hello, sentAt }),
      'invalid_timestamp',
      '$["sentAt"]'
    );
  }

  expectIssue(
    validateSignedMeshEnvelope({
      ...hello,
      expiresAt: hello.sentAt,
    }),
    'invalid_lifetime',
    '$["expiresAt"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...hello,
      expiresAt: '2026-07-30T00:02:00.000000001Z',
    }),
    'invalid_lifetime',
    '$["expiresAt"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...ping,
      expiresAt: '2026-07-30T00:00:30.000000001Z',
    }),
    'invalid_lifetime',
    '$["expiresAt"]'
  );
});

test('payload size uses exact wire bytes, including internal whitespace', async () => {
  const ping = await loadFixture('peer-ping');
  const payload = '{  "type"  :  "peer.ping"  }';
  const wire = JSON.stringify(ping).replace('{"type":"peer.ping"}', payload);
  const payloadBytes = utf8Encoder.encode(payload).byteLength;

  assert.equal(
    parseSignedMeshEnvelope(utf8Encoder.encode(wire), {
      limits: { maximumPayloadBytes: payloadBytes },
    }).ok,
    true
  );
  expectIssue(
    parseSignedMeshEnvelope(utf8Encoder.encode(wire), {
      limits: { maximumPayloadBytes: payloadBytes - 1 },
    }),
    'structural_limit_exceeded',
    '$["payload"]'
  );
});

test('message families enforce their audience and causation constraints', async () => {
  const hello = await loadFixture('peer-hello');
  const ping = await loadFixture('peer-ping');
  const ack = await loadFixture('peer-ping-ack');

  assert.equal(
    validateSignedMeshEnvelope({
      ...hello,
      audience: { kind: 'peer', peerId: 'peer-b' },
    }).ok,
    true
  );
  assert.equal(
    validateSignedMeshEnvelope({
      ...hello,
      objectiveId: 'objective-a',
    }).ok,
    true
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...hello,
      audience: { kind: 'mesh', topic: 'work' },
    }),
    'invalid_audience',
    '$["audience"]["topic"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...ping,
      audience: { kind: 'mesh', topic: 'membership' },
    }),
    'invalid_audience',
    '$["audience"]'
  );
  expectIssue(
    validateSignedMeshEnvelope({ ...ping, objectiveId: 'objective-a' }),
    'invalid_payload',
    '$["objectiveId"]'
  );
  const { causationId: _causationId, ...ackWithoutCausation } = ack;
  expectIssue(
    validateSignedMeshEnvelope(ackWithoutCausation),
    'invalid_payload',
    '$["causationId"]'
  );
});

test('critical extensions are explicit, bounded and receiver-supported', async () => {
  const ping = await loadFixture('peer-ping');
  const extended = {
    ...ping,
    extensions: { trace: { sampled: true } },
    criticalExtensions: ['trace'],
  };
  const validated = validateSignedMeshEnvelope(extended);
  assert.equal(validated.ok, true);

  const sixteenExtensions = Object.fromEntries(
    Array.from({ length: 16 }, (_, index) => [`extension-${index}`, index])
  );
  assert.equal(
    validateSignedMeshEnvelope({
      ...ping,
      extensions: sixteenExtensions,
    }).ok,
    true
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...ping,
      extensions: { ...sixteenExtensions, 'extension-16': 16 },
    }),
    'structural_limit_exceeded',
    '$["extensions"]'
  );

  const eightCritical = Object.keys(sixteenExtensions).slice(0, 8);
  assert.equal(
    validateSignedMeshEnvelope({
      ...ping,
      extensions: sixteenExtensions,
      criticalExtensions: eightCritical,
    }).ok,
    true
  );
  expectIssue(
    validateSignedMeshEnvelope({
      ...ping,
      extensions: sixteenExtensions,
      criticalExtensions: Object.keys(sixteenExtensions).slice(0, 9),
    }),
    'structural_limit_exceeded',
    '$["criticalExtensions"]'
  );

  for (const criticalExtensions of [['missing'], ['trace', 'trace'], [1]]) {
    expectIssue(
      validateSignedMeshEnvelope({ ...extended, criticalExtensions }),
      'invalid_extension'
    );
  }

  expectIssue(
    validateMeshEnvelopeContext(validated.value, {
      tenantId: 'tenant-a',
      meshId: 'mesh-a',
      peerId: 'peer-b',
      receivedAt: '2026-07-30T00:00:01Z',
    }),
    'unknown_critical_extension',
    '$["criticalExtensions"][0]'
  );
  assert.equal(
    validateMeshEnvelopeContext(validated.value, {
      tenantId: 'tenant-a',
      meshId: 'mesh-a',
      peerId: 'peer-b',
      receivedAt: '2026-07-30T00:00:01Z',
      supportedCriticalExtensions: ['trace'],
    }).ok,
    true
  );
});

test('receiver context rejects cross-scope, stale, future and misaddressed messages', async () => {
  const result = parseSignedMeshEnvelope(await loadFixtureBytes('peer-ping'));
  assert.equal(result.ok, true);
  const context = {
    tenantId: 'tenant-a',
    meshId: 'mesh-a',
    peerId: 'peer-b',
    receivedAt: '2026-07-30T00:00:01Z',
  };
  assert.equal(validateMeshEnvelopeContext(result.value, context).ok, true);

  expectIssue(
    validateMeshEnvelopeContext(result.value, {
      ...context,
      tenantId: 'tenant-b',
    }),
    'scope_mismatch',
    '$'
  );
  expectIssue(
    validateMeshEnvelopeContext(result.value, {
      ...context,
      peerId: 'peer-c',
    }),
    'invalid_audience',
    '$["audience"]'
  );
  expectIssue(
    validateMeshEnvelopeContext(result.value, {
      ...context,
      receivedAt: '2026-07-30T00:00:30Z',
    }),
    'message_expired',
    '$["expiresAt"]'
  );
  expectIssue(
    validateMeshEnvelopeContext(result.value, {
      ...context,
      receivedAt: '2026-07-29T23:57:59.999999999Z',
    }),
    'message_from_future',
    '$["sentAt"]'
  );
  expectIssue(
    validateMeshEnvelopeContext({}, context),
    'invalid_protocol',
    '$["protocol"]'
  );
});

test('signing documents exclude payload and signature but retain signed metadata', async () => {
  const parsed = parseSignedMeshEnvelope(
    await loadFixtureBytes('peer-ping-ack')
  );
  assert.equal(parsed.ok, true);

  const document = createMeshSigningDocument(parsed.value);
  assert.equal(Object.hasOwn(document, 'payload'), false);
  assert.deepEqual(document.proof, {
    algorithm: 'Ed25519',
    keyId: 'key-b',
  });
  assert.equal(Object.hasOwn(document.proof, 'value'), false);
  assert.equal(document.payloadHash, parsed.value.payloadHash);
  assert.equal(document.causationId, parsed.value.causationId);

  const signingBytes = canonicalizeMeshSigningDocument(parsed.value);
  const payloadBytes = canonicalizeMeshPayload(parsed.value.payload);
  const jsonBytes = canonicalizeMeshJsonBytes(document);
  assert.equal(signingBytes.ok, true);
  assert.equal(payloadBytes.ok, true);
  assert.equal(jsonBytes.ok, true);
  assert.deepEqual(signingBytes.value, jsonBytes.value);
  assert.equal(
    new TextDecoder().decode(payloadBytes.value),
    '{"type":"peer.ping_ack"}'
  );
});
