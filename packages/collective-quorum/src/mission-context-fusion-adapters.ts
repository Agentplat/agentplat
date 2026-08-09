import { createMissionObservationV1 } from "@agentplat/collective-planning";
import { digestScopeV1, type EvidenceScopeV1 } from "@agentplat/trust";

import type {
  CertifiedMissionContextResolutionV1,
  MissionContextPlanningAdapterOptionsV1,
  MissionContextFusionScopeBindingPortV1,
  MissionContextFusionScopeV1,
  MissionContextPlanningObservationInputV1,
  MissionContextPlanningPortV1,
} from "./mission-context-fusion-contracts.js";
import type { CertifiedCollectiveTrustDecisionV1 } from "./trust-consensus-contracts.js";
import { validateCertifiedCollectiveTrustDecisionV1 } from "./trust-consensus-codec.js";
import { validateCertifiedMissionContextResolutionV1 } from "./mission-context-fusion-runtime.js";

const SHA = /^sha256:[0-9a-f]{64}$/u;

/**
 * Canonical Trust binding backed by an application-owned authenticated scope
 * projection. The projection must resolve the current mission intent/revision;
 * digestScopeV1 then prevents using its certificate under a different scope.
 */
export function createCanonicalMissionContextFusionScopeBindingPortV1(input: {
  readonly project: (
    scope: MissionContextFusionScopeV1,
  ) => EvidenceScopeV1 | null | Promise<EvidenceScopeV1 | null>;
}): MissionContextFusionScopeBindingPortV1 {
  if (!input || typeof input.project !== "function")
    throw new TypeError("mission context Trust scope projection is required");
  return Object.freeze({
    verify: async ({
      scope,
      trustScopeDigest,
    }: {
      readonly scope: MissionContextFusionScopeV1;
      readonly trustScopeDigest: string;
      readonly requestDigest: string;
      readonly logicalTimeMs: number;
    }) => {
      const projected = await input.project(scope);
      return (
        projected !== null && digestScopeV1(projected) === trustScopeDigest
      );
    },
  });
}

/**
 * Planning receives only a content address. The retained resolution, current
 * head and exact collective certificate are resolved and reauthenticated at
 * the use boundary; inline caller-authored resolution objects are never used.
 */
export function createCertifiedMissionContextPlanningPortV1(
  options: MissionContextPlanningAdapterOptionsV1,
): MissionContextPlanningPortV1 {
  if (
    !options?.repository ||
    typeof options.repository.get !== "function" ||
    typeof options.repository.head !== "function" ||
    !options.certifiedDecisions ||
    typeof options.certifiedDecisions.get !== "function" ||
    !options.certification ||
    typeof options.certification.reauthenticate !== "function" ||
    !options.scopeBinding ||
    typeof options.scopeBinding.verify !== "function"
  )
    throw new TypeError(
      "certified mission context planning ports are required",
    );
  return Object.freeze({
    async observation(input: MissionContextPlanningObservationInputV1) {
      if (
        !input ||
        !SHA.test(input.resolutionDigest) ||
        !Number.isSafeInteger(input.logicalTimeMs) ||
        input.logicalTimeMs < 0
      )
        throw new TypeError("mission context planning input is invalid");
      const retained = await options.repository.get(input.resolutionDigest);
      if (!retained) return null;
      let resolution: CertifiedMissionContextResolutionV1;
      try {
        resolution = await validateCertifiedMissionContextResolutionV1(
          retained,
          options.crypto,
        );
      } catch {
        return null;
      }
      if (
        resolution.resolutionDigest !== input.resolutionDigest ||
        resolution.disposition !== "admitted" ||
        input.logicalTimeMs < resolution.certifiedAtLogicalMs ||
        input.logicalTimeMs >= resolution.validUntilLogicalMs
      )
        return null;
      const retainedHead = await options.repository.head({
        tenantId: resolution.scope.tenantId,
        missionIntentId: resolution.scope.missionIntentId,
        contextSubjectDigest: resolution.contextSubjectDigest,
      });
      if (!retainedHead) return null;
      try {
        const head = await validateCertifiedMissionContextResolutionV1(
          retainedHead,
          options.crypto,
        );
        if (head.resolutionDigest !== resolution.resolutionDigest) return null;
      } catch {
        return null;
      }
      const retainedDecision = await options.certifiedDecisions.get(
        resolution.certifiedTrustDecisionDigest,
      );
      if (!retainedDecision) return null;
      let decision: CertifiedCollectiveTrustDecisionV1;
      try {
        decision = await validateCertifiedCollectiveTrustDecisionV1(
          retainedDecision,
          options.crypto,
        );
      } catch {
        return null;
      }
      if (
        decision.decisionDigest !== resolution.certifiedTrustDecisionDigest ||
        decision.disposition !== "eligible" ||
        decision.tenantId !== resolution.scope.tenantId ||
        decision.subjectDigest !== resolution.contextSubjectDigest ||
        decision.scopeDigest !== resolution.scope.scopeDigest ||
        decision.policyId !== resolution.trustPolicyId ||
        decision.policyVersion !== resolution.trustPolicyVersion ||
        decision.policyDigest !== resolution.trustPolicyDigest ||
        decision.profileDigest !== resolution.profileDigest ||
        decision.fusionDecisionDigest !== resolution.fusionDecisionDigest ||
        decision.evidenceSetDigest !== resolution.evidenceSetDigest ||
        decision.membershipEpoch !== resolution.membershipEpoch ||
        decision.membershipConfigurationDigest !==
          resolution.membershipConfigurationDigest ||
        decision.observedAtLogicalMs !== resolution.observedAtLogicalMs ||
        decision.certifiedAtLogicalMs !== resolution.certifiedAtLogicalMs ||
        decision.validUntilLogicalMs !== resolution.validUntilLogicalMs ||
        !sameValues(decision.witnessPeerIds, resolution.witnessPeerIds)
      )
        return null;
      try {
        if (
          !(await options.scopeBinding.verify({
            scope: resolution.scope,
            trustScopeDigest: decision.scopeDigest,
            requestDigest: resolution.requestDigest,
            logicalTimeMs: input.logicalTimeMs,
          })) ||
          !(await options.certification.reauthenticate({
            resolution,
            decision,
            logicalTimeMs: input.logicalTimeMs,
          }))
        )
          return null;
      } catch {
        return null;
      }
      return createMissionObservationV1({
        schemaVersion: 1,
        observationId: input.observationId,
        missionIntentId: resolution.scope.missionIntentId,
        intentRevision: resolution.scope.intentRevision,
        intentDigest: resolution.scope.intentDigest as `sha256:${string}`,
        observerPeerId: resolution.observerPeerId,
        observerInstanceId: resolution.observerInstanceId,
        environmentCursor: resolution.environmentCursor,
        logicalTimeMs: input.logicalTimeMs,
        visibility: "public",
        observationKind: input.observationKind,
        publicValue: null,
        contentReferenceDigest:
          resolution.contextReferenceDigest as `sha256:${string}`,
      });
    },
  });
}

function sameValues(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
