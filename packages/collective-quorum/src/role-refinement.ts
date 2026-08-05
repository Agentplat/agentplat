import {
  assertRoleRefinementStateV1,
  createRoleRefinementCertificateV1,
  validateRoleRefinementCertificateV1,
  type RoleRefinementCertificateActionV1,
  type RoleRefinementCertificateV1,
  type RoleRefinementCertificationPortV1,
  type RoleRefinementPolicyV1,
  type RoleRefinementStateV1,
} from "@agentplat/inference-control/role-refinement";
import type { RoleRealignmentPolicyV1 } from "@agentplat/inference-control/role-realignment";
import type { MeshKeyResolver } from "@agentplat/mesh-crypto";
import {
  validateTrustEligibilityDecisionV1,
  type TrustEligibilityDecisionV1,
} from "@agentplat/trust";

import { verifyCollectiveAgreementCommitCertificateV1 } from "./agreement-certificates.js";
import { createCollectiveAgreementValueV1 } from "./agreement-codec.js";
import type {
  CollectiveAgreementClockV1,
  CollectiveAgreementDecisionPortV1,
  CollectiveAgreementMembershipPortV1,
  CollectiveAgreementSemanticPortV1,
} from "./agreement-contracts.js";

export interface RoleRefinementAgreementCoordinateV1 {
  readonly height: number;
  readonly round: number;
  readonly previousCommitDigest: string | null;
}

export interface RoleRefinementAgreementCoordinatePortV1 {
  resolve(input: {
    readonly policyDomainId: string;
    readonly slotId: string;
    readonly action: RoleRefinementCertificateActionV1;
    readonly requestDigest: string;
    readonly selectionDigest: string;
    readonly logicalTimeMs: number;
  }):
    | Promise<RoleRefinementAgreementCoordinateV1>
    | RoleRefinementAgreementCoordinateV1;
}

/** Only Trust-eligible commit signers count as certification witnesses. */
export interface RoleRefinementWitnessTrustPortV1 {
  evaluate(input: {
    readonly tenantId: string;
    readonly peerId: string;
    readonly instanceId: string;
    readonly action: RoleRefinementCertificateActionV1;
    readonly requestDigest: string;
    readonly selectionDigest: string;
    readonly logicalTimeMs: number;
  }):
    | Promise<TrustEligibilityDecisionV1 | null>
    | TrustEligibilityDecisionV1
    | null;
}

export interface CollectiveRoleRefinementCertificationOptionsV1 {
  readonly policyDomainId: string;
  readonly certifierId: string;
  readonly certifierVersion: number;
  readonly certifierBindingDigest: string;
  readonly realignmentPolicy: RoleRealignmentPolicyV1;
  readonly agreement: CollectiveAgreementDecisionPortV1;
  readonly membership: CollectiveAgreementMembershipPortV1;
  readonly resolver: MeshKeyResolver;
  readonly clock: CollectiveAgreementClockV1;
  readonly coordinates: RoleRefinementAgreementCoordinatePortV1;
  readonly witnessTrust: RoleRefinementWitnessTrustPortV1;
  readonly crypto?: Crypto;
}

/**
 * Converts a cryptographically verified Byzantine agreement commit into a
 * content-free publication or rollback certificate. Exact role content stays
 * in the caller's local draft and governed catalog repositories.
 */
