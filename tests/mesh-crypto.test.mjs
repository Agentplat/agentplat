import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  DEFAULT_MESH_CRYPTO_POLICY,
  MeshCryptoError,
  StaticMeshKeyResolver,
  WebCryptoMeshEnvelopeSigner,
  WebCryptoMeshEnvelopeVerifier,
  computeMeshPayloadHash,
  createStaticMeshKeyResolver,
  createWebCryptoMeshEnvelopeSigner,
  createWebCryptoMeshEnvelopeVerifier,
  exportMeshEd25519PublicKey,
  importMeshEd25519PublicKey,
  signMeshEnvelope,
  verifyMeshEnvelope,
} from '@agentplat/mesh-crypto';
import {
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
  parseSignedMeshEnvelope,
  validateSignedMeshEnvelope,
} from '@agentplat/mesh-protocol';

const verifiedAt = '2026-07-30T00:00:01Z';
const fixtureUrl = (name) =>
  new URL(`../packages/mesh-crypto/fixtures/v0/${name}`, import.meta.url);

function unsignedHello(overrides = {}) {
  return {
    protocol: MESH_PROTOCOL,
    wireVersion: MESH_WIRE_VERSION,
    messageId: 'HHHHHHHHHHHHHHHHHHHHHA',
    tenantId: 'tenant-a',
    meshId: 'mesh-a',
    type: 'peer.hello',
    sender: {
      peerId: 'peer-a',
      instanceId: 'instance-a',
    },
    audience: {
      kind: 'peer',
      peerId: 'peer-b',
    },
    sequence: 1,
    sentAt: '2026-07-30T00:00:00Z',
    expiresAt: '2026-07-30T00:02:00Z',
    payload: {
      type: 'peer.hello',
      peerCardId: 'card-a',
      cardRevision: 1,
    },
    proof: {
      algorithm: MESH_SIGNATURE_ALGORITHM,
      keyId: 'key-a',
    },
    ...overrides,
  };
}

function unsignedPing(overrides = {}) {
  return unsignedHello({
    messageId: 'PPPPPPPPPPPPPPPPPPPPPA',
    type: 'peer.ping',
    expiresAt: '2026-07-30T00:00:30Z',
    payload: { type: 'peer.ping' },
    ...overrides,
  });
}

function unsignedPingAck(overrides = {}) {
  return unsignedHello({
    messageId: 'KKKKKKKKKKKKKKKKKKKKKA',
    type: 'peer.ping_ack',
    causationId: 'PPPPPPPPPPPPPPPPPPPPPA',
    expiresAt: '2026-07-30T00:00:30Z',
    payload: { type: 'peer.ping_ack' },
    ...overrides,
  });
}

function keyRecord(publicKey, overrides = {}) {
  return {
    tenantId: 'tenant-a',
    meshId: 'mesh-a',
    peerId: 'peer-a',
    keyId: 'key-a',
    algorithm: MESH_SIGNATURE_ALGORITHM,
    publicKey,
    validFrom: '2026-01-01T00:00:00Z',
    validUntil: '2027-01-01T00:00:00Z',
    status: 'active',
    ...overrides,
  };
}

async function keyPair() {
  return crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
    'sign',
    'verify',
  ]);
}

function expectRejection(result, code) {
  assert.deepEqual(result, { verified: false, code });
}

async function signAndContext() {
  const keys = await keyPair();
  const envelope = await signMeshEnvelope({
    envelope: unsignedHello(),
    privateKey: keys.privateKey,
  });
  return {
    keys,
    envelope,
    resolver: createStaticMeshKeyResolver([keyRecord(keys.publicKey)]),
  };
}

