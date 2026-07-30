import type {
  MeshEnvelopeSigner,
  MeshKeyResolver,
  MeshVerifyRequest,
} from '@agentplat/mesh-crypto';
import type {
  MeshAdmissionPolicy,
  MeshPeerReducer,
  MeshPeerState,
} from '@agentplat/mesh';
import type { MeshLoopbackTransport } from '@agentplat/mesh/loopback';
import type {
  MeshSimulationConfig,
  MeshSimulationInvariant,
  MeshSimulationKernel,
} from '@agentplat/mesh-sim';
import { THREE_PEER_SCENARIO_IDS } from '@agentplat/mesh-sim';
import {
  DEFAULT_MESH_PROTOCOL_LIMITS,
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
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

const peerState: MeshPeerState = {
  identity: {
    tenantId: 'tenant-a',
    meshId: 'mesh-a',
    peerId: 'peer-a',
    instanceId: 'instance-a',
    keyId: 'key-a',
  },
  status: 'created',
  peers: {},
  replay: {},
  localEventSequence: 0,
};

const reducer: MeshPeerReducer = (state) => ({
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
  peers: [
    {
      peerId: 'peer-a',
      state: peerState,
      reducer,
    },
  ],
  links: [],
  limits: {
    maximumEvents: 100,
    maximumLogicalTime: 1_000,
    maximumQueuedEvents: 100,
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
const signedEnvelope: SignedMeshEnvelope | undefined = undefined;
const loopback: MeshLoopbackTransport | undefined = undefined;
const kernel: MeshSimulationKernel | undefined = undefined;

void unsignedHello;
void admissionPolicy;
void DEFAULT_MESH_PROTOCOL_LIMITS;
void THREE_PEER_SCENARIO_IDS;
void invariant;
void signer;
void resolver;
void verifierInput;
void signedEnvelope;
void loopback;
void kernel;