export function createCollectiveRoleRefinementCertificationPortV1(
  options: CollectiveRoleRefinementCertificationOptionsV1,
): RoleRefinementCertificationPortV1 {
  validateOptions(options);
  return Object.freeze({
    certify: async (
      input: Parameters<RoleRefinementCertificationPortV1["certify"]>[0],
    ): Promise<RoleRefinementCertificateV1 | null> => {
      const state = assertRoleRefinementStateV1(
        input.state,
        input.policy,
        options.realignmentPolicy,
      );
      if (!certifiable(state, input.action, input.logicalTimeMs)) return null;
      if (
        input.expiresAtLogicalMs <= input.logicalTimeMs ||
        (input.action === "publish" &&
          input.expiresAtLogicalMs > state.request.expiresAtLogicalMs)
      )
        return null;
      const membership = await options.membership.current({
        policyDomainId: options.policyDomainId,
        logicalTimeMs: input.logicalTimeMs,
      });
      if (!membership) return null;
      const slotId = `role-refinement.${input.action}.${state.request.requestDigest.slice(7, 39)}`;
      const coordinate = await options.coordinates.resolve({
        policyDomainId: options.policyDomainId,
        slotId,
        action: input.action,
        requestDigest: state.request.requestDigest,
        selectionDigest: state.selection!.selectionDigest,
        logicalTimeMs: input.logicalTimeMs,
      });
      validateCoordinate(coordinate);
      const value = await createCollectiveAgreementValueV1({
        kind: "role_refinement",
        valueId: `${state.selection!.selectionId}-${input.action}`,
        previousCommitDigest: coordinate.previousCommitDigest,
        payload: roleRefinementAgreementPayloadV1(state, input.action),
        crypto: options.crypto,
      });
      const unverified = await options.agreement.decide({
        membership,
        policyDomainId: options.policyDomainId,
        slotId,
        height: coordinate.height,
        round: coordinate.round,
        value,
        logicalTimeMs: input.logicalTimeMs,
        signal: input.signal,
      });
      const commit = unverified
        ? await verifyCollectiveAgreementCommitCertificateV1({
            certificate: unverified,
            membership,
            resolver: options.resolver,
            verifiedAt: options.clock.now().wallTime,
            crypto: options.crypto,
          })
        : null;
      if (
        !commit ||
        commit.value.valueDigest !== value.valueDigest ||
        commit.committedAtLogicalMs < state.lastLogicalTimeMs ||
        commit.committedAtLogicalMs > input.logicalTimeMs ||
        commit.committedAtLogicalMs >= input.expiresAtLogicalMs ||
        commit.coordinate.membershipEpoch !== membership.epoch ||
        commit.coordinate.membershipConfigurationDigest !==
          membership.configurationDigest ||
        commit.coordinate.policyDomainId !== options.policyDomainId ||
        commit.coordinate.slotId !== slotId
      )
        return null;
      const validators = new Map(
        membership.validators.map((validator) => [validator.peerId, validator]),
      );
      const signedPeerIds = [
        ...new Set(
          commit.precommitCertificate.votes.map((vote) => vote.senderPeerId),
        ),
      ].sort(compare);
      const eligibleWitnessIds: string[] = [];
      for (const peerId of signedPeerIds) {
        const validator = validators.get(peerId);
        if (!validator) return null;
        const rawDecision = await options.witnessTrust.evaluate({
          tenantId: state.tenantId,
          peerId,
          instanceId: validator.instanceId,
          action: input.action,
          requestDigest: state.request.requestDigest,
          selectionDigest: state.selection!.selectionDigest,
          logicalTimeMs: input.logicalTimeMs,
        });
        if (!rawDecision) continue;
        try {
          const decision = validateTrustEligibilityDecisionV1(rawDecision);
          if (
            decision.disposition === "eligible" &&
            decision.evaluatedAtLogicalMs <= input.logicalTimeMs
          )
            eligibleWitnessIds.push(peerId);
        } catch {
          // Invalid or stale Trust material never contributes to quorum.
        }
      }
      const requiredWitnesses = Math.max(
        input.policy.minimumCertificationWitnesses,
        2 * membership.faultThreshold + 1,
      );
      if (eligibleWitnessIds.length < requiredWitnesses) return null;
      const selection = state.selection!;
      const certificate = createRoleRefinementCertificateV1(
        {
          certificateId: `role-refinement-${input.action}-${commit.certificateDigest.slice(7, 31)}`,
          action: input.action,
          certifierId: options.certifierId,
          certifierVersion: options.certifierVersion,
          certifierBindingDigest: options.certifierBindingDigest,
          requestDigest: state.request.requestDigest,
          selectionDigest: selection.selectionDigest,
          predecessorDefinitionDigest:
            state.request.predecessorDefinitionDigest,
          refinedDefinitionDigest: selection.selectedDefinitionDigest,
          patchDigest: selection.selectedPatchDigest,
          authorityCeilingDigest: state.request.authorityCeiling.ceilingDigest,
          activationDigest:
            input.action === "rollback"
              ? state.activation!.activationDigest
              : null,
          monitoringDigest:
            input.action === "rollback"
              ? state.monitoring!.monitoringDigest
              : null,
          witnessIds: eligibleWitnessIds,
          membershipEpoch: membership.epoch,
          membershipConfigurationDigest: membership.configurationDigest,
          sourceCertificateDigest: commit.certificateDigest,
          certifiedAtLogicalMs: commit.committedAtLogicalMs,
          expiresAtLogicalMs: input.expiresAtLogicalMs,
        },
        state,
        input.policy,
      );
      return validateRoleRefinementCertificateV1(
        certificate,
        state,
        input.policy,
      );
    },
  });
}