test('canonical payload hashing matches fixed SHA-256 vectors', async () => {
  for (const [payload, expected] of [
    [
      {
        type: 'peer.hello',
        peerCardId: 'card-a',
        cardRevision: 1,
      },
      'sha256:De9Hh1iOinkYALuf7SSfUIL2AyAoUyqLlDUQyoIuWsg',
    ],
    [
      { type: 'peer.ping' },
      'sha256:_8czW4AY8gjthq7NnzCIs73fOeWdOh62geiHthPxdyI',
    ],
    [
      { type: 'peer.ping_ack' },
      'sha256:Loa9rRILGDC4aStCEscqo37McJwV-rOm_vrt8GbiXeo',
    ],
  ]) {
    assert.equal(await computeMeshPayloadHash({ payload }), expected);
  }
});

test('public Ed25519 conformance fixture verifies without private material', async () => {
  const publicFixture = JSON.parse(
    await readFile(fixtureUrl('peer-a-public.raw.json'), 'utf8')
  );
  assert.equal(publicFixture.format, 'raw');
  assert.equal(publicFixture.algorithm, MESH_SIGNATURE_ALGORITHM);
  const publicKey = await importMeshEd25519PublicKey(
    Uint8Array.from(publicFixture.publicKey)
  );
  const parsed = parseSignedMeshEnvelope(
    await readFile(fixtureUrl('signed-peer-hello.json'))
  );
  assert.equal(parsed.ok, true);

  const result = await verifyMeshEnvelope({
    envelope: parsed.value,
    resolver: createStaticMeshKeyResolver([
      {
        tenantId: 'tenant-conformance',
        meshId: 'mesh-conformance',
        peerId: 'peer-conformance-a',
        keyId: 'key-conformance-a',
        algorithm: MESH_SIGNATURE_ALGORITHM,
        publicKey,
        validFrom: '2026-01-01T00:00:00Z',
        validUntil: '2027-01-01T00:00:00Z',
        status: 'active',
      },
    ]),
    policy: DEFAULT_MESH_CRYPTO_POLICY,
    verifiedAt: '2026-07-30T12:00:01Z',
  });
  assert.equal(result.verified, true);
});

test('reference signer constructs a structurally valid immutable envelope', async () => {
  const keys = await keyPair();
  const signed = await signMeshEnvelope({
    envelope: unsignedHello(),
    privateKey: keys.privateKey,
  });

  assert.equal(
    signed.payloadHash,
    await computeMeshPayloadHash({ payload: signed.payload })
  );
  assert.match(signed.proof.value, /^[A-Za-z0-9_-]{86}$/u);
  assert.equal(Object.isFrozen(signed), true);
  assert.equal(Object.isFrozen(signed.payload), true);
  assert.equal(validateSignedMeshEnvelope(signed).ok, true);

  const signer = createWebCryptoMeshEnvelopeSigner();
  assert.equal(signer instanceof WebCryptoMeshEnvelopeSigner, true);
  assert.equal(
    (
      await signer.sign({
        envelope: unsignedHello({ sequence: 2 }),
        privateKey: keys.privateKey,
      })
    ).sequence,
    2
  );
});

test('reference signer snapshots its inputs before asynchronous crypto', async () => {
  const keys = await keyPair();
  const replacementKeys = await keyPair();
  const mutableEnvelope = unsignedHello();
  let signingRequest;
  const mutatingCrypto = {
    subtle: {
      digest: (...args) => {
        mutableEnvelope.sequence = 2;
        signingRequest.privateKey = replacementKeys.privateKey;
        return crypto.subtle.digest(...args);
      },
      sign: (...args) => {
        mutableEnvelope.proof.keyId = 'key-mutated';
        return crypto.subtle.sign(...args);
      },
    },
  };

  signingRequest = {
    envelope: mutableEnvelope,
    privateKey: keys.privateKey,
    crypto: mutatingCrypto,
  };
  const signed = await signMeshEnvelope(signingRequest);
  assert.equal(signed.sequence, 1);
  assert.equal(signed.proof.keyId, 'key-a');
  assert.equal(
    (
      await verifyMeshEnvelope({
        envelope: signed,
        resolver: createStaticMeshKeyResolver([keyRecord(keys.publicKey)]),
        policy: DEFAULT_MESH_CRYPTO_POLICY,
        verifiedAt,
      })
    ).verified,
    true
  );
});

