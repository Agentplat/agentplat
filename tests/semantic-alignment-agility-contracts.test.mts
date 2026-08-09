import type { PortableAgentControlPortV1 } from "@agentplat/runtime/adapter";
import {
  SemanticAlignmentAgilityRuntimeV1,
  createSemanticActionAuthorizationClaimsV1,
  createSemanticActionEffectReceiptV1,
  digestSemanticOperationPayloadV1,
  type HeterogeneousPortableAgentCompositionV1,
  type SemanticAssessorPortV1,
  type SemanticActionAuthorizationV1,
  type SemanticActionAuthorizationClaimsV1,
  type SemanticActionEffectReceiptV1,
  type SemanticActionEffectSinkV1,
  type HeterogeneousPortableActionGatewayV1,
  type SemanticControlDecisionV1,
  type SemanticControlEvaluationInputV1,
  type SemanticControlPolicyV1,
  type SemanticControlRuntimeOptionsV1,
  type SemanticControlRuntimePortV1,
  type SemanticPortableMaterialPortV1,
} from "@agentplat/inference-control/semantic-alignment";

declare const options: SemanticControlRuntimeOptionsV1;
declare const policy: SemanticControlPolicyV1;
declare const assessor: SemanticAssessorPortV1;
declare const material: SemanticPortableMaterialPortV1;
declare const composition: HeterogeneousPortableAgentCompositionV1;
declare const authorization: SemanticActionAuthorizationV1;
declare const authorizationClaims: SemanticActionAuthorizationClaimsV1;
declare const effectReceipt: SemanticActionEffectReceiptV1;
declare const effectSink: SemanticActionEffectSinkV1;
declare const evaluation: SemanticControlEvaluationInputV1;
declare const actionGateway: HeterogeneousPortableActionGatewayV1;

const runtime: SemanticControlRuntimePortV1 =
  new SemanticAlignmentAgilityRuntimeV1(options);
const control: PortableAgentControlPortV1 = composition.semanticControl;
const decision: Promise<SemanticControlDecisionV1> = runtime.getState().then(
  () => null as unknown as SemanticControlDecisionV1,
);
const actionDispatch = runtime.dispatchAction(evaluation, 1, effectSink);
const authorizedSinkId: string = authorizationClaims.sinkId;
const authorizedSinkKeyDigest: string = authorizationClaims.sinkKeyDigest;

void policy;
void assessor;
void material;
void control;
void decision;
void actionDispatch;
void authorizedSinkId;
void authorizedSinkKeyDigest;
void authorization;
void authorizationClaims;
void effectReceipt;
void effectSink;
void actionGateway;
void createSemanticActionAuthorizationClaimsV1;
void createSemanticActionEffectReceiptV1;
void digestSemanticOperationPayloadV1;
