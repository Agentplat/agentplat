import {
  reduceInferenceControlStateV1,
  type InferenceControlEffectV1,
  type InferenceControlInputV1,
  type InferenceControlStateV1,
} from '@agentplat/inference-control';

declare const state: InferenceControlStateV1;
declare const input: InferenceControlInputV1;
const result = reduceInferenceControlStateV1(state, input);
const effects: readonly InferenceControlEffectV1[] = result.effects;
void effects;