test('reference signer and verifier cover every Alpha 1 message type', async () => {
  const keys = await keyPair();
  const resolver = createStaticMeshKeyResolver([keyRecord(keys.publicKey)]);

  for (const envelope of [unsignedHello(), unsignedPing(), unsignedPingAck()]) {
    const signed = await signMeshEnvelope({
      envelope,
      privateKey: keys.privateKey,
    });
    assert.equal(validateSignedMeshEnvelope(signed).ok, true);
    assert.equal(
      (
        await verifyMeshEnvelope({
          envelope: signed,
          resolver,
          policy: DEFAULT_MESH_CRYPTO_POLICY,
          verifiedAt,
        })
      ).verified,
      true
    );
  }
});

test('reference signer and verifier cover Alpha 2 payload shapes and tampering', async () => {
  const keys = await keyPair();
  const resolver = createStaticMeshKeyResolver([
    keyRecord(keys.publicKey),
    keyRecord(keys.publicKey, { peerId: 'peer-b', keyId: 'key-b' }),
    keyRecord(keys.publicKey, { peerId: 'peer-c', keyId: 'key-c' }),
  ]);

  for (const [fixtureName, payloadField] of [
    ['peer-card', 'peerCardId'],
    ['peer-goodbye', 'peerCardId'],
    ['capability-advertise', 'advertisementId'],
    ['capability-withdraw', 'advertisementId'],
    ['objective-announce', 'objectiveDocumentId'],
    ['objective-revise', 'objectiveDocumentId'],
    ['objective-cancel', 'cancellationId'],
    ['work-offer', 'offerId'],
    ['work-bid', 'bidId'],
    ['work-award', 'offerId'],
    ['work-accept', 'acceptanceId'],
    ['work-decline', 'declineId'],
    ['work-progress', 'progressId'],
    ['work-checkpoint', 'checkpointId'],
    ['work-result', 'resultId'],
    ['work-release', 'releaseId'],
    ['work-cancel', 'cancellationId'],
    ['lease-renew', 'leaseRenewalId'],
    ['lease-takeover-proposal', 'takeoverProposalId'],
    ['lease-vote', 'leaseVoteId'],
    ['lease-certificate', 'certificateId'],
  ]) {
    const envelope = JSON.parse(
      await readFile(
        new URL(
          `../packages/mesh-protocol/fixtures/v0/${fixtureName}.json`,
          import.meta.url
        ),
        'utf8'
      )
    );
    const signed = await signMeshEnvelope({
      envelope,
      privateKey: keys.privateKey,
    });

    assert.equal(validateSignedMeshEnvelope(signed).ok, true);
    assert.equal(
      (
        await verifyMeshEnvelope({
          envelope: signed,
          resolver,
          policy: DEFAULT_MESH_CRYPTO_POLICY,
          verifiedAt,
        })
      ).verified,
      true
    );

    const payloadTampered = validateSignedMeshEnvelope({
      ...signed,
      payload: {
        ...signed.payload,
        [payloadField]: `${signed.payload[payloadField]}-tampered`,
      },
    });
    assert.equal(payloadTampered.ok, true);
    expectRejection(
      await verifyMeshEnvelope({
        envelope: payloadTampered.value,
        resolver,
        policy: DEFAULT_MESH_CRYPTO_POLICY,
        verifiedAt,
      }),
      'payload_hash_mismatch'
    );

    const signatureTampered = validateSignedMeshEnvelope({
      ...signed,
      proof: {
        ...signed.proof,
        value: `${signed.proof.value[0] === 'A' ? 'B' : 'A'}${signed.proof.value.slice(1)}`,
      },
    });
    assert.equal(signatureTampered.ok, true);
    expectRejection(
      await verifyMeshEnvelope({
        envelope: signatureTampered.value,
        resolver,
        policy: DEFAULT_MESH_CRYPTO_POLICY,
        verifiedAt,
      }),
      'signature_invalid'
    );
  }
});

