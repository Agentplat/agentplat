import {
  type InferenceInterventionAdapterResultV1,
  type InferenceInterventionAdapterV1,
  type InferenceInterventionAssessorPortV1,
  type InferenceInterventionAssessmentV1,
  type InferenceInterventionSignalV1,
} from "./intervention-contracts.js";
import {
  createInferenceInterventionAdapterDescriptorV1,
  digestInferenceInterventionV1,
} from "./intervention-validation.js";

type Invoke = (
  input: Parameters<InferenceInterventionAdapterV1["invoke"]>[0],
) => Promise<InferenceInterventionAdapterResultV1>;
export function createInferenceInterventionReferenceAdapterV1(input: {
  adapterId: string;
  adapterVersion: number;
  adapterImplementationDigest: string;
  agentClass: Parameters<
    typeof createInferenceInterventionAdapterDescriptorV1
  >[0]["agentClass"];
  capabilities: Parameters<
    typeof createInferenceInterventionAdapterDescriptorV1
  >[0]["capabilities"];
  invoke: Invoke;
}): InferenceInterventionAdapterV1 {
  return Object.freeze({
    descriptor: createInferenceInterventionAdapterDescriptorV1({
      schemaVersion: 1,
      adapterId: input.adapterId,
      adapterVersion: input.adapterVersion,
      adapterImplementationDigest: input.adapterImplementationDigest,
      agentClass: input.agentClass,
      capabilities: input.capabilities,
    }),
    invoke: input.invoke,
  });
}
export function createOpaqueApiInferenceAdapterV1(
  input: Omit<
    Parameters<typeof createInferenceInterventionReferenceAdapterV1>[0],
    "agentClass" | "capabilities"
  >,
): InferenceInterventionAdapterV1 {
  return createInferenceInterventionReferenceAdapterV1({
    ...input,
    agentClass: "opaque_api_model",
    capabilities: [
      "pre_input_filter",
      "context_filter",
      "role_reinforcement",
      "output_gate",
    ],
  });
}
export function createTokenStreamInferenceAdapterV1(
  input: Omit<
    Parameters<typeof createInferenceInterventionReferenceAdapterV1>[0],
    "agentClass" | "capabilities"
  >,
): InferenceInterventionAdapterV1 {
  return createInferenceInterventionReferenceAdapterV1({
    ...input,
    agentClass: "token_stream_model",
    capabilities: [
      "pre_input_filter",
      "context_filter",
      "role_reinforcement",
      "token_assessment",
      "window_assessment",
      "output_gate",
    ],
  });
}
/** A bounded lexical assessor. It only receives supplied signal strings, never model internals. */
export function createBoundedSignalAssessorV1(input: {
  assessorId: string;
  assessorVersion: number;
  assessorImplementationDigest: string;
  blockedPhrases?: readonly string[];
  interventionPhrases?: readonly string[];
}): InferenceInterventionAssessorPortV1 {
  const blocked = (input.blockedPhrases ?? []).map((x) => x.toLowerCase());
  const intervene = (input.interventionPhrases ?? []).map((x) =>
    x.toLowerCase(),
  );
  return Object.freeze({
    assessorId: input.assessorId,
    assessorVersion: input.assessorVersion,
    assessorImplementationDigest: input.assessorImplementationDigest,
    assess({
      signal,
    }: {
      signal: InferenceInterventionSignalV1;
    }): InferenceInterventionAssessmentV1 {
      const text = signal.content.toLowerCase();
      const hitBlock = blocked.some((phrase) => text.includes(phrase));
      const hitModify =
        !hitBlock && intervene.some((phrase) => text.includes(phrase));
      const unsigned = {
        schemaVersion: 1 as const,
        assessorId: input.assessorId,
        assessorVersion: input.assessorVersion,
        assessorImplementationDigest: input.assessorImplementationDigest,
        decision: hitBlock
          ? ("block" as const)
          : hitModify
            ? ("modify" as const)
            : ("allow" as const),
        riskBps: hitBlock ? 10_000 : hitModify ? 6_000 : 0,
        uncertaintyBps: 0,
        roleCoherenceBps: 10_000,
        reasonCodes: hitBlock
          ? ["bounded_signal_block"]
          : hitModify
            ? ["bounded_signal_intervention"]
            : [],
        evidenceDigests: [signal.contentDigest],
      };
      return Object.freeze({
        ...unsigned,
        assessmentDigest: digestInferenceInterventionV1("assessment", unsigned),
      });
    },
  });
}
export function createRoleCoherenceAssessorV1(input: {
  assessorId: string;
  assessorVersion: number;
  assessorImplementationDigest: string;
  minimumSignals?: number;
}): InferenceInterventionAssessorPortV1 {
  const minimum = input.minimumSignals ?? 1;
  return Object.freeze({
    assessorId: input.assessorId,
    assessorVersion: input.assessorVersion,
    assessorImplementationDigest: input.assessorImplementationDigest,
    assess({ signal }: { signal: InferenceInterventionSignalV1 }) {
      const coherent = signal.content.trim().length >= minimum;
      const unsigned = {
        schemaVersion: 1 as const,
        assessorId: input.assessorId,
        assessorVersion: input.assessorVersion,
        assessorImplementationDigest: input.assessorImplementationDigest,
        decision: coherent ? ("allow" as const) : ("block" as const),
        riskBps: coherent ? 0 : 10_000,
        uncertaintyBps: 0,
        roleCoherenceBps: coherent ? 10_000 : 0,
        reasonCodes: coherent ? [] : ["bounded_role_signal_missing"],
        evidenceDigests: [signal.contentDigest],
      };
      return Object.freeze({
        ...unsigned,
        assessmentDigest: digestInferenceInterventionV1("assessment", unsigned),
      });
    },
  });
}
export type { InferenceInterventionSignalV1 };
