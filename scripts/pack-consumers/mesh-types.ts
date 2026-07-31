import {
  ALLOW_PREPROVISIONED_MESH_ADMISSION,
  processMeshEnvelope,
  reduceMeshPeer,
  type MeshPeerState,
} from '@agentplat/mesh';
import {
  createMeshLoopbackTransport,
  type MeshLoopbackPeer,
} from '@agentplat/mesh/loopback';
import {
  DEFAULT_MESH_CRYPTO_POLICY,
  createWebCryptoMeshEnvelopeSigner,
  createWebCryptoMeshEnvelopeVerifier,
  type MeshKeyResolver,
} from '@agentplat/mesh-crypto';
import {
  MESH_PROTOCOL,
  MESH_WIRE_VERSION,
  type SignedMeshEnvelope,
} from '@agentplat/mesh-protocol';
import {
  createMeshSimulationKernel,
  replayMeshReducerScenario,
  replayMeshSimulation,
  restoreMeshSimulationKernel,
  runMeshReducerScenario,
  type MeshReducerScenarioConfig,
  type MeshReducerScenarioRuntime,
  type MeshReducerScenarioTrace,
  type MeshSimulationConfig,
  type MeshSimulationFaultPlan,
  type MeshSimulationSnapshot,
  type MeshSimulationTrace,
} from '@agentplat/mesh-sim';

declare const state: MeshPeerState;
declare const envelope: SignedMeshEnvelope;
declare const resolver: MeshKeyResolver;
declare const privateKey: CryptoKey;
declare const simulation: MeshSimulationConfig;
declare const expected: MeshSimulationTrace;
declare const faultPlan: MeshSimulationFaultPlan;
declare const snapshot: MeshSimulationSnapshot;

interface ReducerState {
  readonly count: number;
}

interface ReducerAction {
  readonly delta: number;
}

declare const reducerScenario: MeshReducerScenarioConfig<
  ReducerState,
  ReducerAction
>;
declare const reducerRuntime: MeshReducerScenarioRuntime<
  ReducerState,
  ReducerAction
>;
declare const reducerTrace: MeshReducerScenarioTrace<
  ReducerState,
  ReducerState
>;

const signer = createWebCryptoMeshEnvelopeSigner();
const verifier = createWebCryptoMeshEnvelopeVerifier();
const transport = createMeshLoopbackTransport({ maximumQueueDepth: 8 });
const peer: MeshLoopbackPeer = transport.register({
  state,
  signer,
  verifier,
  resolver,
  cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
  admissionPolicy: ALLOW_PREPROVISIONED_MESH_ADMISSION,
  privateKey,
  clock: {
    now: () => ({
      logicalTime: 1,
      timestamp: '2026-07-30T00:00:00.001Z',
    }),
  },
});

void reduceMeshPeer(state, { kind: 'peer.start' }, 1);
void processMeshEnvelope(state, {
  envelope,
  verifiedAt: '2026-07-30T00:00:00.001Z',
  receivedAt: 1,
  verifier,
  resolver,
  cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
  admissionPolicy: ALLOW_PREPROVISIONED_MESH_ADMISSION,
});
void createMeshSimulationKernel(simulation);
void restoreMeshSimulationKernel(simulation, snapshot);
void replayMeshSimulation(simulation, [], expected);
void runMeshReducerScenario(reducerScenario, reducerRuntime);
void replayMeshReducerScenario(reducerScenario, reducerRuntime, reducerTrace);
void peer;
void faultPlan;
void snapshot;
void MESH_PROTOCOL;
void MESH_WIRE_VERSION;