test('reference verifier authenticates digest, signature and key state', async () => {
  const { envelope, resolver } = await signAndContext();
  const result = await verifyMeshEnvelope({
    envelope,
    resolver,
    policy: DEFAULT_MESH_CRYPTO_POLICY,
    verifiedAt,
  });

  assert.equal(result.verified, true);
  assert.deepEqual(result.envelope, envelope);
  assert.equal(Object.isFrozen(result.envelope), true);
  assert.equal(result.key.peerId, 'peer-a');
  assert.equal(Object.isFrozen(result.key), true);
  assert.equal(Object.isFrozen(DEFAULT_MESH_CRYPTO_POLICY), true);
  assert.equal(
    Object.isFrozen(DEFAULT_MESH_CRYPTO_POLICY.allowedAlgorithms),
    true
  );

  const verifier = createWebCryptoMeshEnvelopeVerifier();
  assert.equal(verifier instanceof WebCryptoMeshEnvelopeVerifier, true);
  assert.equal(
    (
      await verifier.verify({
        envelope,
        resolver,
        policy: DEFAULT_MESH_CRYPTO_POLICY,
        verifiedAt,
      })
    ).verified,
    true
  );
});

test('verification accepts only the primitive boolean true from Web Crypto', async () => {
  const { envelope, resolver } = await signAndContext();

  for (const providerResult of ['true', 1, {}, new Boolean(false)]) {
    expectRejection(
      await verifyMeshEnvelope({
        envelope,
        resolver,
        policy: DEFAULT_MESH_CRYPTO_POLICY,
        verifiedAt,
        crypto: {
          subtle: {
            digest: (...args) => crypto.subtle.digest(...args),
            verify: async () => providerResult,
          },
        },
      }),
      'signature_invalid'
    );
  }
});

test('signing and verification do not require browser base64 globals', async () => {
  const originalBtoa = globalThis.btoa;
  const originalAtob = globalThis.atob;
  globalThis.btoa = undefined;
  globalThis.atob = undefined;
  try {
    const keys = await keyPair();
    const envelope = await signMeshEnvelope({
      envelope: unsignedHello(),
      privateKey: keys.privateKey,
    });
    assert.equal(
      (
        await verifyMeshEnvelope({
          envelope,
          resolver: createStaticMeshKeyResolver([keyRecord(keys.publicKey)]),
          policy: DEFAULT_MESH_CRYPTO_POLICY,
          verifiedAt,
        })
      ).verified,
      true
    );
  } finally {
    globalThis.btoa = originalBtoa;
    globalThis.atob = originalAtob;
  }
});

test('payload and payload-hash tampering fail before signature acceptance', async () => {
  const { envelope, resolver } = await signAndContext();
  let verifyCalls = 0;
  const instrumentedCrypto = {
    subtle: {
      digest: (...args) => crypto.subtle.digest(...args),
      verify: (...args) => {
        verifyCalls += 1;
        return crypto.subtle.verify(...args);
      },
    },
  };
  const payloadTampered = validateSignedMeshEnvelope({
    ...envelope,
    payload: {
      ...envelope.payload,
      cardRevision: 2,
    },
  });
  assert.equal(payloadTampered.ok, true);
  expectRejection(
    await verifyMeshEnvelope({
      envelope: payloadTampered.value,
      resolver,
      policy: DEFAULT_MESH_CRYPTO_POLICY,
      verifiedAt,
      crypto: instrumentedCrypto,
    }),
    'payload_hash_mismatch'
  );
  assert.equal(verifyCalls, 0);

  const hashTampered = validateSignedMeshEnvelope({
    ...envelope,
    payloadHash: `sha256:${'A'.repeat(43)}`,
  });
  assert.equal(hashTampered.ok, true);
  expectRejection(
    await verifyMeshEnvelope({
      envelope: hashTampered.value,
      resolver,
      policy: DEFAULT_MESH_CRYPTO_POLICY,
      verifiedAt,
    }),
    'payload_hash_mismatch'
  );
});

