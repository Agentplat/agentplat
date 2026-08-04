import {
  createInferenceControlPortableAgentControlV1,
  type CreateInferenceControlPortableAgentControlV1,
  type InferenceControlPortableAgentControlV1,
  type PortableAgentInferenceAssessorV1,
} from "@agentplat/inference-control/portable-agent";

declare const options: CreateInferenceControlPortableAgentControlV1;
declare const assessor: PortableAgentInferenceAssessorV1;

const control: InferenceControlPortableAgentControlV1 =
  createInferenceControlPortableAgentControlV1(options);

void control;
void assessor;
