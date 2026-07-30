import {
  DEFAULT_MESH_CRYPTO_POLICY,
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
  type MeshCryptoPolicy,
  type MeshEnvelopeSigner,
  type MeshKeyRecord,
  type MeshKeyResolver,
  type MeshVerifyRequest,
} from '@agentplat/mesh-crypto';
import {
  ALLOW_PREPROVISIONED_MESH_ADMISSION,
  createMeshPeerState,
  processMeshEnvelope,
  reduceMeshPeer,
  type MeshAdmissionPolicy,
  type MeshPeerReducer,
  type MeshPeerState,
} from '@agentplat/mesh';
import {
  createMeshLoopbackTransport,
  type MeshLoopbackTransport,
} from '@agentplat/mesh/loopback';
import {
  createMeshSimulationKernel,
  replayMeshSimulation,
  runMeshSimulation,
  THREE_PEER_SCENARIO_IDS,
  type MeshSimulationConfig,
  type MeshSimulationInvariant,
  type MeshSimulationKernel,
} from '@agentplat/mesh-sim';
import type {
  MeshSimulationEventInput,
} from '@agentplat/mesh-sim';
import {
  canonicalizeMeshJson,
  canonicalizeMeshJsonBytes,
  canonicalizeMeshPayload,
  canonicalizeMeshSigningDocument,
  compareMeshTimestamps,
  createMeshSigningDocument,
  DEFAULT_MESH_PROTOCOL_LIMITS,
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
  parseMeshJson,
  parseSignedMeshEnvelope,
  validateMeshEnvelopeContext,
  validateSignedMeshEnvelope,
  type MeshEnvelopeContext,
  type MeshProtocolResult,
  type PeerHelloPayload,
  type SignedMeshEnvelope,
  type UnsignedMeshEnvelope,
} from '@agentplat/mesh-protocol';

// This file is compiled, not executed. It freezes the direct-package Alpha 1
// surface without re-exporting preview Mesh contracts from Framework.
const helloPayload: PeerHelloPayload = {
  type: 'peer.hello',
  peerCardId: 'card-a',
  cardRevision: 1,
};

const unsignedHello: UnsignedMeshEnvelope<PeerHelloPayload> = {
  protocol: MESH_PROTOCOL,
  wireVersion: MESH_WIRE_VERSION,
  messageId: 'AAAAAAAAAAAAAAAAAAAAAA',
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
  sentAt: '2026-07-29T00:00:00.000Z',
  expiresAt: '2026-07-29T00:02:00.000Z',
  payload: helloPayload,
  proof: {
    algorithm: MESH_SIGNATURE_ALGORITHM,
    keyId: 'key-a',
  },
};

const peerState: MeshPeerState = createMeshPeerState({
  identity: {
    tenantId: 'tenant-a',
    meshId: 'mesh-a',
    peerId: 'peer-a',
    instanceId: 'instance-a',
    keyId: 'key-a',
  },
  admittedPeers: [
    {
      peerId: 'peer-b',
      instanceIds: ['instance-b'],
      peerCardId: 'card-b',
      acceptedCardMessageId: 'BBBBBBBBBBBBBBBBBBBBBA',
      cardRevision: 1,
      validUntil: '2027-01-01T00:00:00Z',
    },
  ],
});

const contractReducer: MeshPeerReducer = (state) => ({
  state,
  effects: [],
});

const admissionPolicy: MeshAdmissionPolicy = {
  isPeerAdmitted: ({ senderPeerId }) => senderPeerId === 'peer-b',
};

const simulationConfig: MeshSimulationConfig = {
  seed: 1,
  prngVersion: 'xorshift32-v1',
  recordingMode: 'digest',
  startTime: '2026-07-29T00:00:00Z',
  peers: [
    {
      peerId: 'peer-a',
      state: peerState,
      signer: {} as MeshEnvelopeSigner,
      verifier: {} as WebCryptoMeshEnvelopeVerifier,
      resolver: {} as MeshKeyResolver,
      cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
      admissionPolicy,
      privateKey: {} as CryptoKey,
    },
  ],
  links: [],
  limits: {
    maximumEvents: 100,
    maximumLogicalTime: 1_000,
    maximumQueuedEvents: 100,
    maximumInternalSteps: 100,
  },
};

const invariant: MeshSimulationInvariant = {
  name: 'bounded queue',
  evaluate: ({ queuedEvents }) => {
    if (queuedEvents > simulationConfig.limits.maximumQueuedEvents) {
      throw new Error('queue limit exceeded');
    }
  },
};