test('signing-document and proof tampering fail signature verification', async () => {
  const { keys, envelope, resolver } = await signAndContext();
  const headerTampered = validateSignedMeshEnvelope({
    ...envelope,
    sequence: 2,
  });
  assert.equal(headerTampered.ok, true);
  expectRejection(
    await verifyMeshEnvelope({
      envelope: headerTampered.value,
      resolver,
      policy: DEFAULT_MESH_CRYPTO_POLICY,
      verifiedAt,
    }),
    'signature_invalid'
  );

  const proofTampered = validateSignedMeshEnvelope({
    ...envelope,
    proof: {
      ...envelope.proof,
      value: `${envelope.proof.value[0] === 'A' ? 'B' : 'A'}${envelope.proof.value.slice(1)}`,
    },
  });
  assert.equal(proofTampered.ok, true);
  expectRejection(
    await verifyMeshEnvelope({
      envelope: proofTampered.value,
      resolver,
      policy: DEFAULT_MESH_CRYPTO_POLICY,
      verifiedAt,
    }),
    'signature_invalid'
  );

  const keyIdTampered = validateSignedMeshEnvelope({
    ...envelope,
    proof: {
      ...envelope.proof,
      keyId: 'key-other',
    },
  });
  assert.equal(keyIdTampered.ok, true);
  expectRejection(
    await verifyMeshEnvelope({
      envelope: keyIdTampered.value,
      resolver: {
        resolve: () => keyRecord(keys.publicKey, { keyId: 'key-other' }),
      },
      policy: DEFAULT_MESH_CRYPTO_POLICY,
      verifiedAt,
    }),
    'signature_invalid'
  );

  expectRejection(
    await verifyMeshEnvelope({
      envelope: proofTampered.value,
      resolver: {
        resolve: () =>
          keyRecord(keys.publicKey, {
            status: 'revoked',
            revokedAt: '2026-07-29T00:00:00Z',
          }),
      },
      policy: DEFAULT_MESH_CRYPTO_POLICY,
      verifiedAt,
    }),
    'signature_invalid'
  );
});

test('verification rejects unsupported policy, lookup failures and bad bindings', async () => {
  const { keys, envelope } = await signAndContext();

  expectRejection(
    await verifyMeshEnvelope({
      envelope,
      resolver: { resolve: () => keyRecord(keys.publicKey) },
      policy: { allowedAlgorithms: [] },
      verifiedAt,
    }),
    'unsupported_algorithm'
  );
  expectRejection(
    await verifyMeshEnvelope({
      envelope,
      resolver: { resolve: () => undefined },
      policy: DEFAULT_MESH_CRYPTO_POLICY,
      verifiedAt,
    }),
    'key_not_found'
  );
  expectRejection(
    await verifyMeshEnvelope({
      envelope,
      resolver: {
        resolve() {
          throw new Error('local store unavailable');
        },
      },
      policy: DEFAULT_MESH_CRYPTO_POLICY,
      verifiedAt,
    }),
    'key_resolution_failed'
  );
  expectRejection(
    await verifyMeshEnvelope({
      envelope,
      resolver: {
        resolve: () => keyRecord(keys.publicKey, { peerId: 'peer-other' }),
      },
      policy: DEFAULT_MESH_CRYPTO_POLICY,
      verifiedAt,
    }),
    'key_binding_mismatch'
  );
  for (const overrides of [
    { tenantId: 'tenant-other' },
    { meshId: 'mesh-other' },
  ]) {
    expectRejection(
      await verifyMeshEnvelope({
        envelope,
        resolver: {
          resolve: () => keyRecord(keys.publicKey, overrides),
        },
        policy: DEFAULT_MESH_CRYPTO_POLICY,
        verifiedAt,
      }),
      'key_binding_mismatch'
    );
  }
  expectRejection(
    await verifyMeshEnvelope({
      envelope,
      resolver: {
        resolve: () => keyRecord(keys.privateKey),
      },
      policy: DEFAULT_MESH_CRYPTO_POLICY,
      verifiedAt,
    }),
    'invalid_key_material'
  );
  expectRejection(
    await verifyMeshEnvelope({
      envelope,
      resolver: {
        resolve: () =>
          keyRecord(
            new Proxy(
              {},
              {
                get() {
                  throw new TypeError('untrusted CryptoKey proxy');
                },
              }
            )
          ),
      },
      policy: DEFAULT_MESH_CRYPTO_POLICY,
      verifiedAt,
    }),
    'invalid_key_material'
  );
});