export interface RoleRefinementAgreementSemanticOptionsV1 {
  readonly selectionResolver: {
    validate(
      input: RoleRefinementAgreementPayloadV1 & {
        readonly logicalTimeMs: number;
      },
    ): Promise<boolean> | boolean;
  };
  readonly proposerTrust: RoleRefinementWitnessTrustPortV1;
  readonly tenantId: string;
  readonly instanceForPeer: (
    peerId: string,
  ) => Promise<string | null> | string | null;
  readonly fallback?: CollectiveAgreementSemanticPortV1;
}

/** Peer-side fail-closed semantic gate for role-refinement agreement values. */
export function createRoleRefinementAgreementSemanticPortV1(
  options: RoleRefinementAgreementSemanticOptionsV1,
): CollectiveAgreementSemanticPortV1 {
  if (
    !options?.selectionResolver ||
    typeof options.selectionResolver.validate !== "function" ||
    !options.proposerTrust ||
    typeof options.proposerTrust.evaluate !== "function" ||
    !options.tenantId ||
    typeof options.instanceForPeer !== "function" ||
    (options.fallback !== undefined &&
      typeof options.fallback.evaluate !== "function")
  )
    throw new TypeError("role refinement semantic options are required");
  return Object.freeze({
    evaluate: async (
      input: Parameters<CollectiveAgreementSemanticPortV1["evaluate"]>[0],
    ) => {
      if (input.value.kind !== "role_refinement")
        return options.fallback
          ? options.fallback.evaluate(input)
          : Object.freeze({
              accepted: false,
              reasonCode: "unsupported_value_kind",
            });
      const payload = parseRoleRefinementPayload(input.value.payload);
      if (!payload)
        return Object.freeze({
          accepted: false,
          reasonCode: "invalid_role_refinement",
        });
      const instanceId = await options.instanceForPeer(input.proposerPeerId);
      if (!instanceId)
        return Object.freeze({
          accepted: false,
          reasonCode: "proposer_instance_unavailable",
        });
      const rawDecision = await options.proposerTrust.evaluate({
        tenantId: options.tenantId,
        peerId: input.proposerPeerId,
        instanceId,
        action: payload.action,
        requestDigest: payload.requestDigest,
        selectionDigest: payload.selectionDigest,
        logicalTimeMs: input.logicalTimeMs,
      });
      if (!rawDecision)
        return Object.freeze({
          accepted: false,
          reasonCode: "proposer_trust_unavailable",
        });
      try {
        const decision = validateTrustEligibilityDecisionV1(rawDecision);
        if (
          decision.disposition !== "eligible" ||
          decision.evaluatedAtLogicalMs > input.logicalTimeMs
        )
          return Object.freeze({
            accepted: false,
            reasonCode: "proposer_not_eligible",
          });
      } catch {
        return Object.freeze({
          accepted: false,
          reasonCode: "proposer_trust_invalid",
        });
      }
      const accepted = await options.selectionResolver.validate({
        ...payload,
        logicalTimeMs: input.logicalTimeMs,
      });
      return Object.freeze({
        accepted,
        reasonCode: accepted
          ? "role_refinement_valid"
          : "role_refinement_unavailable",
      });
    },
  });
}

export interface RoleRefinementAgreementPayloadV1 {
  readonly action: RoleRefinementCertificateActionV1;
  readonly requestDigest: string;
  readonly selectionDigest: string;
  readonly selectedCandidateDigest: string;
  readonly predecessorDefinitionDigest: string;
  readonly refinedDefinitionDigest: string;
  readonly patchDigest: string;
  readonly authorityCeilingDigest: string;
  readonly activationDigest: string | null;
  readonly monitoringDigest: string | null;
  readonly stateRevision: number;
}