const signer: MeshEnvelopeSigner | undefined = undefined;
const resolver: MeshKeyResolver | undefined = undefined;
const verifierInput: MeshVerifyRequest | undefined = undefined;
const contractPrivateKey = {} as CryptoKey;
const contractPublicKey = {} as CryptoKey;
const keyRecord: MeshKeyRecord = {
  tenantId: 'tenant-a',
  meshId: 'mesh-a',
  peerId: 'peer-a',
  keyId: 'key-a',
  algorithm: MESH_SIGNATURE_ALGORITHM,
  publicKey: contractPublicKey,
  validFrom: '2026-01-01T00:00:00Z',
  validUntil: '2027-01-01T00:00:00Z',
  status: 'active',
};
const cryptoPolicy: MeshCryptoPolicy = DEFAULT_MESH_CRYPTO_POLICY;
const revocationBypassPolicy: MeshCryptoPolicy = {
  allowedAlgorithms: [MESH_SIGNATURE_ALGORITHM],
  // @ts-expect-error live verification exposes no revocation bypass
  rejectRevokedKeys: false,
};
// @ts-expect-error revoked records require an explicit revocation timestamp
const incompleteRevokedRecord: MeshKeyRecord = {
  ...keyRecord,
  status: 'revoked',
};
const staticResolver = createStaticMeshKeyResolver([keyRecord]);
const staticResolverClass: StaticMeshKeyResolver = staticResolver;
const referenceSigner: WebCryptoMeshEnvelopeSigner =
  createWebCryptoMeshEnvelopeSigner();
const referenceVerifier: WebCryptoMeshEnvelopeVerifier =
  createWebCryptoMeshEnvelopeVerifier();
const digestPromise = computeMeshPayloadHash({ payload: helloPayload });
const importedPublicKey = importMeshEd25519PublicKey(new Uint8Array(32));
const exportedPublicKey = exportMeshEd25519PublicKey(contractPublicKey);
const signedPromise = signMeshEnvelope({
  envelope: unsignedHello,
  privateKey: contractPrivateKey,
});
const signedEnvelope: SignedMeshEnvelope | undefined = undefined;
const envelopeContext: MeshEnvelopeContext = {
  tenantId: 'tenant-a',
  meshId: 'mesh-a',
  peerId: 'peer-b',
  receivedAt: '2026-07-29T00:00:01.000Z',
};
const parsedJson = parseMeshJson('{"bounded":true}');
const canonicalJson = canonicalizeMeshJson({ bounded: true });
const canonicalBytes = canonicalizeMeshJsonBytes({ bounded: true });
const timestampOrder = compareMeshTimestamps(
  '2026-07-29T00:00:00Z',
  '2026-07-29T00:00:01Z'
);
const parsedEnvelope = parseSignedMeshEnvelope(new Uint8Array());
// @ts-expect-error wire parsing requires bytes so UTF-8 failures stay visible
parseSignedMeshEnvelope('{}');
const validatedEnvelope = validateSignedMeshEnvelope({});
const canonicalPayload = canonicalizeMeshPayload(helloPayload);
const expectedResult: MeshProtocolResult<unknown> = parsedJson;
const signedForContract = {} as SignedMeshEnvelope<PeerHelloPayload>;
const verificationPromise = verifyMeshEnvelope({
  envelope: signedForContract,
  resolver: staticResolver,
  policy: cryptoPolicy,
  verifiedAt: '2026-07-29T00:00:01Z',
});
const reducerTransition = reduceMeshPeer(peerState, { kind: 'peer.start' }, 0);
const inboundPromise = processMeshEnvelope(peerState, {
  envelope: signedForContract,
  verifiedAt: '2026-07-29T00:00:01Z',
  receivedAt: 1,
  verifier: referenceVerifier,
  resolver: staticResolver,
  cryptoPolicy,
  admissionPolicy: ALLOW_PREPROVISIONED_MESH_ADMISSION,
});
const signingDocument = createMeshSigningDocument(signedForContract);
const signingBytes = canonicalizeMeshSigningDocument(signedForContract);
const contextValidation = validateMeshEnvelopeContext(
  signedForContract,
  envelopeContext
);
const loopback: MeshLoopbackTransport | undefined = undefined;
const kernel: MeshSimulationKernel | undefined = undefined;
const loopbackRuntime = createMeshLoopbackTransport();
const simulationEvents: readonly MeshSimulationEventInput[] = [];
const simulationKernelPromise = createMeshSimulationKernel(simulationConfig);
const simulationRunPromise = runMeshSimulation(
  simulationConfig,
  simulationEvents
);
const simulationReplayPromise = simulationRunPromise.then((trace) =>
  replayMeshSimulation(simulationConfig, simulationEvents, trace)
);

void unsignedHello;
void admissionPolicy;
void DEFAULT_MESH_PROTOCOL_LIMITS;
void THREE_PEER_SCENARIO_IDS;
void invariant;
void signer;
void resolver;
void verifierInput;
void contractPrivateKey;
void contractPublicKey;
void keyRecord;
void cryptoPolicy;
void revocationBypassPolicy;
void incompleteRevokedRecord;
void staticResolverClass;
void referenceSigner;
void referenceVerifier;
void digestPromise;
void importedPublicKey;
void exportedPublicKey;
void signedPromise;
void verificationPromise;
void reducerTransition;
void inboundPromise;
void signedEnvelope;
void envelopeContext;
void canonicalJson;
void canonicalBytes;
void timestampOrder;
void parsedEnvelope;
void validatedEnvelope;
void canonicalPayload;
void expectedResult;
void signingDocument;
void signingBytes;
void contextValidation;
void loopback;
void kernel;
void loopbackRuntime;
void simulationKernelPromise;
void simulationRunPromise;
void simulationReplayPromise;