test('verification performs one scoped synchronous lookup and snapshots it', async () => {
  const { keys, envelope } = await signAndContext();
  const record = keyRecord(keys.publicKey);
  const inputs = [];
  const mutatingCrypto = {
    subtle: {
      digest: (...args) => {
        record.peerId = 'peer-mutated';
        return crypto.subtle.digest(...args);
      },
      verify: (...args) => crypto.subtle.verify(...args),
    },
  };
  const result = await verifyMeshEnvelope({
    envelope,
    resolver: {
      resolve(input) {
        inputs.push(input);
        return record;
      },
    },
    policy: DEFAULT_MESH_CRYPTO_POLICY,
    verifiedAt,
    crypto: mutatingCrypto,
  });

  assert.equal(result.verified, true);
  assert.deepEqual(inputs, [
    {
      tenantId: 'tenant-a',
      meshId: 'mesh-a',
      peerId: 'peer-a',
      keyId: 'key-a',
      algorithm: MESH_SIGNATURE_ALGORITHM,
    },
  ]);
  assert.equal(result.key.peerId, 'peer-a');

  expectRejection(
    await verifyMeshEnvelope({
      envelope,
      resolver: {
        resolve: () => Promise.resolve(keyRecord(keys.publicKey)),
      },
      policy: DEFAULT_MESH_CRYPTO_POLICY,
      verifiedAt,
    }),
    'invalid_key_record'
  );
});

test('signing and verification preserve own prototype-named attributes', async () => {
  const keys = await keyPair();
  const attributes = JSON.parse('{"__proto__":"preserved"}');
  const envelope = await signMeshEnvelope({
    envelope: unsignedHello({
      type: 'capability.advertise',
      audience: { kind: 'mesh', topic: 'capability' },
      payload: {
        type: 'capability.advertise',
        advertisementId: 'advertisement-a',
        capabilityId: 'capability-a',
        capabilityRevision: 1,
        ownerPeerId: 'peer-a',
        capabilityKey: 'summarize',
        version: 'v1',
        inputMediaTypes: ['text/plain'],
        outputMediaTypes: ['text/plain'],
        attributes,
        validFrom: '2026-07-30T00:00:00Z',
        validUntil: '2026-07-31T00:00:00Z',
      },
    }),
    privateKey: keys.privateKey,
  });
  assert.equal(Object.hasOwn(envelope.payload.attributes, '__proto__'), true);
  assert.equal(envelope.payload.attributes.__proto__, 'preserved');

  const result = await verifyMeshEnvelope({
    envelope,
    resolver: createStaticMeshKeyResolver([keyRecord(keys.publicKey)]),
    policy: DEFAULT_MESH_CRYPTO_POLICY,
    verifiedAt,
  });
  assert.equal(result.verified, true);
  assert.equal(
    Object.hasOwn(result.envelope.payload.attributes, '__proto__'),
    true
  );
  assert.equal(result.envelope.payload.attributes.__proto__, 'preserved');
});