function roleRefinementAgreementPayloadV1(
  state: RoleRefinementStateV1,
  action: RoleRefinementCertificateActionV1,
): Readonly<Record<string, unknown>> {
  const selection = state.selection!;
  return Object.freeze({
    action,
    requestDigest: state.request.requestDigest,
    selectionDigest: selection.selectionDigest,
    selectedCandidateDigest: selection.selectedCandidateDigest,
    predecessorDefinitionDigest: state.request.predecessorDefinitionDigest,
    refinedDefinitionDigest: selection.selectedDefinitionDigest,
    patchDigest: selection.selectedPatchDigest,
    authorityCeilingDigest: state.request.authorityCeiling.ceilingDigest,
    activationDigest:
      action === "rollback" ? state.activation!.activationDigest : null,
    monitoringDigest:
      action === "rollback" ? state.monitoring!.monitoringDigest : null,
    stateRevision: state.revision,
  });
}

function parseRoleRefinementPayload(
  value: Readonly<Record<string, unknown>>,
): RoleRefinementAgreementPayloadV1 | null {
  const keys = Object.keys(value).sort();
  const expected = [
    "action",
    "activationDigest",
    "authorityCeilingDigest",
    "monitoringDigest",
    "patchDigest",
    "predecessorDefinitionDigest",
    "refinedDefinitionDigest",
    "requestDigest",
    "selectedCandidateDigest",
    "selectionDigest",
    "stateRevision",
  ];
  const action = value.action;
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index]) ||
    (action !== "publish" && action !== "rollback") ||
    !digest(value.requestDigest) ||
    !digest(value.selectionDigest) ||
    !digest(value.selectedCandidateDigest) ||
    !digest(value.predecessorDefinitionDigest) ||
    !digest(value.refinedDefinitionDigest) ||
    !digest(value.patchDigest) ||
    !digest(value.authorityCeilingDigest) ||
    !Number.isSafeInteger(value.stateRevision) ||
    (value.stateRevision as number) < 1 ||
    (action === "publish"
      ? value.activationDigest !== null || value.monitoringDigest !== null
      : !digest(value.activationDigest) || !digest(value.monitoringDigest))
  )
    return null;
  return value as unknown as RoleRefinementAgreementPayloadV1;
}

function certifiable(
  state: RoleRefinementStateV1,
  action: RoleRefinementCertificateActionV1,
  logicalTimeMs: number,
): boolean {
  return Boolean(
    state.selection &&
    logicalTimeMs >= state.lastLogicalTimeMs &&
    (action === "publish"
      ? state.status === "selected" &&
        logicalTimeMs < state.request.expiresAtLogicalMs
      : state.status === "rollback_required" &&
        state.activation &&
        state.monitoring),
  );
}

function validateOptions(
  options: CollectiveRoleRefinementCertificationOptionsV1,
): void {
  if (
    !options?.policyDomainId ||
    !options.certifierId ||
    !Number.isSafeInteger(options.certifierVersion) ||
    options.certifierVersion < 1 ||
    !digest(options.certifierBindingDigest) ||
    !options.realignmentPolicy ||
    !options.agreement ||
    typeof options.agreement.decide !== "function" ||
    !options.membership ||
    typeof options.membership.current !== "function" ||
    !options.resolver ||
    !options.clock ||
    typeof options.clock.now !== "function" ||
    !options.coordinates ||
    typeof options.coordinates.resolve !== "function" ||
    !options.witnessTrust ||
    typeof options.witnessTrust.evaluate !== "function"
  )
    throw new TypeError("role refinement certification options are required");
}

function validateCoordinate(value: RoleRefinementAgreementCoordinateV1): void {
  if (
    !value ||
    !Number.isSafeInteger(value.height) ||
    value.height < 1 ||
    !Number.isSafeInteger(value.round) ||
    value.round < 0 ||
    !(
      value.previousCommitDigest === null || digest(value.previousCommitDigest)
    ) ||
    (value.height === 1) !== (value.previousCommitDigest === null)
  )
    throw new TypeError("role refinement agreement coordinate is invalid");
}

function digest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
