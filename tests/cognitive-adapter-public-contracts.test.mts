import {
  COGNITIVE_EFFECTFUL_OPERATION_KINDS_V2,
  CognitiveAgentRuntimeV2,
  InMemoryCognitiveSessionStateStoreV2,
  createCognitiveOperationRequestV2,
  createWebCryptoCognitiveIntegrityV2,
  validateCognitiveSessionStateV2,
  type CognitiveAgentAdapterContextV2,
  type CognitiveAgentAdapterManifestV2,
  type CognitiveAgentAdapterV2,
  type CognitiveAgentRuntimeOptionsV2,
  type CognitiveDurableOperationRecordV2,
  type CognitiveDurableOperationStoreV2,
  type CognitiveEffectInvocationV2,
  type CognitiveEffectSinkV2,
  type CognitiveEffectfulOperationKindV2,
  type CognitiveIntegrityV2,
  type CognitiveOperationGuardV2,
  type CognitiveOperationKindV2,
  type CognitiveOperationOutcomeV2,
  type CognitiveOperationReceiptV2,
  type CognitiveOperationRequestV2,
  type CognitiveOperationResultV2,
  type CognitiveSessionStateStoreV2,
  type CognitiveSessionStateV2,
} from "@agentplat/runtime/cognitive-adapter";

void COGNITIVE_EFFECTFUL_OPERATION_KINDS_V2;
void CognitiveAgentRuntimeV2;
void InMemoryCognitiveSessionStateStoreV2;
void createCognitiveOperationRequestV2;
void createWebCryptoCognitiveIntegrityV2;
void validateCognitiveSessionStateV2;

const durableStore: CognitiveDurableOperationStoreV2 =
  new InMemoryCognitiveSessionStateStoreV2();
const sessionStore: CognitiveSessionStateStoreV2 = durableStore;
void sessionStore;

type PublicTypes =
  | CognitiveAgentAdapterContextV2
  | CognitiveAgentAdapterManifestV2
  | CognitiveAgentAdapterV2
  | CognitiveAgentRuntimeOptionsV2
  | CognitiveDurableOperationRecordV2
  | CognitiveDurableOperationStoreV2
  | CognitiveEffectInvocationV2
  | CognitiveEffectSinkV2
  | CognitiveEffectfulOperationKindV2
  | CognitiveIntegrityV2
  | CognitiveOperationGuardV2
  | CognitiveOperationKindV2
  | CognitiveOperationOutcomeV2
  | CognitiveOperationReceiptV2
  | CognitiveOperationRequestV2
  | CognitiveOperationResultV2
  | CognitiveSessionStateStoreV2
  | CognitiveSessionStateV2;

declare const publicType: PublicTypes;
void publicType;