test('verification enforces inclusive start, exclusive expiry and revocation', async () => {
  const { keys, envelope } = await signAndContext();
  const resolve = (overrides) => ({
    resolve: () => keyRecord(keys.publicKey, overrides),
  });

  expectRejection(
    await verifyMeshEnvelope({
      envelope,
      resolver: resolve({
        validFrom: '2026-07-30T00:00:02Z',
        validUntil: '2027-01-01T00:00:00Z',
      }),
      policy: DEFAULT_MESH_CRYPTO_POLICY,
      verifiedAt,
    }),
    'key_not_yet_valid'
  );
  assert.equal(
    (
      await verifyMeshEnvelope({
        envelope,
        resolver: resolve({
          validFrom: verifiedAt,
          validUntil: '2027-01-01T00:00:00Z',
        }),
        policy: DEFAULT_MESH_CRYPTO_POLICY,
        verifiedAt,
      })
    ).verified,
    true
  );
  expectRejection(
    await verifyMeshEnvelope({
      envelope,
      resolver: resolve({
        validFrom: '2026-01-01T00:00:00Z',
        validUntil: verifiedAt,
      }),
      policy: DEFAULT_MESH_CRYPTO_POLICY,
      verifiedAt,
    }),
    'key_expired'
  );
  expectRejection(
    await verifyMeshEnvelope({
      envelope,
      resolver: resolve({
        validFrom: verifiedAt,
        validUntil: verifiedAt,
      }),
      policy: DEFAULT_MESH_CRYPTO_POLICY,
      verifiedAt,
    }),
    'invalid_key_record'
  );
  expectRejection(
    await verifyMeshEnvelope({
      envelope,
      resolver: resolve({
        status: 'revoked',
        revokedAt: '2026-07-29T00:00:00Z',
      }),
      policy: DEFAULT_MESH_CRYPTO_POLICY,
      verifiedAt,
    }),
    'key_revoked'
  );
  for (const overrides of [
    { status: 'revoked' },
    {
      status: 'revoked',
      revokedAt: '2025-12-31T23:59:59Z',
    },
  ]) {
    expectRejection(
      await verifyMeshEnvelope({
        envelope,
        resolver: resolve(overrides),
        policy: DEFAULT_MESH_CRYPTO_POLICY,
        verifiedAt,
      }),
      'invalid_key_record'
    );
  }
  expectRejection(
    await verifyMeshEnvelope({
      envelope,
      resolver: resolve({
        status: 'active',
        revokedAt: '2026-07-29T00:00:00Z',
      }),
      policy: DEFAULT_MESH_CRYPTO_POLICY,
      verifiedAt,
    }),
    'invalid_key_record'
  );
});

test('verification rejects invalid time, envelope and unavailable crypto', async () => {
  const { envelope, resolver } = await signAndContext();
  expectRejection(await verifyMeshEnvelope({}), 'invalid_envelope');
  expectRejection(
    await verifyMeshEnvelope({
      envelope,
      resolver,
      policy: DEFAULT_MESH_CRYPTO_POLICY,
      verifiedAt: 'not-a-timestamp',
    }),
    'invalid_verification_time'
  );
  expectRejection(
    await verifyMeshEnvelope({
      envelope: {},
      resolver,
      policy: DEFAULT_MESH_CRYPTO_POLICY,
      verifiedAt,
    }),
    'invalid_envelope'
  );
  expectRejection(
    await verifyMeshEnvelope({
      envelope,
      resolver,
      policy: DEFAULT_MESH_CRYPTO_POLICY,
      verifiedAt,
      crypto: {},
    }),
    'crypto_unavailable'
  );
});

test('signing fails with stable codes for invalid key, envelope and crypto', async () => {
  const keys = await keyPair();
  const throwingKey = new Proxy(
    {},
    {
      get() {
        throw new TypeError('untrusted CryptoKey proxy');
      },
    }
  );

  await assert.rejects(
    signMeshEnvelope({}),
    (error) =>
      error instanceof MeshCryptoError && error.code === 'invalid_envelope'
  );
  await assert.rejects(
    signMeshEnvelope({
      envelope: unsignedHello(),
      privateKey: keys.publicKey,
    }),
    (error) =>
      error instanceof MeshCryptoError && error.code === 'invalid_private_key'
  );
  await assert.rejects(
    signMeshEnvelope({
      envelope: unsignedHello(),
      privateKey: throwingKey,
    }),
    (error) =>
      error instanceof MeshCryptoError && error.code === 'invalid_private_key'
  );
  await assert.rejects(
    signMeshEnvelope({
      envelope: unsignedHello({ sequence: 0 }),
      privateKey: keys.privateKey,
    }),
    (error) =>
      error instanceof MeshCryptoError && error.code === 'invalid_envelope'
  );
  await assert.rejects(
    computeMeshPayloadHash({
      payload: { type: 'peer.ping' },
      crypto: {},
    }),
    (error) =>
      error instanceof MeshCryptoError && error.code === 'crypto_unavailable'
  );
  for (const invalidLength of [31, 33]) {
    await assert.rejects(
      computeMeshPayloadHash({
        payload: { type: 'peer.ping' },
        crypto: {
          subtle: {
            digest: async () => new Uint8Array(invalidLength).buffer,
          },
        },
      }),
      (error) =>
        error instanceof MeshCryptoError &&
        error.code === 'crypto_operation_failed'
    );
  }
  await assert.rejects(
    signMeshEnvelope({
      envelope: unsignedHello(),
      privateKey: keys.privateKey,
      crypto: {
        subtle: {
          digest: (...args) => crypto.subtle.digest(...args),
          sign: async () => new Uint8Array(63).buffer,
        },
      },
    }),
    (error) =>
      error instanceof MeshCryptoError &&
      error.code === 'crypto_operation_failed'
  );
});

