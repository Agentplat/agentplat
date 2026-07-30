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

function expectIssue(result, code, path) {
  assert.equal(result.ok, false);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].code, code);
  if (path !== undefined) assert.equal(result.issues[0].path, path);
}

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
      type: 'peer.card',
      payload: { type: 'peer.card' },
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
