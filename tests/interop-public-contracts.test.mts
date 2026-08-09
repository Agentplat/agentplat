import {
  createRestartDurableInteropRouterStoresV1,
  InMemoryInteropOutboundSequenceStoreV1,
  InteropClientV1,
  InteropEndpointRouterV1,
  InteropPortableAgentAdapterV1,
  invokeInteropEndpointRouterHandleV1,
  isInteropClientV1,
  isInteropEndpointRouterV1,
  type InteropOutboundSequenceStoreV1,
  type InteropRequestAdmissionGrantV1,
  type InteropRequestAdmissionPortV1,
  type InteropRequestEnvelopeV1,
  type InteropIdempotencyStoreV1,
  type InteropSequenceStoreV1,
  type RestartDurableInteropRouterStoresV1,
} from "@agentplat/interop";
import {
  GovernedInteropLifecycleV1,
  GovernedInteropRequestAdmissionV1,
  createRestartDurableGovernedInteropRuntimeStoresV1,
  createReferenceGovernedInteropRuntimeV1,
  invokeGovernedInteropRequestAdmissionAdmitV1,
  isReferenceGovernedInteropRuntimeV1,
  type GovernedInteropEffectCommitPortV1,
  type GovernedInteropEffectPreparationV1,
  type GovernedInteropEffectPreparerV1,
  type GovernedInteropPreparedEffectV1,
  type GovernedInteropLifecycleOptionsV1,
  type GovernedInteropLifecyclePortV1,
  type GovernedInteropRequestAdmissionOptionsV1,
  type GovernedInteropSessionRecordV1,
  type GovernedInteropSessionStoreV1,
  type RestartDurableGovernedInteropRuntimeStoresV1,
  type ReferenceGovernedInteropRuntimeOptionsV1,
  type ReferenceGovernedInteropRuntimeV1,
} from "@agentplat/interop/governed-lifecycle";
import type { GovernedAgentLifecycleRuntimeV1 } from "@agentplat/collective-membership/governed-agent-lifecycle";

void InMemoryInteropOutboundSequenceStoreV1;
void createRestartDurableInteropRouterStoresV1;
void InteropClientV1;
void InteropEndpointRouterV1;
void InteropPortableAgentAdapterV1;
void GovernedInteropLifecycleV1;
void GovernedInteropRequestAdmissionV1;
void createRestartDurableGovernedInteropRuntimeStoresV1;
void createReferenceGovernedInteropRuntimeV1;
void invokeGovernedInteropRequestAdmissionAdmitV1;
void invokeInteropEndpointRouterHandleV1;
void isInteropClientV1;
void isInteropEndpointRouterV1;
void isReferenceGovernedInteropRuntimeV1;

type PublicContracts =
  | InteropOutboundSequenceStoreV1
  | InteropRequestAdmissionGrantV1
  | InteropRequestAdmissionPortV1
  | InteropRequestEnvelopeV1
  | RestartDurableInteropRouterStoresV1
  | GovernedInteropEffectCommitPortV1
  | GovernedInteropEffectPreparationV1
  | GovernedInteropEffectPreparerV1
  | GovernedInteropPreparedEffectV1
  | GovernedInteropLifecycleOptionsV1
  | GovernedInteropLifecyclePortV1
  | GovernedInteropRequestAdmissionOptionsV1
  | GovernedInteropSessionRecordV1
  | RestartDurableGovernedInteropRuntimeStoresV1
  | ReferenceGovernedInteropRuntimeOptionsV1
  | ReferenceGovernedInteropRuntimeV1;

declare const contracts: PublicContracts;
void contracts;

type InteropLifecycleRuntime = GovernedInteropLifecycleOptionsV1["lifecycle"];
type AdmissionLifecycleRuntime =
  GovernedInteropRequestAdmissionOptionsV1["lifecycle"];
declare const governedRuntime: GovernedAgentLifecycleRuntimeV1;
declare const structuralAdapter: GovernedInteropLifecyclePortV1;
declare const idempotency: InteropIdempotencyStoreV1;
declare const sequences: InteropSequenceStoreV1;
declare const sessionStore: GovernedInteropSessionStoreV1;
declare const outboundSequences: InteropOutboundSequenceStoreV1;
const interopLifecycle: InteropLifecycleRuntime = governedRuntime;
const admissionLifecycle: AdmissionLifecycleRuntime = governedRuntime;
// @ts-expect-error Authoritative interop requires the nominal lifecycle runtime.
const invalidInteropLifecycle: InteropLifecycleRuntime = structuralAdapter;
// @ts-expect-error Request admission requires the nominal lifecycle runtime.
const invalidAdmissionLifecycle: AdmissionLifecycleRuntime = structuralAdapter;
void interopLifecycle;
void admissionLifecycle;
void invalidInteropLifecycle;
void invalidAdmissionLifecycle;

const durableRouterStores = createRestartDurableInteropRouterStoresV1({
  idempotency,
  sequences,
});
// @ts-expect-error Durable router stores require the nominal factory result.
const invalidDurableRouterStores: RestartDurableInteropRouterStoresV1 = {
  idempotency,
  sequences,
};
void durableRouterStores;
void invalidDurableRouterStores;

const durableGovernedStores =
  createRestartDurableGovernedInteropRuntimeStoresV1({
    sessionStore,
    outboundSequences,
    routerStores: durableRouterStores,
  });
// @ts-expect-error The complete governed composition is nominal.
const invalidDurableGovernedStores: RestartDurableGovernedInteropRuntimeStoresV1 = {
  sessionStore,
  outboundSequences,
  routerStores: durableRouterStores,
};
void durableGovernedStores;
void invalidDurableGovernedStores;