test('public-key raw import and export are exact and provider-neutral', async () => {
  const keys = await keyPair();
  const raw = await exportMeshEd25519PublicKey(keys.publicKey);
  assert.equal(raw.byteLength, 32);

  const imported = await importMeshEd25519PublicKey(raw);
  const reexported = await exportMeshEd25519PublicKey(imported);
  assert.deepEqual(reexported, raw);
  assert.notEqual(reexported.buffer, raw.buffer);

  for (const invalidLength of [31, 33]) {
    await assert.rejects(
      importMeshEd25519PublicKey(new Uint8Array(invalidLength)),
      (error) =>
        error instanceof MeshCryptoError && error.code === 'invalid_public_key'
    );
  }
  await assert.rejects(
    exportMeshEd25519PublicKey(keys.privateKey),
    (error) =>
      error instanceof MeshCryptoError && error.code === 'invalid_public_key'
  );
});

test('static resolver enforces bounds, uniqueness and configuration validity', async () => {
  const keys = await keyPair();
  const record = keyRecord(keys.publicKey);
  const resolver = new StaticMeshKeyResolver([record], {
    maximumRecords: 1,
  });
  assert.equal(
    resolver.resolve({
      tenantId: 'tenant-a',
      meshId: 'mesh-a',
      peerId: 'peer-a',
      keyId: 'key-a',
      algorithm: MESH_SIGNATURE_ALGORITHM,
    })?.publicKey,
    keys.publicKey
  );
  assert.equal(
    resolver.resolve({
      tenantId: 'tenant-a',
      meshId: 'mesh-a',
      peerId: 'peer-missing',
      keyId: 'key-a',
      algorithm: MESH_SIGNATURE_ALGORITHM,
    }),
    undefined
  );

  assert.throws(
    () => new StaticMeshKeyResolver([record, record]),
    /Duplicate static Mesh key binding/u
  );
  assert.throws(
    () =>
      new StaticMeshKeyResolver([record], {
        maximumRecords: 0,
      }),
    /positive safe integer/u
  );
  assert.throws(
    () =>
      new StaticMeshKeyResolver([
        keyRecord(keys.publicKey, {
          validFrom: verifiedAt,
          validUntil: verifiedAt,
        }),
      ]),
    /validity interval/u
  );
  assert.throws(
    () =>
      new StaticMeshKeyResolver([
        keyRecord(keys.publicKey, {
          revokedAt: verifiedAt,
        }),
      ]),
    /cannot have revokedAt/u
  );
  assert.throws(
    () =>
      new StaticMeshKeyResolver([
        keyRecord(keys.publicKey, {
          status: 'revoked',
        }),
      ]),
    /requires revokedAt/u
  );
  assert.throws(
    () =>
      new StaticMeshKeyResolver([
        keyRecord(keys.publicKey, {
          status: 'revoked',
          revokedAt: '2025-12-31T23:59:59Z',
        }),
      ]),
    /revocation interval/u
  );
});
